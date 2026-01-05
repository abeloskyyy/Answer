const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from current directory
app.use(express.static(__dirname));

const rooms = {};

// Helper function to generate a unique room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    // console.log(`User connected: (${socket.id})`);

    socket.on('login', (name) => {
        console.log(`User connected: ${name} (${socket.id})`);
    });

    // Create Room
    socket.on('create_room', (data) => {
        const { username, avatar } = data;
        const roomId = generateRoomId();
        rooms[roomId] = {
            id: roomId,
            host: socket.id, // Track the host
            users: [{ id: socket.id, name: username, avatar: avatar || 'avatar_1.png', score: 0 }],
            gameState: 'waiting', // waiting, playing, finished
            settings: {
                gameMode: null, // null = mode selection, 'root_rush' = config
                rounds: 5,
                timePerRound: 15,
                difficulty: 'normal' // easy, normal, hard
            },
            currentRound: 0,
            question: null
        };

        socket.join(roomId);
        socket.emit('room_created', roomId);
        // Send initial settings and host status
        socket.emit('update_settings', rooms[roomId].settings);
        socket.emit('host_status', true);
        io.to(roomId).emit('update_users', rooms[roomId].users);
        console.log(`Room created: ${roomId} by ${username} (${socket.id})`);
    });

    // Join Room
    socket.on('join_room', (data) => {
        const { username, roomId, avatar } = data;
        const room = rooms[roomId];

        if (room) {
            if (room.gameState === 'playing') {
                socket.emit('error', 'Game already started! Wait for it to finish.');
                return;
            }

            room.users.push({ id: socket.id, name: username, avatar: avatar || 'avatar_1.png', score: 0 });
            socket.join(roomId);
            socket.emit('room_joined', roomId);

            // Send current settings to new joiner
            socket.emit('update_settings', room.settings);
            socket.emit('host_status', false); // Joiner is not host

            io.to(roomId).emit('update_users', room.users);
            io.to(roomId).emit('update_users', room.users);
            io.to(roomId).emit('receive_message', { user: 'System', text: `${username} joined the room.` });
            console.log(`User joined room ${roomId}: ${username} (${socket.id})`);
        } else {
            socket.emit('error', 'Room not found!');
        }
    });

    // Update Settings (Host Only)
    socket.on('update_settings', (data) => {
        const { roomId, settings } = data;
        const room = rooms[roomId];

        if (room && room.host === socket.id) {
            room.settings = { ...room.settings, ...settings };
            // Broadcast new settings to ALL players in room
            io.to(roomId).emit('update_settings', room.settings);
        }
    });

    // Request Settings (e.g., when becoming host)
    socket.on('request_settings', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            socket.emit('update_settings', room.settings);
        }
    });

    // Game Logic Helpers
    function generateQuestion(difficulty) {
        // Difficulty controls the MAGNITUDE of the number
        // Easy: 2-3 digits (100 - 999) -> Root ~10-31
        // Normal: 5-6 digits (10,000 - 999,999) -> Root ~100-999
        // Hard: 7-8 digits (1,000,000 - 99,999,999) -> Root ~1000-9999

        let min, max;
        if (difficulty === 'easy') { min = 100; max = 1000; }
        else if (difficulty === 'hard') { min = 1000000; max = 100000000; }
        else { min = 10000; max = 1000000; } // Normal

        const num = Math.floor(Math.random() * (max - min)) + min;
        const answer = Math.floor(Math.sqrt(num));
        return { question: num, answer: answer };
    }

    function concludeRound(roomId) {
        const room = rooms[roomId];
        if (!room) return;

        // Stop timer
        if (room.timer) clearInterval(room.timer);

        const correctAnswer = room.question.answer;
        const results = [];

        // Calculate differences
        room.users.forEach(user => {
            const userAnswer = room.roundAnswers[user.id];
            if (userAnswer !== undefined) {
                const diff = Math.abs(userAnswer - correctAnswer);
                results.push({
                    id: user.id,
                    name: user.name,
                    answer: userAnswer,
                    diff: diff
                });
            } else {
                // Did not answer
                results.push({
                    id: user.id,
                    name: user.name,
                    answer: null,
                    diff: Infinity
                });
            }
        });

        // Sort by diff (ascending)
        results.sort((a, b) => a.diff - b.diff);

        // Assign points based on rank
        // 1st: 100, 2nd: 80, ... min 10
        const pointsStep = 20;
        let points = 100;

        results.forEach((res, index) => {
            if (res.answer !== null) {
                const user = room.users.find(u => u.id === res.id);
                if (user) {
                    let awarded = points - (index * pointsStep);
                    if (awarded < 10) awarded = 10;
                    user.score += awarded;
                    res.awarded = awarded;
                }
            }
        });

        // Broadcast results
        io.to(roomId).emit('round_result', {
            winner: results[0].answer !== null ? results[0].name : "No one",
            correctAnswer: correctAnswer,
            rankings: results
        });

        io.to(roomId).emit('update_users', room.users);

        // Next round
        setTimeout(() => startRound(roomId), 5000);
    }

    function startRound(roomId) {
        const room = rooms[roomId];
        if (!room) return;

        room.currentRound++;
        if (room.currentRound > room.settings.rounds) {
            // Game Over
            room.gameState = 'finished';
            const sortedUsers = [...room.users].sort((a, b) => b.score - a.score);
            io.to(roomId).emit('game_over', sortedUsers);
            console.log(`Game ended in room ${roomId}. Winner: ${sortedUsers[0].name} (${sortedUsers[0].score})`);
            return;
        }

        const qData = generateQuestion(room.settings.difficulty);
        room.question = qData;
        room.roundAnswers = {}; // Reset answers

        console.log(`Room ${roomId} Round ${room.currentRound}: sqrt(${qData.question}) = ~${qData.answer}`);

        // Broadcast New Round
        io.to(roomId).emit('new_round', {
            round: room.currentRound,
            totalRounds: room.settings.rounds,
            question: qData.question,
            time: room.settings.timePerRound
        });

        // Start Server Timer
        if (room.timer) clearInterval(room.timer);
        let timeLeft = room.settings.timePerRound;

        room.timer = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                concludeRound(roomId);
            }
        }, 1000);

        console.log(`Game started/round ${room.currentRound} in room ${roomId}`);
    }

    // Start Game (Host Only)
    socket.on('start_game', (roomId) => {
        const room = rooms[roomId];
        if (room && room.host === socket.id) {
            room.gameState = 'playing';
            room.currentRound = 0;
            // Reset scores
            room.users.forEach(u => u.score = 0);
            io.to(roomId).emit('update_users', room.users); // Reset visual scores

            io.to(roomId).emit('game_started');

            // Delay slightly then start first round
            // Delay slightly then start first round
            setTimeout(() => startRound(roomId), 3200);
            console.log(`Game started request by host ${room.users[0].name} (${socket.id}) in room ${roomId}`);
        }
    });

    // Submit Answer
    socket.on('submit_answer', (data) => {
        const { roomId, answer } = data;
        const room = rooms[roomId];

        if (room && room.gameState === 'playing' && room.question) {
            // Store answer
            if (!room.roundAnswers) room.roundAnswers = {};

            if (room.roundAnswers[socket.id] !== undefined) return;

            room.roundAnswers[socket.id] = parseInt(answer);

            // Lock UI
            socket.emit('answer_confirmed');

            // Check if ALL users answered
            if (Object.keys(room.roundAnswers).length === room.users.length) {
                // All answered, end round early
                concludeRound(roomId);
            }
        }
    });

    // Send Message
    socket.on('send_message', (data) => {
        const { roomId, message, username } = data;
        if (rooms[roomId]) {
            io.to(roomId).emit('receive_message', { user: username, text: message });
        }
    });

    // Kick Player (Host Only)
    socket.on('kick_player', (data) => {
        const { roomId, targetId } = data;
        const room = rooms[roomId];

        if (room && room.host === socket.id) {
            const targetIndex = room.users.findIndex(u => u.id === targetId);
            if (targetIndex !== -1) {
                const targetUser = room.users[targetIndex];

                // 1. Notify the kicked user
                io.to(targetId).emit('kicked');

                // 2. Remove from room data
                room.users.splice(targetIndex, 1);

                // 3. Make socket leave the room
                // We need to access the socket instance of the kicked user. 
                // Since we don't have easy access to the socket object by ID here without looking up sockets,
                // rely on client-side 'kicked' handler to disconnect/reload, 
                // BUT better to force leave if possible using io.sockets.sockets.
                const targetSocket = io.sockets.sockets.get(targetId);
                if (targetSocket) {
                    targetSocket.leave(roomId);
                }

                // 4. Broadcast updates
                io.to(roomId).emit('update_users', room.users);
                io.to(roomId).emit('receive_message', { user: 'System', text: `${targetUser.name} was kicked by the host.` });
                console.log(`User kicked from room ${roomId}: ${targetUser.name} (${targetId}) by host (${socket.id})`);
            }
        }
    });

    // Leave Room
    socket.on('leave_room', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            const userIndex = room.users.findIndex(u => u.id === socket.id);
            if (userIndex !== -1) {
                const user = room.users[userIndex];
                room.users.splice(userIndex, 1);

                socket.leave(roomId);

                io.to(roomId).emit('update_users', room.users);
                io.to(roomId).emit('receive_message', { user: 'System', text: `${user.name} left the room.` });

                // If host leaves, assign new host or delete room
                if (room.users.length === 0) {
                    delete rooms[roomId];
                    console.log(`Room deleted: ${roomId}`);
                } else if (room.host === socket.id) {
                    room.host = room.users[0].id; // Assign new host
                    io.to(room.host).emit('host_status', true);
                    io.to(roomId).emit('receive_message', { user: 'System', text: `${room.users[0].name} is now the host.` });
                }
            }
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        // console.log('User disconnected:', socket.id); // Replaced below
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const userIndex = room.users.findIndex(u => u.id === socket.id);

            if (userIndex !== -1) {
                const user = room.users[userIndex];
                room.users.splice(userIndex, 1);
                io.to(roomId).emit('update_users', room.users);
                io.to(roomId).emit('receive_message', { user: 'System', text: `${user.name} left the room.` });
                console.log(`User disconnected from room ${roomId}: ${user.name} (${socket.id})`);

                // If host leaves, assign new host or delete room
                if (room.users.length === 0) {
                    delete rooms[roomId];
                    console.log(`Room deleted: ${roomId}`);
                } else if (room.host === socket.id) {
                    room.host = room.users[0].id; // Assign new host
                    io.to(room.host).emit('host_status', true);
                    io.to(roomId).emit('receive_message', { user: 'System', text: `${room.users[0].name} is now the host.` });
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Access from mobile: http://YOUR_LOCAL_IP:${PORT}`);
});

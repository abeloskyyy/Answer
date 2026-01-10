const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');

const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Enable CORS for all origins (Mobile App/Web Hosting)
app.use(cors());

// Configure Socket.IO with CORS
const io = new Server(server, {
    cors: {
        origin: "*", // Allow any origin
        methods: ["GET", "POST"]
    }
});

// Load Game Modes
const gameModes = {
    'root_rush': require('./gamemodes/RootRush'),
    'prime_master': require('./gamemodes/PrimeMaster'),
    'twenty_four': require('./gamemodes/TwentyFour'),
    'binary_blitz': require('./gamemodes/BinaryBlitz')
};

// Serve static files from current directory
app.use(express.static(__dirname));

const rooms = {};
const roomTimers = new Map(); // Store room game timers: roomId -> timeout/interval
const disconnectTimeouts = new Map(); // Store user disconnect timeouts: socketId -> timeout
const connectedUsers = new Map(); // Maps firebase UID -> socket.id for direct messaging


// API to list background music files
app.get('/api/music', (req, res) => {
    const musicDir = path.join(__dirname, 'assets', 'audio', 'bg-music');
    fs.readdir(musicDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to scan directory' });
        }
        // Filter for audio files
        const audioFiles = files.filter(file => /\.(mp3|wav|ogg|m4a)$/i.test(file));
        res.json(audioFiles);
    });
});

// Helper function to generate a unique room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    // console.log(`User connected: (${socket.id})`);

    socket.on('login', (data) => {
        const name = typeof data === 'object' ? data.name : data;
        const uuid = typeof data === 'object' ? data.uuid : 'guest-' + socket.id;

        // If it's a real user (not guest UUID pattern or has explicit isGuest flag logic if we had it), track them
        // For now, we trust the client sends their Auth UID as 'uuid' or a separate field if we want.
        // Based on scripts.js plan, we will send { name: ..., uuid: currentUser.uid }

        if (uuid && !uuid.startsWith('guest-')) {
            connectedUsers.set(uuid, socket.id);
            console.log(`Registered user ${name} [${uuid}] -> Socket ${socket.id}`);
            console.log(`Total connected users: ${connectedUsers.size}`);
        }

        console.log(`User connected: ${name} (${socket.id}) [UUID: ${uuid}]`);
    });

    // Create Room
    socket.on('create_room', (data) => {
        const { username, avatar, uuid } = data;
        const roomId = generateRoomId();
        rooms[roomId] = {
            id: roomId,
            host: socket.id, // Track the host
            users: [{
                id: socket.id,
                uuid: uuid || 'guest-' + socket.id,
                name: username,
                avatar: avatar || 'avatar_1.png',
                score: 0
            }],
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
        const { username, roomId, avatar, uuid } = data;
        const room = rooms[roomId];

        if (room) {
            if (room.gameState === 'playing') {
                socket.emit('error', 'Game already started! Wait for it to finish.');
                return;
            }

            // Check if this is a reconnection (user with same name exists)
            const existingUser = room.users.find(u => u.name === username);

            if (existingUser && existingUser.disconnected) {
                // This is a reconnection!
                console.log(`User reconnecting to room ${roomId}: ${username} (old: ${existingUser.id}, new: ${socket.id})`);

                // Cancel the disconnect timeout
                const dTimeout = disconnectTimeouts.get(socket.id) || disconnectTimeouts.get(existingUser.id);
                if (dTimeout) {
                    clearTimeout(dTimeout);
                    disconnectTimeouts.delete(socket.id);
                    disconnectTimeouts.delete(existingUser.id);
                }

                // Update the socket ID and clear disconnect flags
                existingUser.id = socket.id;
                existingUser.disconnected = false;
                delete existingUser.disconnectTime;

                socket.join(roomId);
                socket.emit('room_joined', roomId);
                socket.emit('update_settings', room.settings);
                socket.emit('host_status', room.host === socket.id);

                io.to(roomId).emit('update_users', room.users);
                io.to(roomId).emit('receive_message', { user: 'System', text: `${username} reconnected.` });
                console.log(`User successfully reconnected: ${username} (${socket.id})`);
            } else {
                // Check room size limit
                const MAX_ROOM_SIZE = 20;
                if (room.users.length >= MAX_ROOM_SIZE) {
                    socket.emit('error', `Room is full! Maximum ${MAX_ROOM_SIZE} players allowed.`);
                    return;
                }

                // New user joining
                room.users.push({
                    id: socket.id,
                    uuid: uuid || 'guest-' + socket.id,
                    name: username,
                    avatar: avatar || 'avatar_1.png',
                    score: 0
                });
                socket.join(roomId);
                socket.emit('room_joined', roomId);

                socket.emit('update_settings', room.settings);
                socket.emit('host_status', false); // Joiner is not host

                io.to(roomId).emit('update_users', room.users);
                io.to(roomId).emit('receive_message', { user: 'System', text: `${username} joined the room.` });
                console.log(`User joined room ${roomId}: ${username} (${socket.id})`);
            }
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
    // Helper to get current game mode logic
    function getGameMode(room) {
        // Use the gameMode from settings, default to 'root_rush' if not set or invalid
        const modeKey = (room.settings && room.settings.gameMode) ? room.settings.gameMode.toLowerCase() : 'root_rush';
        return gameModes[modeKey] || gameModes['root_rush'];
    }

    function concludeRound(roomId) {
        const room = rooms[roomId];
        if (!room) return;

        // Stop timer
        const timer = roomTimers.get(roomId);
        if (timer) {
            clearInterval(timer);
            roomTimers.delete(roomId);
        }

        const gameMode = getGameMode(room);
        const resultsData = gameMode.calculateResults(room);

        // Broadcast results
        io.to(roomId).emit('round_result', {
            winner: resultsData.winner,
            correctAnswer: resultsData.correctAnswer,
            rankings: resultsData.rankings,
            isTie: resultsData.isTie,
            mode: resultsData.mode,
            startTime: room.roundStartTime
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

        const gameMode = getGameMode(room);
        const qData = gameMode.generateQuestion(room.settings.difficulty);

        room.question = qData;
        room.roundAnswers = {}; // Reset answers
        room.roundStartTime = Date.now(); // Record start time for speed calculation

        // console.log(`Room ${roomId} Round ${room.currentRound}: Question generated`);

        // Broadcast New Round
        io.to(roomId).emit('new_round', {
            round: room.currentRound,
            totalRounds: room.settings.rounds,
            time: room.settings.timePerRound,
            startTime: room.roundStartTime,
            ...qData
        });

        // Start Server Timer
        const oldTimer = roomTimers.get(roomId);
        if (oldTimer) clearInterval(oldTimer);

        let timeLeft = room.settings.timePerRound;

        const timer = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                concludeRound(roomId);
            }
        }, 1000);

        roomTimers.set(roomId, timer);

        console.log(`Game started/round ${room.currentRound} in room ${roomId}`);
    }

    // Start Game (Host Only)
    socket.on('start_game', (roomId) => {
        const room = rooms[roomId];
        if (room && room.host === socket.id && room.gameState !== 'playing') {
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

            // Store raw answer with timestamp for speed-based scoring
            room.roundAnswers[socket.id] = {
                value: answer,
                time: Date.now()
            };

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

    // Firebase Admin Setup (for Notifications)
    const admin = require("firebase-admin");
    try {
        const serviceAccount = require("./service-account.json");
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Admin initialized for Notifications");
    } catch (e) {
        console.error("Failed to initialize Firebase Admin (Missing service-account.json?):", e.message);
    }

    const db = admin.firestore();

    // Helper to send FCM Notification
    async function sendPushNotification(uid, title, body, data = {}) {
        try {
            const userDoc = await db.collection('users').doc(uid).get();
            if (!userDoc.exists) return;

            const userData = userDoc.data();
            const fcmToken = userData.fcmToken;

            if (fcmToken) {
                await admin.messaging().send({
                    token: fcmToken,
                    notification: {
                        title: title,
                        body: body
                    },
                    data: data
                });
                console.log(`Notification sent to ${uid}: ${title}`);
            }
        } catch (e) {
            console.error(`Error sending notification to ${uid}:`, e.message);
        }
    }

    // Monitor Friend Requests
    db.collection('friend_requests')
        .where('status', '==', 'pending')
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const req = change.doc.data();
                    // Avoid notifying if the request is old (optional, but good practice)
                    const now = Date.now();
                    // If we had a timestamp check, we would do it here. For now, we assume active server listens to new ones.
                    // Or better: ensure we don't spam on server restart. Ideally check 'timestamp' > serverStartTime

                    // Fetch destination user name not needed for notif content usually, just "New Friend Request"
                    sendPushNotification(
                        req.to,
                        "New Friend Request",
                        `${req.fromName} wants to be friends!`
                    );
                }
            });
        });


    // ... (Existing Routes) ...

    // Invite Friend
    socket.on('invite_friend', async (data) => {
        const { targetUid, roomId, hostName, hostAvatar } = data;
        const targetSocketId = connectedUsers.get(targetUid);

        console.log(`Invite attempt: ${hostName} -> ${targetUid} for room ${roomId}`);

        if (targetSocketId) {
            io.to(targetSocketId).emit('receive_invite', {
                roomId: roomId,
                hostName: hostName,
                hostAvatar: hostAvatar
            });
            // Confirm to sender
            socket.emit('invite_result', { success: true, targetUid: targetUid });
        } else {
            console.log(`User offline, sending Push Notification to ${targetUid}`);

            // Send Push Notification
            await sendPushNotification(
                targetUid,
                "Game Invitation",
                `${hostName} invited you to play!`,
                { roomId: roomId, type: 'invite' }
            );

            socket.emit('invite_result', { success: true, targetUid: targetUid, reason: 'sent_push' });
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

                // 2. Remove the user from the room data immediately
                room.users.splice(targetIndex, 1);
                io.to(roomId).emit('update_users', room.users);

                // 3. Clear any disconnect timeouts if they were somehow active
                const dTimeout = disconnectTimeouts.get(targetId);
                if (dTimeout) {
                    clearTimeout(dTimeout);
                    disconnectTimeouts.delete(targetId);
                }

                // 4. Force disconnect the socket
                const targetSocket = io.sockets.sockets.get(targetId);
                if (targetSocket) {
                    targetSocket.disconnect(true); // true to close the underlying connection
                }

                io.to(roomId).emit('receive_message', { user: 'System', text: `${targetUser.name} was kicked by the host.` });
                console.log(`Host kicked player: ${targetUser.name} (${targetId}) in room ${roomId}`);
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
                socket.explicitLeave = true; // Mark as explicit leave to skip grace period logic if disconnect follows immediately

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
        // Skip grace period if user explicitly left the room (e.g. clicked Exit)
        if (socket.explicitLeave) return;

        // Grace period for reconnection (useful for mobile app switching)
        const DISCONNECT_GRACE_PERIOD = 40000; // 40 seconds

        for (const roomId in rooms) {
            const room = rooms[roomId];
            const userIndex = room.users.findIndex(u => u.id === socket.id);

            if (userIndex !== -1) {
                const user = room.users[userIndex];

                // If user was kicked, remove them immediately (no grace period)
                if (user.kicked) {
                    // Kicked users are already handled by the kick_player event,
                    // their socket is disconnected and removed from room.users.
                    // This path should ideally not be hit for kicked users.
                    console.log(`Kicked user's socket disconnected: ${user.name} (${socket.id})`);
                    return;
                }

                console.log(`User disconnected from room ${roomId}: ${user.name} (${socket.id}) - Grace period active`);

                // Mark user as disconnected but don't remove yet
                user.disconnected = true;
                user.disconnectTime = Date.now();

                // Set timeout to remove user if they don't reconnect
                const timeout = setTimeout(() => {
                    // Check if user is still disconnected
                    const currentUser = room.users.find(u => u.id === socket.id);
                    if (currentUser && currentUser.disconnected) {
                        // User didn't reconnect, remove them
                        const idx = room.users.findIndex(u => u.id === socket.id);
                        if (idx !== -1) {
                            room.users.splice(idx, 1);
                            io.to(roomId).emit('update_users', room.users);
                            io.to(roomId).emit('receive_message', { user: 'System', text: `${user.name} left the room.` });
                            console.log(`User removed after grace period: ${user.name} (${socket.id})`);

                            // If host leaves, assign new host or delete room
                            if (room.users.length === 0) {
                                delete rooms[roomId];
                                roomTimers.delete(roomId);
                                console.log(`Room deleted: ${roomId}`);
                            } else if (room.host === socket.id) {
                                room.host = room.users[0].id; // Assign new host
                                io.to(room.host).emit('host_status', true);
                                io.to(roomId).emit('receive_message', { user: 'System', text: `${room.users[0].name} is now the host.` });
                            }
                        }
                    }
                    disconnectTimeouts.delete(socket.id);
                }, DISCONNECT_GRACE_PERIOD);

                disconnectTimeouts.set(socket.id, timeout);
                break;
            }
        }

        // Remove from connectedUsers global map
        for (const [uid, sid] of connectedUsers.entries()) {
            if (sid === socket.id) {
                connectedUsers.delete(uid);
                console.log(`Removed local mapping for ${uid}`);
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

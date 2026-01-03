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

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('create_room', (username) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomId] = {
            users: [{ id: socket.id, name: username }],
            messages: []
        };
        socket.join(roomId);
        socket.emit('room_created', roomId); // Send ONLY the room ID
        io.to(roomId).emit('update_users', rooms[roomId].users);
        console.log(`Room created: ${roomId} by ${username}`);
    });

    socket.on('join_room', ({ username, roomId }) => {
        if (rooms[roomId]) {
            rooms[roomId].users.push({ id: socket.id, name: username });
            socket.join(roomId);
            socket.emit('room_joined', roomId); // Send ONLY the room ID
            io.to(roomId).emit('update_users', rooms[roomId].users);
            console.log(`${username} joined room ${roomId}`);
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    socket.on('send_message', ({ roomId, message, username }) => {
        if (rooms[roomId]) {
            const msgData = { user: username, text: message };
            rooms[roomId].messages.push(msgData);
            io.to(roomId).emit('receive_message', msgData);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Clean up user from rooms
        for (const roomId in rooms) {
            rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
            if (rooms[roomId].users.length === 0) {
                delete rooms[roomId]; // Delete empty room
            } else {
                io.to(roomId).emit('update_users', rooms[roomId].users);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

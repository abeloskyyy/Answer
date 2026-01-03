const socket = io();

// Background Animation
function createMathBackground() {
    const bgContainer = document.getElementById('math-background');
    const symbols = ['√', '∑', 'π', '∞', '∫', '≈', '≠', '±', '÷', '×', 'log', 'sin', 'cos', 'tan', '∂', '∆', '∇'];
    const symbolCount = 30; // Number of floating symbols

    for (let i = 0; i < symbolCount; i++) {
        const span = document.createElement('span');
        span.classList.add('math-symbol');
        span.innerText = symbols[Math.floor(Math.random() * symbols.length)];

        // Randomize properties
        const size = Math.random() * 3 + 1; // 1rem to 4rem
        span.style.fontSize = `${size}rem`;

        const left = Math.random() * 100;
        span.style.left = `${left}vw`;

        const duration = Math.random() * 20 + 10; // 10s to 30s
        span.style.animationDuration = `${duration}s`;

        const delay = Math.random() * 20; // Start immediately or later
        span.style.animationDelay = `-${delay}s`; // Negative delay starts animation mid-way

        bgContainer.appendChild(span);
    }
}

createMathBackground();

// State
let myUsername = '';
let currentRoomId = '';

// DOM Elements
const loginSection = document.getElementById('login-section');
const lobbySection = document.getElementById('lobby-section');
const roomSection = document.getElementById('room-section');

const usernameInput = document.getElementById('username');
const btnLogin = document.getElementById('btn-login');

const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const roomCodeInput = document.getElementById('room-code-input');

// Check for room code in URL on load
const urlParams = new URLSearchParams(window.location.search);
const urlRoomCode = urlParams.get('c');
if (urlRoomCode) {
    roomCodeInput.value = urlRoomCode;
}

const currentRoomCodeDisplay = document.getElementById('current-room-code');
const btnLeaveRoom = document.getElementById('btn-leave-room');
const btnCopyCode = document.getElementById('btn-copy-code');
const btnShareRoom = document.getElementById('btn-share-room');

const playerList = document.getElementById('player-list');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');


// Navigation
function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// Event Listeners

// 0. Prevent accidental leave
window.addEventListener('beforeunload', (e) => {
    if (currentRoomId) {
        e.preventDefault();
        e.returnValue = "Are you sure you want to leave the game?";
    }
});

// 1. Login
btnLogin.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (name) {
        myUsername = name;
        switchScreen('lobby-section');
    } else {
        alert('Please enter a username!');
    }
});

// 2. Create Room
btnCreateRoom.addEventListener('click', () => {
    socket.emit('create_room', myUsername);
});

// 3. Join Room
btnJoinRoom.addEventListener('click', () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code) {
        socket.emit('join_room', { username: myUsername, roomId: code });
    } else {
        alert('Please enter a room code!');
    }
});

// 4. Leave Room
btnLeaveRoom.addEventListener('click', () => {
    location.reload(); // Simple way to reset for now
});

// 5. Copy Code
btnCopyCode.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoomId).then(() => {
        const originalIcon = btnCopyCode.innerHTML;
        btnCopyCode.innerHTML = '<i class="fa-solid fa-check"></i>';
        setTimeout(() => {
            btnCopyCode.innerHTML = originalIcon;
        }, 1500);
    });
});

// 6. Share Room
btnShareRoom.addEventListener('click', () => {
    const shareUrl = `${window.location.origin}/?c=${currentRoomId}`;
    const shareData = {
        title: 'Join my Math Challenge Room!',
        text: `Play Math Challenge with me! Room Code: ${currentRoomId}`,
        url: shareUrl
    };

    if (navigator.share) {
        navigator.share(shareData);
    } else {
        // Fallback to copying full invite message
        navigator.clipboard.writeText(`Join me in Math Challenge! ${shareUrl}`);
        const originalIcon = btnShareRoom.innerHTML;
        btnShareRoom.innerHTML = '<i class="fa-solid fa-check"></i>';
        setTimeout(() => {
            btnShareRoom.innerHTML = originalIcon;
        }, 1500);
    }
});


// 7. Chat
function sendMessage() {
    const text = chatInput.value.trim();
    if (text) {
        socket.emit('send_message', { roomId: currentRoomId, message: text, username: myUsername });
        chatInput.value = '';
    }
}

btnSendChat.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});


// Socket Events

socket.on('room_created', (roomId) => {
    currentRoomId = roomId;
    currentRoomCodeDisplay.innerText = roomId;
    switchScreen('room-section');
    addSystemMessage(`Room ${roomId} created.`);
});

socket.on('room_joined', (roomId) => {
    currentRoomId = roomId;
    currentRoomCodeDisplay.innerText = roomId;
    switchScreen('room-section');
    addSystemMessage(`Joined room ${roomId}.`);
});

socket.on('update_users', (users) => {
    playerList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.innerText = user.name + (user.id === socket.id ? ' (You)' : '');
        playerList.appendChild(li);
    });
});

socket.on('receive_message', (data) => {
    const div = document.createElement('div');
    div.innerHTML = `<strong>${data.user}:</strong> ${data.text}`;
    div.style.marginBottom = '5px';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on('error', (msg) => {
    alert(msg);
});

function addSystemMessage(text) {
    const div = document.createElement('div');
    div.innerText = text;
    div.style.color = '#aaa';
    div.style.fontStyle = 'italic';
    div.style.marginBottom = '5px';
    chatMessages.appendChild(div);
}

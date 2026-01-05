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
let myAvatar = 'avatar_1.png'; // Default
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

// Avatar DOM Elements
const avatarSelectorBtn = document.getElementById('avatar-selector-btn');
const avatarDropdown = document.getElementById('avatar-dropdown');
const avatarOptions = document.querySelectorAll('.avatar-option');
const selectedAvatarPreview = document.getElementById('selected-avatar-preview');

// LOAD SAVED PROFILE
const savedUsername = localStorage.getItem('username');
const savedAvatar = localStorage.getItem('avatar');

if (savedUsername) {
    usernameInput.value = savedUsername;
    myUsername = savedUsername; // Should strictly be set on login, but useful to have
}

if (savedAvatar) {
    myAvatar = savedAvatar;
    selectedAvatarPreview.src = `assets/img/user-img/${savedAvatar}`;
    // Highlight correct option
    const avatarOptions = document.querySelectorAll('.avatar-option');
    avatarOptions.forEach(opt => {
        opt.classList.remove('selected');
        if (opt.getAttribute('data-src') === savedAvatar) {
            opt.classList.add('selected');
        }
    });
}


// MODAL SYSTEM
const modalOverlay = document.getElementById('custom-modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalBtnConfirm = document.getElementById('modal-btn-confirm');
const modalBtnCancel = document.getElementById('modal-btn-cancel');

let currentModalConfirm = null;
let currentModalCancel = null;

function showModal(title, message, onConfirm = null, onCancel = null) {
    modalTitle.innerText = title;
    modalMessage.innerHTML = message;

    // Reset display
    modalBtnCancel.style.display = onCancel ? 'inline-block' : 'none';

    // Assign handlers directly (overwriting previous ones)
    modalBtnConfirm.onclick = () => {
        modalOverlay.style.display = 'none';
        if (onConfirm) onConfirm();
    };

    if (onCancel) {
        modalBtnCancel.onclick = () => {
            modalOverlay.style.display = 'none';
            onCancel();
        };
    }

    modalOverlay.style.display = 'flex';
}

// Settings & Mode Elements
const hostControls = document.getElementById('host-controls');
const guestControls = document.getElementById('guest-controls');
const btnStartGame = document.getElementById('btn-start-game');

const modeSelectionView = document.getElementById('mode-selection-view');
const configurationView = document.getElementById('configuration-view');
const btnBackMode = document.getElementById('btn-back-mode');
const guestModeMsg = document.getElementById('guest-mode-msg');
const modeCards = document.querySelectorAll('.mode-card');

const roundsInput = document.getElementById('rounds-input');
const timeInput = document.getElementById('time-input');
const difficultyInput = document.getElementById('difficulty-input');

const roundsDisplay = document.getElementById('rounds-display');
const timeDisplay = document.getElementById('time-display');

const pRounds = document.getElementById('p-rounds');
const pTime = document.getElementById('p-time');
const pDifficulty = document.getElementById('p-difficulty');

// State
let isHost = false;
let currentSettings = {}; // Cache for instant UI updates

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

// Avatar Selection Logic

// Toggle Dropdown
avatarSelectorBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent document click from closing immediately
    avatarDropdown.classList.toggle('active');
});

// Select Avatar
avatarOptions.forEach(opt => {
    opt.addEventListener('click', () => {
        const src = opt.getAttribute('data-src');
        myAvatar = src;

        // Update Preview
        selectedAvatarPreview.src = `assets/img/user-img/${src}`;

        // Update Selected State
        avatarOptions.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');

        // Close Dropdown
        avatarDropdown.classList.remove('active');
    });
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!avatarSelectorBtn.contains(e.target) && !avatarDropdown.contains(e.target)) {
        avatarDropdown.classList.remove('active');
    }
});

// 1. Login
btnLogin.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (name) {
        btnLogin.disabled = true; // Prevent double click
        setTimeout(() => btnLogin.disabled = false, 2000); // Re-enable after delay
        myUsername = name;

        // Save to LocalStorage
        localStorage.setItem('username', name);
        localStorage.setItem('avatar', myAvatar);

        // Login event only logs on server, but we can pass avatar if we want server to know early
        socket.emit('login', name);
        switchScreen('lobby-section');
    } else {
        showModal('Error', 'Please enter a username!');
    }
});

// 2. Create Room
btnCreateRoom.addEventListener('click', () => {
    btnCreateRoom.disabled = true; // Prevent button spam
    socket.emit('create_room', { username: myUsername, avatar: myAvatar });
    setTimeout(() => btnCreateRoom.disabled = false, 5000);
});

// 3. Join Room
btnJoinRoom.addEventListener('click', () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code) {
        btnJoinRoom.disabled = true; // Prevent button spam
        socket.emit('join_room', { username: myUsername, roomId: code, avatar: myAvatar });
        setTimeout(() => btnJoinRoom.disabled = false, 2000); // Fallback re-enable
    } else {
        showModal('Error', 'Please enter a room code!');
    }
});

// 4. Leave Room
btnLeaveRoom.addEventListener('click', () => {
    showModal(
        'Leave Room',
        'Are you sure you want to leave the room?',
        () => {
            leaveRoom();
        },
        () => { } // Cancel logic
    );
});

function leaveRoom() {
    if (currentRoomId) {
        socket.emit('leave_room', currentRoomId);
        currentRoomId = null;
        isHost = false;
        // myUsername = ''; // Commented out to preserve username
        // Actually, user might want to change name, so maybe keep it but go to login?
        // Let's go to lobby for now as per "soft reset".
        // But if we go to lobby, we need a name. 'myUsername' is preserved.

        switchScreen('lobby-section'); // Go back to create/join

        // Reset specific UI elements
        lobbySettingsArea.style.display = 'block';
        gameplayArea.style.display = 'none';
        document.querySelector('.sidebar').style.display = 'flex';

        // Clear room-specific displays
        currentRoomCodeDisplay.innerText = '';
        playerList.innerHTML = '';

        // Reset any game over overlays if open
        const gameOverOverlay = document.getElementById('game-over-overlay');
        if (gameOverOverlay) gameOverOverlay.style.display = 'none';

        const roundResultsOverlay = document.getElementById('round-results-overlay');
        if (roundResultsOverlay) roundResultsOverlay.style.display = 'none';
    }
}

// 5. Copy & Share Logic
btnCopyCode.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoomId).then(() => {
        const originalIcon = btnCopyCode.innerHTML;
        btnCopyCode.innerHTML = '<i class="fa-solid fa-check"></i>';
        setTimeout(() => btnCopyCode.innerHTML = originalIcon, 1500);
    });
});

btnShareRoom.addEventListener('click', () => {
    const shareUrl = `${window.location.origin}/?c=${currentRoomId}`;
    const shareData = { title: 'Join Root Rush!', text: `Play Root Rush with me! Code: ${currentRoomId}`, url: shareUrl };
    if (navigator.share) navigator.share(shareData);
    else {
        navigator.clipboard.writeText(`Join me in Root Rush! ${shareUrl}`);
        const originalIcon = btnShareRoom.innerHTML;
        btnShareRoom.innerHTML = '<i class="fa-solid fa-check"></i>';
        setTimeout(() => btnShareRoom.innerHTML = originalIcon, 1500);
    }
});

// 6. Settings & Mode Logic
// =========================

function updateLobbyUI(settings) {
    const isModeSelected = !!settings.gameMode;

    if (!isModeSelected) {
        // Mode Selection Phase
        modeSelectionView.style.display = 'block';
        configurationView.style.display = 'none';

        if (isHost) {
            // Host sees clickable cards
            guestModeMsg.style.display = 'none';
            // Enable pointer events on cards
            document.querySelectorAll('.mode-card').forEach(c => {
                c.style.pointerEvents = 'auto';
            });
        } else {
            // Guest sees "Waiting for host..."
            guestModeMsg.style.display = 'block';
            // Disable clicks
            document.querySelectorAll('.mode-card').forEach(c => c.style.pointerEvents = 'none');
        }
    } else {
        // Configuration Phase
        modeSelectionView.style.display = 'none';
        configurationView.style.display = 'flex'; // It's a flex column
        configurationView.style.flexDirection = 'column';

        if (isHost) {
            hostControls.style.display = 'block';
            guestControls.style.display = 'none';
            btnBackMode.style.display = 'block';
        } else {
            hostControls.style.display = 'none';
            guestControls.style.display = 'block';
            btnBackMode.style.display = 'none'; // Guests can't go back

            // Update Guest Preview Values
            pRounds.innerText = `${settings.rounds} Rounds`;
            pTime.innerText = `${settings.timePerRound}s`;
            pDifficulty.innerText = settings.difficulty.charAt(0).toUpperCase() + settings.difficulty.slice(1);
        }
    }
}

// Host selects a mode
document.getElementById('mode-card-root-rush').addEventListener('click', () => {
    console.log("Mode card clicked. isHost:", isHost);
    if (!isHost) return;
    const settings = { gameMode: 'root_rush' };
    socket.emit('update_settings', { roomId: currentRoomId, settings });
});

// Host goes back
btnBackMode.addEventListener('click', () => {
    if (!isHost) return;
    // Reset mode
    socket.emit('update_settings', { roomId: currentRoomId, settings: { gameMode: null } });
});


// Settings Update (Sliders)
function emitSettingsUpdate() {
    if (!isHost) return;
    const settings = {
        rounds: parseInt(roundsInput.value),
        timePerRound: parseInt(timeInput.value),
        difficulty: difficultyInput.value
    };
    socket.emit('update_settings', { roomId: currentRoomId, settings });
}

roundsInput.addEventListener('input', () => {
    roundsDisplay.innerText = roundsInput.value;
    emitSettingsUpdate();
});

timeInput.addEventListener('input', () => {
    timeDisplay.innerText = `${timeInput.value}s`;
    emitSettingsUpdate();
});

difficultyInput.addEventListener('change', () => {
    emitSettingsUpdate();
});

// 7. Start Game
btnStartGame.addEventListener('click', () => {
    if (isHost && !btnStartGame.disabled) {
        socket.emit('start_game', currentRoomId);
    }
});

// Socket Events
// =============

socket.on('room_created', (roomId) => {
    currentRoomId = roomId;
    currentRoomCodeDisplay.innerText = roomId;
    switchScreen('room-section');
    isHost = true;
    // Initial UI State will be set by update_settings event following this
});

socket.on('room_joined', (roomId) => {
    currentRoomId = roomId;
    currentRoomCodeDisplay.innerText = roomId;
    switchScreen('room-section');
    isHost = false;
});

socket.on('host_status', (status) => {
    console.log("Host status update:", status);
    const wasHost = isHost;
    isHost = status;

    // Force UI refresh immediately with cached settings
    if (Object.keys(currentSettings).length > 0) {
        updateLobbyUI(currentSettings);
    }

    if (isHost && !wasHost) {
        // Just became host. Unlock controls immediately even before settings sync
        // to prevent "stuck" feeling.
        hostControls.style.display = 'block';
        guestControls.style.display = 'none';

        // Re-run UI update logic to show proper view (Mode vs Config)
        // We might not have 'settings' object here locally if we haven't received it yet, 
        // but 'request_settings' will fix it shortly.
        socket.emit('request_settings', currentRoomId);
    } else if (!isHost && wasHost) {
        // Lost host status
        hostControls.style.display = 'none';
        guestControls.style.display = 'block';
    }
});

socket.on('update_settings', (settings) => {
    console.log("Settings updated:", settings);
    currentSettings = settings; // Update cache
    // If we are host, ensure inputs match (in case another host set them before we became host)
    if (isHost && settings.rounds) {
        roundsInput.value = settings.rounds;
        roundsDisplay.innerText = settings.rounds;
        timeInput.value = settings.timePerRound;
        timeDisplay.innerText = `${settings.timePerRound}s`;
        difficultyInput.value = settings.difficulty;
    }

    updateLobbyUI(settings);
});

// Gameplay DOM Elements
const gameplayArea = document.getElementById('gameplay-area');
const lobbySettingsArea = document.getElementById('lobby-settings-area');
const roundBadge = document.getElementById('game-round');
const totalRoundsBadge = document.getElementById('game-total-rounds');
const questionNumber = document.getElementById('question-number');
const gameInput = document.getElementById('game-input');
const btnSubmitAnswer = document.getElementById('btn-submit-answer');
const timerBar = document.getElementById('timer-bar');
const feedbackContainer = document.getElementById('feedback-message');

let countdownInterval;

// GAMEPLAY EVENTS
socket.on('game_started', () => {
    // Switch view within Room Section
    lobbySettingsArea.style.display = 'none';
    document.querySelector('.sidebar').style.display = 'none'; // Hide sidebar during game
    gameplayArea.style.display = 'flex';
    gameInput.value = '';
    feedbackContainer.innerHTML = '';
    const waitingOverlay = document.getElementById('waiting-overlay');
    if (waitingOverlay) waitingOverlay.style.display = 'none';

    // Ensure Game Over overlay is closed (for those who didn't click Play Again)
    const gameOverOverlay = document.getElementById('game-over-overlay');
    if (gameOverOverlay) gameOverOverlay.style.display = 'none';

    // Clear question initially
    questionNumber.parentElement.classList.remove('fade-in-up');
    questionNumber.innerText = '';

    // START COUNTDOWN
    const countdownOverlay = document.getElementById('start-countdown-overlay');
    const countdownValue = document.getElementById('countdown-value');
    countdownOverlay.style.display = 'flex';

    let count = 3;
    countdownValue.innerText = count;

    // Function to handle the animation cycle
    // Function to handle the animation cycle
    const runCountdown = () => {
        // Update text
        countdownValue.innerText = count;

        // Reset animation
        countdownValue.style.animation = 'none';
        countdownValue.offsetHeight; /* trigger reflow */
        countdownValue.style.animation = 'countdownPop 1s ease-out forwards';

        if (count > 1) {
            count--;
            setTimeout(runCountdown, 1000);
        }
        // If count == 1, we stop here and let the server 'new_round' event close the overlay
        // This prevents any gap between countdown end and question appearance
    };

    runCountdown();
});

socket.on('answer_confirmed', () => {
    gameInput.disabled = true;
    btnSubmitAnswer.disabled = true;
    const waitingOverlay = document.getElementById('waiting-overlay');
    waitingOverlay.style.display = 'flex';
});

socket.on('new_round', (data) => {
    // 0. Trigger fade out for countdown
    const countdownOverlay = document.getElementById('start-countdown-overlay');
    countdownOverlay.classList.add('fade-out');
    // Hide it completely after animation ensures no interaction
    setTimeout(() => {
        countdownOverlay.style.display = 'none';
    }, 600);

    // 1. Update info
    roundBadge.innerText = data.round;
    totalRoundsBadge.innerText = data.totalRounds;

    // 2. Show question with animation
    questionNumber.parentElement.classList.remove('fade-in-up');
    void questionNumber.offsetWidth; // Trigger reflow
    questionNumber.innerText = data.question.toLocaleString(); // Format with commas
    // questionNumber.parentElement.classList.add('fade-in-up'); // DISABLED per request for snappy load

    // 3. Reset Input
    gameInput.value = '';
    gameInput.disabled = false;
    gameInput.focus();
    feedbackContainer.innerHTML = '';

    // 4. Start Timer Animation
    if (countdownInterval) clearInterval(countdownInterval);
    timerBar.style.transition = 'none';
    timerBar.style.width = '100%';
    timerBar.className = 'timer-bar'; // Reset colors

    // Force reflow
    void timerBar.offsetWidth;

    const duration = data.time;
    // CSS Transition handles the smooth decrease
    timerBar.style.transition = `width ${duration}s linear`;
    timerBar.style.width = '0%';

    // Optional: Add color changes via JS timeout or CSS
    setTimeout(() => timerBar.classList.add('warning'), duration * 0.6 * 1000);
    setTimeout(() => timerBar.classList.add('danger'), duration * 0.85 * 1000);
});

// Submit Answer
function submitAnswer() {
    const val = gameInput.value;
    if (val) {
        socket.emit('submit_answer', { roomId: currentRoomId, answer: val });
        gameInput.value = ''; // Clear for next attempt or wait
        gameInput.focus();
    }
}

btnSubmitAnswer.addEventListener('click', submitAnswer);
gameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitAnswer();
});

socket.on('answer_feedback', (data) => {
    if (!data.correct) {
        feedbackContainer.innerText = "Wrong!";
        feedbackContainer.className = "feedback-message feedback-error";
        gameplayArea.classList.add('shake');
        setTimeout(() => gameplayArea.classList.remove('shake'), 500);
    }
});

socket.on('round_result', (data) => {
    // Stop local timer
    if (countdownInterval) clearInterval(countdownInterval);

    // Stop bar visually
    const computedWidth = getComputedStyle(timerBar).width;
    timerBar.style.transition = 'none';
    timerBar.style.width = computedWidth;

    // Disable input
    gameInput.disabled = true;
    btnSubmitAnswer.disabled = true;

    // Hide waiting overlay if visible
    const waitingOverlay = document.getElementById('waiting-overlay');
    waitingOverlay.style.display = 'none';

    // Get overlay elements
    const overlay = document.getElementById('round-results-overlay');
    const correctAnswerEl = document.getElementById('result-correct-answer');
    const winnerSection = document.getElementById('winner-section');
    const winnerNameEl = document.getElementById('result-winner-name');
    const rankingsList = document.getElementById('rankings-list');
    const countdownEl = document.getElementById('next-round-countdown');

    // Set correct answer
    correctAnswerEl.innerText = data.correctAnswer.toLocaleString();

    // Set winner
    if (data.winner === "No one") {
        winnerSection.classList.add('no-winner');
        winnerNameEl.innerText = "No one answered in time!";
        winnerSection.querySelector('.winner-label').style.display = 'none';
        winnerSection.querySelector('i').style.display = 'none';
    } else {
        winnerSection.classList.remove('no-winner');
        winnerNameEl.innerText = data.winner;
        winnerSection.querySelector('.winner-label').style.display = 'inline';
        winnerSection.querySelector('i').style.display = 'block';
    }

    // Build rankings list
    rankingsList.innerHTML = '';
    if (data.rankings && data.rankings.length > 0) {
        data.rankings.forEach((r, index) => {
            const isMe = (r.id === socket.id);
            const isFirst = index === 0;

            const row = document.createElement('div');
            row.className = 'ranking-row';
            if (isMe) row.classList.add('my-rank');
            if (isFirst) row.classList.add('first-place');

            const rankNum = document.createElement('div');
            rankNum.className = 'rank-number';
            rankNum.innerText = `#${index + 1}`;

            const playerName = document.createElement('div');
            playerName.className = 'player-name';
            playerName.innerText = r.name + (isMe ? ' (You)' : '');

            const answer = document.createElement('div');
            answer.className = 'player-answer';
            answer.innerText = r.answer !== null ? r.answer : '-';

            const diff = document.createElement('div');
            diff.className = 'answer-diff';
            diff.innerText = (r.diff !== null && r.diff !== undefined && r.diff !== Infinity) ? `±${r.diff}` : '-';

            const points = document.createElement('div');
            points.className = 'points-earned';
            points.innerText = r.awarded ? `+${r.awarded}` : '0';

            row.appendChild(rankNum);
            row.appendChild(playerName);
            row.appendChild(answer);
            row.appendChild(diff);
            row.appendChild(points);

            rankingsList.appendChild(row);
        });
    }

    // Show overlay
    overlay.style.display = 'flex';

    // Countdown to next round (5 seconds)
    let countdown = 5;
    countdownEl.innerText = countdown;

    const intervalId = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            countdownEl.innerText = countdown;
        } else {
            clearInterval(intervalId);
        }
    }, 1000);

    // Hide overlay after 5 seconds (just before next round starts)
    setTimeout(() => {
        overlay.style.display = 'none';
        // Re-enable input for next round
        gameInput.disabled = false;
        btnSubmitAnswer.disabled = false;
    }, 4800); // Slightly before the 5s server delay
});

socket.on('game_over', (sortedUsers) => {
    // Hide other screens
    gameplayArea.style.display = 'none';
    lobbySettingsArea.style.display = 'none';
    const roundResultsOverlay = document.getElementById('round-results-overlay');
    if (roundResultsOverlay) roundResultsOverlay.style.display = 'none';

    // Show Game Over Overlay
    const gameOverOverlay = document.getElementById('game-over-overlay');
    gameOverOverlay.style.display = 'flex';

    // Populate Podium
    const top3 = sortedUsers.slice(0, 3);

    // Reset podium
    ['1', '2', '3'].forEach(i => {
        document.getElementById(`podium-name-${i}`).innerText = '-';
        document.getElementById(`podium-score-${i}`).innerText = '-';
        document.querySelector(`.podium-place.first`).style.visibility = 'hidden';
        document.querySelector(`.podium-place.second`).style.visibility = 'hidden';
        document.querySelector(`.podium-place.third`).style.visibility = 'hidden';
    });

    // Valid places map
    const places = ['first', 'second', 'third'];

    top3.forEach((user, index) => {
        const placeClass = places[index];
        const rank = index + 1;

        const placeEl = document.querySelector(`.podium-place.${placeClass}`);
        if (placeEl) {
            placeEl.style.visibility = 'visible';
            document.getElementById(`podium-name-${rank}`).innerText = user.name;
            document.getElementById(`podium-score-${rank}`).innerText = `${user.score} pts`;

            // Update Avatar
            const avatarContainer = placeEl.querySelector('.podium-avatar');
            avatarContainer.innerHTML = ''; // Clear default icon
            const img = document.createElement('img');
            img.src = `assets/img/user-img/${user.avatar || 'avatar_1.png'}`;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '50%';
            avatarContainer.appendChild(img);
        }
    });
    // Start Confetti
    startConfetti();
});

// Play Again Button (Individual)
document.getElementById('btn-play-again').addEventListener('click', () => {
    // Hide game over overlay
    const gameOverOverlay = document.getElementById('game-over-overlay');
    if (gameOverOverlay) gameOverOverlay.style.display = 'none';

    // Hide gameplay area
    gameplayArea.style.display = 'none';

    // Show lobby/settings area
    lobbySettingsArea.style.display = 'block';

    // Show sidebar (players)
    document.querySelector('.sidebar').style.display = 'flex';

    // Re-enable Start Game button if host
    if (isHost) {
        const players = document.querySelectorAll('#player-list li');
        if (players.length >= 2) {
            btnStartGame.disabled = false;
        } else {
            btnStartGame.disabled = true;
        }
    }
});

// Back to Lobby Button
document.getElementById('btn-back-lobby').addEventListener('click', () => {
    currentRoomId = null; // Prevent beforeunload prompt
    window.location.reload(); // Simple reload as before
});

// Simple Confetti Implementation
function startConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = [];
    const numberOfPieces = 200;
    const colors = ['#f1c40f', '#e74c3c', '#8e44ad', '#3498db', '#2ecc71'];

    function randomColor() {
        return colors[Math.floor(Math.random() * colors.length)];
    }

    function update() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pieces.forEach(p => {
            p.y += p.gravity;
            p.x += p.wind; // Add wind
            p.rotation += p.rotationSpeed;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();

            if (p.y > canvas.height) {
                p.y = -20;
                p.x = Math.random() * canvas.width;
            }
        });
        requestAnimationFrame(update);
    }

    // Init
    for (let i = 0; i < numberOfPieces; i++) {
        pieces.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            size: Math.random() * 10 + 5,
            color: randomColor(),
            gravity: Math.random() * 3 + 2, // Speed
            wind: (Math.random() - 0.5) * 2, // Wind
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 0.2
        });
    }

    update();
}


// Update player list
socket.on('update_users', (users) => {
    playerList.innerHTML = '';

    users.forEach(user => {
        const li = document.createElement('li');

        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.style.justifyContent = 'space-between';

        const leftSide = document.createElement('div');
        leftSide.style.display = 'flex';
        leftSide.style.alignItems = 'center';
        leftSide.style.gap = '10px';

        // Avatar
        const avatarImg = document.createElement('img');
        avatarImg.src = `assets/img/user-img/${user.avatar || 'avatar_1.png'}`;
        avatarImg.style.width = '30px';
        avatarImg.style.height = '30px';
        avatarImg.style.borderRadius = '50%';
        avatarImg.style.objectFit = 'cover';
        avatarImg.style.border = '2px solid #fff';
        avatarImg.style.boxShadow = '0 0 0 1px #dfe6e9';

        const nameSpan = document.createElement('span');
        nameSpan.innerText = user.name + (user.id === socket.id ? ' (You)' : '');

        leftSide.appendChild(avatarImg);
        leftSide.appendChild(nameSpan);

        li.appendChild(leftSide);

        if (users[0].id === user.id) { // Show who is host
            const crown = document.createElement('i');
            crown.className = 'fas fa-crown';
            crown.title = 'Host';
            crown.style.marginLeft = '8px';
            crown.style.color = '#f1c40f';
            leftSide.appendChild(crown);
        }

        // Host kicking logic
        // If I am host, and this user is NOT me, show kick button
        if (isHost && user.id !== socket.id) {
            const kickBtn = document.createElement('button');
            kickBtn.className = 'btn-kick-player'; // Match CSS
            kickBtn.innerHTML = '<i class="fas fa-user-times"></i>'; // Icon for kick
            kickBtn.title = `Kick ${user.name}`;

            kickBtn.onclick = (e) => {
                e.stopPropagation();
                showModal(
                    'Kick Player',
                    `Are you sure you want to kick <b>${user.name}</b>?`,
                    () => {
                        socket.emit('kick_player', { roomId: currentRoomId, targetId: user.id });
                    },
                    () => { } // Enable cancel button
                );
            };
            li.appendChild(kickBtn);
        }

        playerList.appendChild(li);
    });

    // Start Button Logic
    if (isHost) {
        if (users.length >= 2) { // Min 2 players required
            btnStartGame.disabled = false;
        } else {
            btnStartGame.disabled = true;
        }
    }
});

socket.on('error', (msg) => {
    showModal('Error', msg);
    // Re-enable buttons immediately so user can try again
    btnJoinRoom.disabled = false;
    btnCreateRoom.disabled = false;
    btnLogin.disabled = false;
});

socket.on('kicked', () => {
    currentRoomId = null; // Prevent beforeunload prompt
    showModal('Disconnected', 'You have been kicked from the room by the host.', () => {
        location.reload();
    });
});


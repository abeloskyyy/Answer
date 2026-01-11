// Use configured server URL or default to window origin (automatic for web, manual for mobile)
const APP_VERSION = '1.0.0'; // IMPORTANT: Keep this in sync with config.xml version


const SERVER_URL = (window.GAME_CONFIG && window.GAME_CONFIG.SERVER_URL) ? window.GAME_CONFIG.SERVER_URL : undefined;

const socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'], // Try websocket first, then polling
    reconnection: true,
    reconnectionAttempts: 10,
    timeout: 10000,
    forceNew: true
});

// Reconnection handling for mobile app switching
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);

    // Don't try to reconnect if it was intentional
    if (reason === 'io client disconnect') {
        return;
    }

    // Show reconnecting message if in a room
    if (currentRoomId) {
        showReconnectingMessage();
    }
});

socket.on('connect', () => {
    console.log('Socket connected');
    reconnectAttempts = 0;
    hideReconnectingMessage();

    // Hide Server Loading Screen if visible
    const serverLoadingScreen = document.getElementById('server-loading-screen');
    if (serverLoadingScreen && serverLoadingScreen.style.display !== 'none') {
        serverLoadingScreen.classList.add('fade-out');
        setTimeout(() => {
            serverLoadingScreen.style.display = 'none';
            serverLoadingScreen.classList.remove('fade-out'); // clean up
        }, 500);
    }

    // Emit login to ensure server knows our UUID (for reconnecting mobile users)
    if (myUsername && myUUID) {
        socket.emit('login', { name: myUsername, uuid: myUUID });
    }

    // If we were in a room, try to rejoin
    if (currentRoomId && myUsername) {
        console.log('Attempting to rejoin room:', currentRoomId);
        socket.emit('join_room', {
            username: myUsername,
            roomId: currentRoomId,
            avatar: myAvatar,
            uuid: myUUID
        });
    }
});

socket.on('reconnect_attempt', (attemptNumber) => {
    reconnectAttempts = attemptNumber;
    console.log(`Reconnection attempt ${attemptNumber}/${MAX_RECONNECT_ATTEMPTS}`);

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        showModal(
            'Connection Lost',
            'Unable to reconnect to the server. Please refresh the page.',
            () => location.reload()
        );
    }
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
});

// Reconnecting message UI
function showReconnectingMessage() {
    let reconnectMsg = document.getElementById('reconnect-message');
    if (!reconnectMsg) {
        reconnectMsg = document.createElement('div');
        reconnectMsg.id = 'reconnect-message';
        reconnectMsg.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #f39c12;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-weight: 600;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideDown 0.3s ease-out;
        `;
        reconnectMsg.innerHTML = '<i class="fas fa-sync fa-spin"></i> Reconnecting...';
        document.body.appendChild(reconnectMsg);
    }
    reconnectMsg.style.display = 'block';
}

// FRIENDS SYSTEM LOGIC (Appended)

const searchFriendInput = document.getElementById('search-friend-input');
const btnSendFriendRequest = document.getElementById('btn-send-friend-request');
const addFriendFeedback = document.getElementById('add-friend-feedback');
const reqBadge = document.getElementById('req-badge');
const requestsListContainer = document.getElementById('requests-list-container');
const friendsListContainer = document.getElementById('friends-list-container');

// Send Request
if (btnSendFriendRequest) {
    btnSendFriendRequest.addEventListener('click', async () => {
        const targetUsername = searchFriendInput.value.trim();
        if (!targetUsername) return;

        if (targetUsername.toLowerCase() === (currentUser.displayName || '').toLowerCase()) {
            showFeedback(addFriendFeedback, 'You cannot add yourself.', 'error');
            return;
        }

        addFriendFeedback.textContent = 'Searching...';
        try {
            // 1. Find User by Username (Case insensitive ideally, but exact for now)
            const querySnapshot = await db.collection('users')
                .where('usernameLower', '==', targetUsername.toLowerCase())
                .limit(1)
                .get();

            if (querySnapshot.empty) {
                showFeedback(addFriendFeedback, 'User not found.', 'error');
                return;
            }

            const targetUserDoc = querySnapshot.docs[0];
            const targetUserData = targetUserDoc.data();

            // 2. Send Request
            await db.collection('friend_requests').add({
                from: currentUser.uid,
                fromName: currentUser.displayName,
                fromPhoto: currentUser.photoURL,
                to: targetUserData.uid,
                status: 'pending',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            showFeedback(addFriendFeedback, `Request sent to ${targetUserData.username}!`, 'success');
            searchFriendInput.value = '';

        } catch (error) {
            console.error('Error sending request:', error);
            showFeedback(addFriendFeedback, 'Error sending request.', 'error');
        }
    });
}

function showFeedback(el, msg, type) {
    el.textContent = msg;
    el.className = `feedback-msg ${type}`;
    setTimeout(() => {
        el.textContent = '';
        el.className = 'feedback-msg';
    }, 3000);
}

// Listen for Incoming Requests
let requestsUnsubscribe = null;
function listenForFriendRequests() {
    if (!currentUser) return Promise.resolve();
    if (requestsUnsubscribe) requestsUnsubscribe(); // Clear prev

    return new Promise((resolve) => {
        let firstLoad = true;
        requestsUnsubscribe = db.collection('friend_requests')
            .where('to', '==', currentUser.uid)
            .where('status', '==', 'pending')
            .onSnapshot(async (snapshot) => {
                const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                await updateRequestsUI(requests);
                if (firstLoad) {
                    firstLoad = false;
                    resolve();
                }
            }, (error) => {
                console.error("Requests listener error:", error);
                resolve(); // Don't block loading on error
            });
    });
}

async function updateRequestsUI(requests) {
    const gBadge = document.getElementById('global-req-badge');
    if (reqBadge) {
        reqBadge.textContent = requests.length;
        reqBadge.style.display = requests.length > 0 ? 'inline-block' : 'none';
    }
    if (gBadge) {
        gBadge.textContent = requests.length;
        gBadge.style.display = requests.length > 0 ? 'inline-block' : 'none';
    }

    if (requestsListContainer) {
        requestsListContainer.innerHTML = '';
        if (requests.length === 0) {
            requestsListContainer.innerHTML = '<p class="empty-state">No pending requests.</p>';
            return;
        }

        // Fetch fresh details for requesters
        const requestsWithDetails = await Promise.all(requests.map(async (req) => {
            try {
                const userDoc = await db.collection('users').doc(req.from).get();
                if (userDoc.exists) {
                    return { ...req, ...userDoc.data() };
                }
                return req;
            } catch (e) {
                return req;
            }
        }));

        requestsWithDetails.forEach(req => {
            const item = document.createElement('div');
            item.className = 'friend-item';
            item.innerHTML = `
                <img src="assets/img/user-img/${req.photoURL || 'avatar_1.png'}" class="friend-avatar">
                <div class="friend-info">
                    <span class="friend-name">${req.username || req.fromName}</span>
                    <span class="friend-status">Wants to be friends</span>
                </div>
                <div class="request-actions">
                    <button class="btn-accept" title="Accept"><i class="fa-solid fa-check"></i></button>
                    <button class="btn-decline" title="Decline"><i class="fa-solid fa-xmark"></i></button>
                </div>
            `;

            // Actions
            item.querySelector('.btn-accept').addEventListener('click', () => acceptRequest(req));
            item.querySelector('.btn-decline').addEventListener('click', () => declineRequest(req.id));

            requestsListContainer.appendChild(item);
        });
    }
}

// Accept Request
async function acceptRequest(req) {
    try {
        const batch = db.batch();

        // 1. Add to My Friends
        const myFriendRef = db.collection('users').doc(currentUser.uid).collection('friends').doc(req.from);
        batch.set(myFriendRef, {
            uid: req.from,
            username: req.fromName, // Ideally fetch fresh, but this is ok
            photoURL: req.fromPhoto,
            since: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 2. Add Me to Their Friends
        const theirFriendRef = db.collection('users').doc(req.from).collection('friends').doc(currentUser.uid);
        batch.set(theirFriendRef, {
            uid: currentUser.uid,
            username: currentUser.displayName,
            photoURL: currentUser.photoURL,
            since: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 3. Delete Request
        const reqRef = db.collection('friend_requests').doc(req.id);
        batch.delete(reqRef);

        await batch.commit();
        console.log('Friend request accepted!');
    } catch (e) {
        console.error('Error accepting friend:', e);
    }
}

async function declineRequest(reqId) {
    try {
        await db.collection('friend_requests').doc(reqId).delete();
    } catch (e) { console.error(e); }
}

// Listen for My Friends
let friendsUnsubscribe = null;
function listenForFriends() {
    if (!currentUser) return Promise.resolve();
    if (friendsUnsubscribe) friendsUnsubscribe();

    return new Promise((resolve) => {
        let firstLoad = true;
        friendsUnsubscribe = db.collection('users').doc(currentUser.uid).collection('friends')
            .onSnapshot(async snapshot => {
                const friends = snapshot.docs.map(doc => doc.data());
                await updateFriendsListUI(friends);
                if (firstLoad) {
                    firstLoad = false;
                    resolve();
                }
            }, (error) => {
                console.error("Friends listener error:", error);
                resolve();
            });
    });
}

let friendDetailUnsubscribers = [];
let lastFriendsList = []; // Store for auto-refresh
async function updateFriendsListUI(friends) {
    lastFriendsList = friends;
    // Clear previous detail listeners to avoid memory leaks/multisync
    friendDetailUnsubscribers.forEach(unsub => unsub());
    friendDetailUnsubscribers = [];

    // Update Count Indicators
    const count = friends.length;
    const mainCount = document.getElementById('main-friends-count');
    const tabCount = document.getElementById('tab-friends-count');
    const summaryCount = document.getElementById('friends-count-summary');

    if (mainCount) mainCount.textContent = count > 0 ? `(${count})` : '';
    if (tabCount) tabCount.textContent = count > 0 ? `(${count})` : '';
    if (summaryCount) summaryCount.textContent = count === 1 ? 'You have 1 friend' : `You have ${count} friends`;

    if (friendsListContainer) {
        friendsListContainer.innerHTML = '';
        if (friends.length === 0) {
            friendsListContainer.innerHTML = '<p class="empty-state">No friends yet. Add some!</p>';
            return;
        }

        // For each friend, create a container and listen to their global user doc
        friends.forEach(f => {
            const item = document.createElement('div');
            item.className = 'friend-item';
            item.id = `friend-item-${f.uid}`;
            friendsListContainer.appendChild(item);

            const unsub = db.collection('users').doc(f.uid).onSnapshot(doc => {
                if (!doc.exists) return;
                const data = doc.data();
                renderFriendItem(item, data, f.uid);
            });
            friendDetailUnsubscribers.push(unsub);
        });
    }
}

// Helper to render friend item (used by real-time listener and auto-refresh)
function renderFriendItem(container, data, friendUid) {
    let statusText = 'Offline';
    let statusClass = '';

    const now = new Date();
    const lastActiveDate = data.lastActive?.toDate() || new Date(0);
    const diffSec = Math.floor((now - lastActiveDate) / 1000);
    const diffMin = Math.floor(diffSec / 60);

    // 1. Determine if they are Online/Away
    if (data.isOnline && diffSec < 90) {
        statusText = 'Online';
        statusClass = 'online';
    } else if (data.isOnline && diffSec < 300) {
        statusText = 'Away';
    }
    // 2. If not Online/Away, show "Last seen"
    else if (data.lastActive) {
        if (diffMin < 1) statusText = 'Last seen: Just now';
        else if (diffMin < 60) statusText = `Last seen: ${diffMin}m ago`;
        else if (diffMin < 1440) statusText = `Last seen: ${Math.floor(diffMin / 60)}h ago`;
        else statusText = `Last seen: ${lastActiveDate.toLocaleDateString()}`;
    }

    container.innerHTML = `
        <img src="assets/img/user-img/${data.photoURL || 'avatar_1.png'}" class="friend-avatar ${statusClass}">
        <div class="friend-info">
            <span class="friend-name">${data.username}</span>
            <span class="friend-status ${statusClass}">${statusText}</span> 
        </div>
        <button class="btn-icon-small btn-remove-friend" title="Remove Friend"><i class="fa-solid fa-user-minus"></i></button>
    `;

    container.querySelector('.btn-remove-friend').onclick = () => {
        showModal(
            'Remove Friend',
            `Are you sure you want to remove <strong>${data.username}</strong> from your friends list?`,
            () => removeFriend(friendUid),
            () => { },
            'Yes, remove',
            'No'
        );
    };
}

// Auto-refresh UI every 30s to update "Last seen" and Online status without snapshot
setInterval(() => {
    // No logic needed here yet, snapshot handles most updates
}, 30000);

async function removeFriend(friendUid) {
    // Remove from both sides
    try {
        const batch = db.batch();
        batch.delete(db.collection('users').doc(currentUser.uid).collection('friends').doc(friendUid));
        batch.delete(db.collection('users').doc(friendUid).collection('friends').doc(currentUser.uid));
        await batch.commit();
    } catch (e) { console.error(e); }
}

function hideReconnectingMessage() {
    const reconnectMsg = document.getElementById('reconnect-message');
    if (reconnectMsg) {
        reconnectMsg.style.display = 'none';
    }
}

// Background Music System
class MusicManager {
    constructor() {
        this.playlist = [];
        this.audio = new Audio();
        this.audio.volume = 0;
        this.currentIndex = -1;
        this.isMuted = localStorage.getItem('musicMuted') === 'true';
        this.isStarted = false;
        this.fadeDuration = 1000; // 1 second fade
        this.duckVolume = 0.15;
        this.normalVolume = 0.4;
        this.duckCount = 0;
        this.isDucked = false;

        this.audio.addEventListener('ended', () => this.playNext());

        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());

        this.fetchPlaylist();
    }

    async fetchPlaylist() {
        try {
            const baseUrl = (window.GAME_CONFIG && window.GAME_CONFIG.SERVER_URL) ? window.GAME_CONFIG.SERVER_URL : '';
            // Remove trailing slash if present to avoid double slash with /api
            const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
            const response = await fetch(`${cleanBase}/api/music`);
            this.playlist = await response.json();
            if (this.playlist.length > 0) {
                this.shufflePlaylist();
                // If the user already interacted, start playing now
                if (this.isStarted && this.audio.paused) {
                    this.playNext();
                }
            }
        } catch (error) {
            console.error('Error fetching playlist:', error);
        }
    }

    shufflePlaylist() {
        for (let i = this.playlist.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.playlist[i], this.playlist[j]] = [this.playlist[j], this.playlist[i]];
        }
    }

    playNext() {
        if (this.playlist.length === 0) return;

        this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
        if (this.currentIndex === 0) this.shufflePlaylist();

        const trackName = this.playlist[this.currentIndex];
        this.audio.src = `assets/audio/bg-music/${trackName}`;
        this.audio.volume = 0; // Start at 0 for fade in
        this.audio.play().then(() => {
            this.fadeIn();
        }).catch(err => {
            console.log('Autoplay blocked or error:', err);
            this.isStarted = false; // Reset to allow retry on next click
        });
    }

    fadeIn() {
        if (this.isMuted) {
            this.audio.volume = 0;
            return;
        }

        const interval = 50;
        const step = interval / this.fadeDuration;
        const targetVol = this.isDucked ? this.duckVolume : this.normalVolume;

        if (this.fadeInterval) clearInterval(this.fadeInterval);

        this.fadeInterval = setInterval(() => {
            if (this.audio.volume < targetVol) {
                this.audio.volume = Math.min(this.audio.volume + step, targetVol);
            } else {
                this.audio.volume = Math.max(this.audio.volume - step, targetVol);
            }
            if (this.audio.volume === targetVol) clearInterval(this.fadeInterval);
        }, interval);
    }

    duck() {
        if (this.isMuted) return;
        this.duckCount++;
        if (this.isDucked) return;

        this.isDucked = true;
        this.fadeTo(this.duckVolume, 200);
    }

    unduck() {
        if (this.isMuted) return;
        this.duckCount = Math.max(0, this.duckCount - 1);
        if (this.duckCount > 0 || !this.isDucked) return;

        this.isDucked = false;
        this.fadeTo(this.normalVolume, 300);
    }

    fadeTo(target, duration) {
        if (this.fadeInterval) clearInterval(this.fadeInterval);
        const interval = 30;
        const steps = duration / interval;
        const stepAmt = (target - this.audio.volume) / steps;

        this.fadeInterval = setInterval(() => {
            let newVol = this.audio.volume + stepAmt;
            if ((stepAmt > 0 && newVol >= target) || (stepAmt < 0 && newVol <= target)) {
                this.audio.volume = target;
                clearInterval(this.fadeInterval);
            } else {
                this.audio.volume = newVol;
            }
        }, interval);
    }

    fadeOut(callback) {
        const interval = 50;
        const step = interval / this.fadeDuration;

        if (this.fadeInterval) clearInterval(this.fadeInterval);

        this.fadeInterval = setInterval(() => {
            this.audio.volume = Math.max(this.audio.volume - step, 0);
            if (this.audio.volume <= 0) {
                clearInterval(this.fadeInterval);
                if (callback) callback();
            }
        }, interval);
    }

    start() {
        if (this.isStarted) return;
        this.isStarted = true;
        if (this.playlist.length > 0) {
            this.playNext();
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        localStorage.setItem('musicMuted', this.isMuted);

        if (this.isMuted) {
            this.fadeOut();
        } else {
            this.fadeIn();
        }

        return this.isMuted;
    }

    handleVisibilityChange() {
        if (!this.isStarted) return;

        if (document.visibilityState === 'hidden') {
            this.fadeOut(() => {
                this.audio.pause();
            });
        } else if (document.visibilityState === 'visible') {
            if (!this.isMuted) {
                this.audio.play().then(() => {
                    this.fadeIn();
                }).catch(err => console.log('Resume blocked:', err));
            }
        }
    }

    stop() {
        this.fadeOut(() => {
            this.audio.pause();
            this.audio.currentTime = 0;
            this.isStarted = false;
        });
    }
}

// SFX System
const sfxClick = new Audio('assets/audio/sfx/btn-click.wav');
const sfxCount = new Audio('assets/audio/sfx/3sec-count.mp3');
const sfxTicTac = new Audio('assets/audio/sfx/tictac.mp3');
const sfxGoodAns = new Audio('assets/audio/sfx/good-ans.mp3');
const sfxBadAns = new Audio('assets/audio/sfx/bad-ans.mp3');
const sfxPlayerEnter = new Audio('assets/audio/sfx/player-enter.mp3');
const sfxApplause = new Audio('assets/audio/sfx/applause.mp3');

// Configure SFX
sfxTicTac.loop = true;
sfxBadAns.playbackRate = 1.5;

let ticTacTimeout = null;
let applauseFadeInterval = null;
let applauseTimeout = null;

function playSFX(audio) {
    if (musicManager.isMuted) return;

    // Duck music (EXCEPT for clicks)
    if (audio !== sfxClick) {
        musicManager.duck();
    }

    const isPersistent = (audio === sfxTicTac || audio === sfxApplause);
    const sound = isPersistent ? audio : audio.cloneNode();

    if (audio === sfxBadAns) sound.playbackRate = 1.5;
    sound.volume = 0.5;

    // Unduck when one-shot sound ends
    if (!isPersistent) {
        sound.addEventListener('ended', () => {
            if (audio !== sfxClick) {
                musicManager.unduck();
            }
        });
    }

    sound.play().catch(err => {
        console.log('SFX blocked:', err);
        if (audio !== sfxClick) {
            musicManager.unduck();
        }
    });
    return sound;
}

function stopSFX(audio) {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0.5; // Reset volume for next play

    // Unduck if it was a persistent sound that we manually stopped
    if (audio === sfxTicTac || audio === sfxApplause) {
        musicManager.unduck();
    }
}

function stopAllSounds() {
    if (musicManager) musicManager.stop();
    if (ticTacTimeout) clearTimeout(ticTacTimeout);
    if (applauseTimeout) clearTimeout(applauseTimeout);
    if (applauseFadeInterval) clearInterval(applauseFadeInterval);

    stopSFX(sfxTicTac);
    stopSFX(sfxCount);
    stopSFX(sfxGoodAns);
    stopSFX(sfxBadAns);
    stopSFX(sfxPlayerEnter);
    stopSFX(sfxApplause);
}

// Stop sounds on page refresh/close
window.addEventListener('beforeunload', (e) => {
    if (currentRoomId) {
        e.preventDefault();
        e.returnValue = "Are you sure you want to leave the game?";
    }
    if (currentUser) {
        setOffline();
    }
    stopAllSounds();
});

// Global click sounds
document.addEventListener('click', (e) => {
    // Play sound for buttons or avatar options
    if (e.target.closest('button') || e.target.classList.contains('avatar-option')) {
        playSFX(sfxClick);
    }
});

const musicManager = new MusicManager();

// Music Toggle UI Logic
const btnToggleMusic = document.getElementById('btn-toggle-music');
if (musicManager.isMuted) {
    btnToggleMusic.classList.add('muted');
}

btnToggleMusic.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent triggering the general click start
    const isMuted = musicManager.toggleMute();
    btnToggleMusic.classList.toggle('muted', isMuted);
});

// Start music on first interaction (Fallback for browsers that block autoplay)
// Start music on first interaction (Fallback for browsers that block autoplay)
document.addEventListener('click', () => {
    musicManager.start();
    // Also resume AudioContext if it exists and is suspended (common in some browsers)
    if (musicManager.audio && musicManager.audio.context && musicManager.audio.context.state === 'suspended') {
        musicManager.audio.context.resume();
    }
}, { once: true });

// Handle Mobile Fullscreen (Immersive Mode) & Audio Init
document.addEventListener('deviceready', () => {
    // 1. Enable Immersive Mode (Android) if plugin available
    if (window.AndroidFullScreen) {
        window.AndroidFullScreen.immersiveMode(
            () => console.log('Immersive mode enabled'),
            (err) => console.error('Error enabling immersive mode:', err)
        );
    }

    // 2. Handle Android Back Button (Optional but good for fullscreen UX)
    document.addEventListener('backbutton', (e) => {
        e.preventDefault();
        // If in a room, maybe ask to leave? For now just minimize or ignore if no logic.
        // Let's defer to existing beforeunload logic or specific modal handling if needed.
        if (currentRoomId) {
            showModal(
                'Exit Game?',
                'Are you sure you want to leave the game?',
                () => {
                    if (currentRoomId) socket.emit('leave_room', currentRoomId);
                    window.location.reload();
                },
                () => { } // Cancel
            );
        } else {
            // If in lobby/login, maybe minimize app?
            // navigator.app.exitApp(); 
        }
    }, false);

    // 3. Try to start music on device ready (often allowed in Cordova without interaction)
    musicManager.start(); // This usually works in Cordova

    // 4. Notification Logic (Firebasex)
    console.log("DeviceReady: Checking for FirebasePlugin...");
    if (window.FirebasePlugin) {
        console.log("DeviceReady: FirebasePlugin found. Calling checkNotificationPermission...");
        checkNotificationPermission();
    } else {
        console.error("DeviceReady: FirebasePlugin NOT found.");
    }

    // 5. Check for Updates
    checkUpdate();
}, false);

// Update Check Logic
async function checkUpdate() {
    // Only check for updates in Cordova environment
    if (!window.cordova) return;

    console.log('Checking for updates...');
    try {
        const baseUrl = (window.GAME_CONFIG && window.GAME_CONFIG.SERVER_URL) ? window.GAME_CONFIG.SERVER_URL : '';
        const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

        // Fetch version history with a timestamp to avoid caching
        const response = await fetch(`${cleanBase}/version_history.json?t=${Date.now()}`);
        if (!response.ok) throw new Error('Version file not found');

        const history = await response.json();
        // Find the version marked as latest
        const latest = history.find(v => v.latest === true);

        if (latest && compareVersions(latest.version, APP_VERSION) > 0) {
            console.log(`Update available: ${latest.version} (Current: ${APP_VERSION})`);

            showModal(
                'New version available!',
                `Version ${latest.version}:\n${latest.notes}\n\nDo you want to update now?`,
                () => {
                    // Open URL in system browser (Play Store or APK download)
                    window.open(latest.downloadUrl, '_system');

                    // If critical, re-show modal if they come back (or don't allow closing easily)
                    if (latest.critical) {
                        setTimeout(() => checkUpdate(), 1000);
                    }
                },
                () => {
                    // Cancel callback
                    if (latest.critical) {
                        // Reshow immediately if critical
                        showModal(
                            'Required update',
                            'This update is required to continue playing.',
                            () => { window.open(latest.downloadUrl, '_system'); setTimeout(() => checkUpdate(), 500); },
                            () => checkUpdate(), // Loop back
                            'Update',
                            null // Hide cancel button visually or just loop
                        );
                    }
                },
                'Update',
                latest.critical ? null : 'Later'
            );
        } else {
            console.log('App is up to date.');
        }
    } catch (e) {
        console.error('Error checking for updates:', e);
    }
}

// Semver comparison helper
function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const n1 = parts1[i] || 0;
        const n2 = parts2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }
    return 0;
}

// Notification Permission & Token Logic
// Notification Permission & Token Logic
async function checkNotificationPermission() {
    const launchCount = parseInt(localStorage.getItem('app_launch_count') || '0') + 1;
    localStorage.setItem('app_launch_count', launchCount);

    const permStatus = localStorage.getItem('notification_permission_status'); // null, 'granted', 'later', 'denied'

    // Ask if first time OR every 5 launches if they said 'later'
    if (!permStatus || (permStatus === 'later' && launchCount % 5 === 0)) {
        showModal(
            'Enable Notifications?',
            'Get notified about game invites and friend requests when you are not playing!',
            async () => {
                try {
                    const hasPerm = await new Promise(resolve => window.FirebasePlugin.hasPermission(resolve));
                    if (!hasPerm) {
                        await new Promise((resolve, reject) => window.FirebasePlugin.grantPermission(resolve, reject));
                    }
                    localStorage.setItem('notification_permission_status', 'granted');
                    registerFCM();
                } catch (err) {
                    console.error('Permission error:', err);
                }
            },
            () => {
                localStorage.setItem('notification_permission_status', 'later');
            },
            'Yes, enable',
            'Not now'
        );
    } else if (permStatus === 'granted') {
        registerFCM();
    }
}

async function registerFCM() {
    if (!window.FirebasePlugin) return;

    try {
        const token = await new Promise((resolve, reject) => window.FirebasePlugin.getToken(resolve, reject));
        console.log('FCM Token:', token);

        // Save to global var to be synced to DB
        window.myFCMToken = token;

        // If user is already logged in, sync immediately
        if (currentUser) {
            syncUserToDB(currentUser);
        }

        // Listen for foreground notifications
        window.FirebasePlugin.onMessageReceived((message) => {
            console.log("Notification received:", message);

            // Extract text robustly
            let text = "New Notification";
            let title = "Game";

            if (message.body) text = message.body;
            else if (message.alert) text = message.alert;
            else if (message.notification && message.notification.body) text = message.notification.body;

            if (message.title) title = message.title;
            else if (message.notification && message.notification.title) title = message.notification.title;

            // Handle Foreground vs Background/Tap
            if (message.tap) {
                console.log("User tapped notification. Payload:", message);

                // Deep Linking Logic
                const type = message.type || (message.data && message.data.type);
                const roomId = message.roomId || (message.data && message.data.roomId);

                if (type === 'friend_request') {
                    // Open Friends Modal -> Requests Tab
                    const btnFriends = document.getElementById('btn-friends');
                    if (btnFriends) {
                        // Simulate opening friends
                        document.getElementById('friends-modal-overlay').style.display = 'flex';
                        // Switch to requests tab
                        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                        document.querySelectorAll('.auth-form').forEach(f => {
                            f.style.display = 'none';
                            f.classList.remove('active');
                        });

                        const reqTab = document.querySelector('[data-tab="tab-friend-requests"]');
                        if (reqTab) reqTab.classList.add('active');

                        const reqContent = document.getElementById('tab-friend-requests');
                        if (reqContent) {
                            reqContent.style.display = 'block';
                            reqContent.classList.add('active');
                        }
                    }
                } else if (type === 'invite' && roomId) {
                    showModal('Game Invite', `Join room ${roomId}?`, () => {
                        socket.emit('join_room', {
                            username: currentUser.username,
                            roomId: roomId,
                            avatar: currentUser.photoURL,
                            uuid: currentUser.uid
                        });
                    }, null, "Join Game");
                } else if (roomId) {
                    showModal('Game Invite', `Join room ${roomId}?`, () => {
                        socket.emit('join_room', {
                            username: currentUser.username,
                            roomId: roomId,
                            avatar: currentUser.photoURL,
                            uuid: currentUser.uid
                        });
                    }, null, "Join Game");
                } else {
                    // Generic
                    // If just tapped generic info, maybe just open app silently? 
                    // Or show the message again if they tapped it?
                    // Let's show it so they know what it was.
                    showModal(title, text, () => { }, null, "OK");
                }
            } else {
                // Foreground arrival
                showFeedback(document.body, `${title}: ${text}`, 'success');
            }
        }, (err) => console.error(err));

    } catch (err) {
        console.error('Error getting FCM token:', err);
    }
}

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

const db = firebase.firestore();

// Sync User to Firestore for Searchability & Online Status
let heartbeatInterval = null;
async function syncUserToDB(user) {
    if (!user) {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return;
    }

    const performSync = async (isOnline = true) => {
        try {
            await db.collection('users').doc(user.uid).set({
                uid: user.uid,
                username: user.displayName || 'Unknown',
                usernameLower: (user.displayName || '').toLowerCase(), // For search
                photoURL: user.photoURL || 'avatar_1.png',
                lastActive: firebase.firestore.FieldValue.serverTimestamp(),
                isOnline: isOnline,
                fcmToken: window.myFCMToken || null // Sync FCM Token
            }, { merge: true });
            console.log(`User synced to Firestore (isOnline: ${isOnline})`);
        } catch (e) {
            console.error('Error syncing user to DB:', e);
        }
    };

    // Initial sync
    await performSync(true);

    // Setup heartbeat every 30 seconds for higher accuracy
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => performSync(true), 30000);
}

async function setOffline() {
    if (currentUser) {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        try {
            await db.collection('users').doc(currentUser.uid).update({
                isOnline: false,
                lastActive: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('User set to offline');
        } catch (e) {
            console.error('Error setting offline:', e);
        }
    }
}

// State
let myUsername = 'Guest';
let myAvatar = 'avatar_1.png'; // Default
let currentRoomId = '';
let currentUser = null; // Firebase User
let isHost = false;
let currentSettings = {}; // Cache for instant UI updates
let myUUID = generateUUID(); // Initial Guest UUID

// Helper to generate random UUID for guests
function generateUUID() {
    // If crypto.randomUUID is available (Modern Browsers)
    if (crypto && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ==========================================
// FRIEND INVITE SYSTEM
// ==========================================

const btnInviteFriend = document.getElementById('btn-invite-friend');
const inviteFriendsModalOverlay = document.getElementById('invite-friends-modal-overlay');
const btnCloseInviteFriends = document.getElementById('btn-close-invite-friends');
const inviteListOnline = document.getElementById('invite-list-online');

// Incoming Invite Elements
const incomingInviteModalOverlay = document.getElementById('incoming-invite-modal-overlay');
const inviterAvatar = document.getElementById('inviter-avatar');
const inviterName = document.getElementById('inviter-name');
const btnAcceptInvite = document.getElementById('btn-accept-invite');
const btnDeclineInvite = document.getElementById('btn-decline-invite');

let currentInviteData = null; // Store pending invite data

// Open Invite Modal
let inviteRefreshInterval = null;
if (btnInviteFriend) {
    btnInviteFriend.addEventListener('click', () => {
        if (!currentRoomId) return; // Can only invite if in a room
        inviteFriendsModalOverlay.style.display = 'flex';
        renderInviteList();

        // Auto-refresh invite list every 5 seconds while modal is open
        if (inviteRefreshInterval) clearInterval(inviteRefreshInterval);
        inviteRefreshInterval = setInterval(() => {
            if (inviteFriendsModalOverlay.style.display === 'flex') {
                renderInviteList();
            } else {
                clearInterval(inviteRefreshInterval);
                inviteRefreshInterval = null;
            }
        }, 5000);
    });
}

// Close Invite Modal
if (btnCloseInviteFriends) {
    btnCloseInviteFriends.addEventListener('click', () => {
        inviteFriendsModalOverlay.style.display = 'none';
        if (inviteRefreshInterval) {
            clearInterval(inviteRefreshInterval);
            inviteRefreshInterval = null;
        }
    });
}

async function renderInviteList() {
    inviteListOnline.innerHTML = '';

    if (!lastFriendsList || lastFriendsList.length === 0) {
        inviteListOnline.innerHTML = '<p class="empty-state">No friends to invite.</p>';
        return;
    }

    // Fetch fresh data for each friend to get current online status
    const friendsWithStatus = await Promise.all(lastFriendsList.map(async (friend) => {
        try {
            const userDoc = await db.collection('users').doc(friend.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                return {
                    ...friend,
                    isOnline: userData.isOnline,
                    lastActive: userData.lastActive,
                    photoURL: userData.photoURL || friend.photoURL,
                    username: userData.username || friend.username
                };
            }
            return friend;
        } catch (error) {
            console.error('Error fetching friend data:', error);
            return friend;
        }
    }));

    friendsWithStatus.forEach(friend => {
        // Calculate status - EXACT same logic as main friend list (renderFriendItem)
        const now = new Date();
        const lastActiveDate = friend.lastActive?.toDate() || new Date(0);
        const diffSec = Math.floor((now - lastActiveDate) / 1000);

        // Match main friends list: Online = isOnline flag AND active within 90 seconds
        const isOnline = friend.isOnline && diffSec < 90;

        // ALLOW OFFLINE INVITES (Removed filter)
        // if (!isOnline) return;

        console.log(`Friend ${friend.username}: isOnline=${friend.isOnline}, diffSec=${diffSec}, calculated=${isOnline}`);

        const container = inviteListOnline;

        const item = document.createElement('div');
        item.className = 'invite-friend-item';
        item.innerHTML = `
            <img src="assets/img/user-img/${friend.photoURL || 'avatar_1.png'}" class="friend-avatar ${isOnline ? 'online' : ''}">
            <div class="friend-info">
                <span class="friend-name">${friend.username}</span>
                <span class="friend-status ${isOnline ? 'online' : ''}">${isOnline ? 'Online' : 'Offline'}</span>
            </div>
            <button class="btn-invite-action" data-uid="${friend.uid}">Invite</button>
        `;

        const btnInvite = item.querySelector('.btn-invite-action');
        btnInvite.addEventListener('click', () => {
            sendInvite(friend.uid, btnInvite);
        });

        container.appendChild(item);
    });

    if (inviteListOnline.children.length === 0) {
        inviteListOnline.innerHTML = '<p class="empty-state" style="padding:10px;">No friends online to invite.</p>';
    }
}

function sendInvite(targetUid, btn) {
    if (!currentRoomId || !currentUser) return;

    console.log('Sending invite to:', targetUid, 'Room:', currentRoomId);

    // UI Feedback
    btn.textContent = 'Sent';
    btn.disabled = true;
    btn.style.background = '#2ecc71';

    socket.emit('invite_friend', {
        targetUid: targetUid,
        roomId: currentRoomId,
        hostName: currentUser.displayName,
        hostAvatar: currentUser.photoURL || 'avatar_1.png'
    });

    // Reset button after delay?
    setTimeout(() => {
        if (btn && btn.textContent === 'Sent') {
            btn.textContent = 'Invite';
            btn.disabled = false;
            btn.style.background = '';
        }
    }, 5000);
}

socket.on('invite_result', (data) => {
    console.log('Invite result received:', data);
    // Find the button that was clicked? Or just use generic feedback?
    // We don't have a direct ref to the button here easily unless we store it or query by uid
    // But we can query by data-uid
    const btn = document.querySelector(`.btn-invite-action[data-uid="${data.targetUid}"]`);
    if (btn) {
        if (data.success) {
            btn.textContent = 'Sent';
            btn.style.background = '#2ecc71';
        } else {
            btn.textContent = 'Offline';
            btn.style.background = '#95a5a6';
            setTimeout(() => {
                btn.textContent = 'Invite';
                btn.disabled = false;
                btn.style.background = '';
            }, 3000);
        }
    }
});

// Socket: Receive Invite
socket.on('receive_invite', (data) => {
    console.log('Received invite from:', data.hostName, 'Room:', data.roomId);
    // If I'm already in a room (and it's not the same room), show alert? 
    // Or just show modal regardless.
    // If I am in the same room, ignore.
    if (currentRoomId === data.roomId) return;

    currentInviteData = data;

    inviterName.textContent = data.hostName;
    inviterAvatar.src = `assets/img/user-img/${data.hostAvatar}`;
    incomingInviteModalOverlay.style.display = 'flex';

    // Play notification sound
    playSFX(sfxClick); // Reusing click for now or add new sound
});

// Accept Invite
if (btnAcceptInvite) {
    btnAcceptInvite.addEventListener('click', () => {
        if (currentInviteData) {
            // Leave current room if any
            if (currentRoomId) {
                socket.emit('leave_room', currentRoomId);
                currentRoomId = '';
                // UI update handles in leave_room/join logic
            }

            // Join new room
            socket.emit('join_room', {
                username: myUsername,
                roomId: currentInviteData.roomId,
                avatar: myAvatar,
                uuid: myUUID
            });

            // UI Transitions handled by 'room_joined' socket event in main logic
            incomingInviteModalOverlay.style.display = 'none';
        }
    });
}

// Decline Invite
if (btnDeclineInvite) {
    btnDeclineInvite.addEventListener('click', () => {
        incomingInviteModalOverlay.style.display = 'none';
        currentInviteData = null;
    });
}
const loginSection = document.getElementById('login-section');
const lobbySection = document.getElementById('lobby-section');
const roomSection = document.getElementById('room-section');

// Login Views
const guestLoginView = document.getElementById('guest-login-view');
const userProfileView = document.getElementById('user-profile-view');
const userDisplayName = document.getElementById('user-display-name');
const btnPlayAuth = document.getElementById('btn-play-auth');
const btnLogout = document.getElementById('btn-logout');
const btnAccountSettings = document.getElementById('btn-account-settings');

const usernameInput = document.getElementById('username');
const btnLogin = document.getElementById('btn-login');
const btnBackToLogin = document.getElementById('btn-back-to-login');

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

function showModal(title, message, onConfirm = null, onCancel = null, confirmText = 'OK', cancelText = 'Cancel') {
    modalTitle.innerText = title;
    modalMessage.innerHTML = message;

    modalBtnConfirm.innerText = confirmText;
    modalBtnCancel.innerText = cancelText;

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

const configModeName = document.getElementById('config-mode-name');
const roomModeBadge = document.getElementById('room-mode-badge');
const roomModeDisplay = document.getElementById('room-mode-display');

const roundsInput = document.getElementById('rounds-input');
const timeInput = document.getElementById('time-input');
const difficultyInput = document.getElementById('difficulty-input');

const roundsDisplay = document.getElementById('rounds-display');
const timeDisplay = document.getElementById('time-display');

const pRounds = document.getElementById('p-rounds');
const pTime = document.getElementById('p-time');
const pDifficulty = document.getElementById('p-difficulty');

// Navigation
function switchScreen(screenId) {
    const currentScreen = document.querySelector('.screen.active');
    const nextScreen = document.getElementById(screenId);

    if (currentScreen && currentScreen.id !== screenId) {
        // Add exit animation
        currentScreen.classList.add('screen-exit');

        // Wait for animation to finish
        setTimeout(() => {
            currentScreen.classList.remove('active', 'screen-exit');
            nextScreen.classList.add('active');
        }, 300); // Match CSS animation duration
    } else {
        // Fallback for first load or same screen
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active', 'screen-exit'));
        nextScreen.classList.add('active');
    }
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

        // Restriction: Guests can only use avatar_1.png
        if (!currentUser && src !== 'avatar_1.png') {
            showModal('Premium Feature', 'Please <b>Login</b> or <b>Sign Up</b> to unlock all avatars!');
            return;
        }

        myAvatar = src;

        // Update Preview
        selectedAvatarPreview.src = `assets/img/user-img/${src}`;

        // Update Selected State
        avatarOptions.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');

        // Close Dropdown
        avatarDropdown.classList.remove('active');

        // Sync with Firebase if logged in
        if (currentUser) {
            currentUser.updateProfile({
                photoURL: myAvatar
            }).then(() => {
                console.log('Avatar synced to Firebase');
                syncUserToDB(currentUser); // Persist to Firestore Users
            }).catch(err => {
                console.error('Error syncing avatar:', err);
            });
        }
    });
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!avatarSelectorBtn.contains(e.target) && !avatarDropdown.contains(e.target)) {
        avatarDropdown.classList.remove('active');
    }
});

// 1. Login
// 1. Login Logic
function handleGuestLogin() {
    const name = usernameInput.value.trim();
    if (name) {
        btnLogin.disabled = true; // Prevent double click
        setTimeout(() => btnLogin.disabled = false, 2000); // Re-enable after delay
        myUsername = name;

        // Save to LocalStorage
        localStorage.setItem('username', name);
        localStorage.setItem('avatar', myAvatar);

        // Emit login event to server to verify connection and track UUID
        // We use the Firebase UID as the unique identifier for the server to map sockets
        socket.emit('login', { name: myUsername, uuid: myUUID });
        switchScreen('lobby-section');
    } else {
        showModal('Error', 'Please enter a username!');
    }
}

// Back to Login Logic
if (btnBackToLogin) {
    btnBackToLogin.addEventListener('click', () => {
        switchScreen('login-section');
    });
}

btnLogin.addEventListener('click', handleGuestLogin);

// =========================
// AUTHENTICATION LOGIC
// =========================
const authModalOverlay = document.getElementById('auth-modal-overlay');
const btnOpenAuth = document.getElementById('btn-open-auth');
const btnCloseAuth = document.getElementById('btn-close-auth');
const authTabs = document.querySelectorAll('#auth-modal-overlay .auth-tab');
const authForms = document.querySelectorAll('#auth-modal-overlay .auth-form');
const btnGoogleLogin = document.getElementById('btn-google-login');
const formLogin = document.getElementById('form-login');
const formRegister = document.getElementById('form-register');
const authErrorMsg = document.getElementById('auth-error-msg');

// Modal Control
btnOpenAuth.addEventListener('click', () => {
    authModalOverlay.style.display = 'flex';
    authErrorMsg.style.display = 'none';
});

btnCloseAuth.addEventListener('click', () => {
    authModalOverlay.style.display = 'none';
});

authModalOverlay.addEventListener('click', (e) => {
    if (e.target === authModalOverlay) {
        authModalOverlay.style.display = 'none';
    }
});

// Tab Switching
authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        authTabs.forEach(t => t.classList.remove('active'));
        authForms.forEach(f => f.classList.remove('active'));

        tab.classList.add('active');
        const targetId = `auth-form-${tab.dataset.tab}`;
        document.getElementById(targetId).classList.add('active');
        authErrorMsg.style.display = 'none';
    });
});

// Helper: Show Auth Error
function showAuthError(msg) {
    authErrorMsg.textContent = msg;
    authErrorMsg.style.display = 'block';
}

// 1. Google Login & Register (Same logic)
const btnGoogleRegister = document.getElementById('btn-google-register');

function handleGoogleSign() {
    console.log('handleGoogleSign - Inciando...');

    // 1. Login Nativo para APK
    if (window.cordova && window.plugins && window.plugins.googleplus) {
        const webId = '894472877590-1v7gpel3b3g1en187vrji33krfk8q97j.apps.googleusercontent.com';
        console.log('Intentando Login Nativo con ID:', webId);

        window.plugins.googleplus.login(
            {
                'webClientId': webId,
                'offline': false
            },
            function (obj) {
                console.log('¡Éxito Nativo! Autenticando en Firebase...');
                const credential = firebase.auth.GoogleAuthProvider.credential(obj.idToken);
                auth.signInWithCredential(credential)
                    .then(() => {
                        authModalOverlay.style.display = 'none';
                    })
                    .catch((error) => {
                        console.error('Firebase Auth Error:', error);
                        showAuthError('Login Error: ' + error.message);
                    });
            },
            function (msg) {
                // El famoso Error 10
                console.error('Detalles del Error de Google:', msg);
                const errorStr = (typeof msg === 'object') ? JSON.stringify(msg) : String(msg);

                if (msg !== '12501' && msg !== 'cancelled') {
                    console.error('Native Google Error:', msg);
                    showAuthError('Google Login Error: ' + (typeof msg === 'object' ? JSON.stringify(msg) : msg));
                }
            }
        );
        return;
    }

    // 2. Web Popup (Standard Web fallback)
    console.log('Falling back to Web Popup Login...');
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then((result) => {
            console.log('Google Sign In Success:', result.user);
            authModalOverlay.style.display = 'none';
        })
        .catch((error) => {
            console.error(error);
            showAuthError(error.message);
        });
}

btnGoogleLogin.addEventListener('click', handleGoogleSign);
btnGoogleRegister.addEventListener('click', handleGoogleSign);

// 2. Email Login
formLogin.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            console.log('Login Success:', userCredential.user);
            authModalOverlay.style.display = 'none';
        })
        .catch((error) => {
            showAuthError(error.message);
        });
});

// 3. Register
formRegister.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    if (!username) {
        showAuthError("Please enter a username");
        return;
    }

    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Update Profile with Username
            userCredential.user.updateProfile({
                displayName: username,
                photoURL: myAvatar // default generic
            }).then(() => {
                console.log('Registration Success');
                authModalOverlay.style.display = 'none';
                // Force UI update since observer might fire before profile update?
                // Actually observer fires on sign-in, updateProfile might need reload to reflect?
                // We'll handle it in onAuthStateChanged if possible, or force it here.
                myUsername = username;
                usernameInput.value = username;
            });
        })
        .catch((error) => {
            showAuthError(error.message);
        });
});

// 4. Auth State Observer
// Handle Redirect Result (Important for Cordova)
auth.getRedirectResult().then((result) => {
    if (result && result.user) {
        console.log('Handle redirect result success:', result.user.displayName);
        authModalOverlay.style.display = 'none';
    }
}).catch((error) => {
    console.error('Error handling redirect result:', error);
});

auth.onAuthStateChanged(async (user) => {
    updateLoginUI(user);
    if (user) {
        currentUser = user;
        myUUID = user.uid; // Use Firebase UID
        syncUserToDB(user); // Sync Profile for Search
        console.log('User is logged in:', user.displayName, 'UUID:', myUUID);

        // Start Listening for Friend Requests & Friends - WAIT for initial load
        await Promise.all([
            listenForFriendRequests(),
            listenForFriends()
        ]);

        // Auto-fill Data
        if (user.displayName) {
            myUsername = user.displayName;
            usernameInput.value = myUsername;
            userDisplayName.textContent = myUsername;
        }

        // IMPORTANT: Emit login to server with real Firebase UID
        // This ensures server has correct UID mapping even if socket reconnected before auth completed
        console.log('Firebase auth completed. myUsername:', myUsername, 'myUUID:', myUUID, 'socket.connected:', socket.connected);
        if (socket.connected) {
            socket.emit('login', { name: myUsername, uuid: myUUID });
            console.log('✓ Emitted login to server with Firebase UID:', myUUID);
        } else {
            console.warn('⚠ Socket not connected yet, login will be emitted on connect');
        }

        // Avatar Logic
        let avatarToUse = user.photoURL;

        // Force internal avatar system: If URL is external (Google) or missing, use default
        if (!avatarToUse || avatarToUse.startsWith('http')) {
            avatarToUse = 'avatar_1.png';
            console.log('Normalizing avatar to internal system:', avatarToUse);

            // Persist the override to Firebase
            user.updateProfile({ photoURL: avatarToUse }).catch(err => console.error('Error normalizing avatar:', err));
        }

        myAvatar = avatarToUse;
        console.log('Final Avatar:', myAvatar);

        // Update Preview Image (in settings)
        const avatarPreview = document.getElementById('selected-avatar-preview');
        if (avatarPreview) {
            avatarPreview.src = `assets/img/user-img/${myAvatar}`;
        }

        // Update Dropdown Selection
        const avatarOptions = document.querySelectorAll('.avatar-option');
        avatarOptions.forEach(opt => {
            opt.classList.remove('selected');
            const img = opt.querySelector('img');
            if (img && img.src.includes(myAvatar)) {
                opt.classList.add('selected');
            }
        });
    } else {
        if (currentUser) {
            // If we HAD a user but now don't, set them offline
            setOffline();
        }
        currentUser = null;
        console.log('User is signed out');
        myUUID = generateUUID(); // Generate new guest UUID
        updateLoginUI(null);
    }

    // Hide loading screen logic
    const loadingScreen = document.getElementById('initial-loading-screen');
    const serverLoadingScreen = document.getElementById('server-loading-screen');

    // Helper to finish loading
    const finishLoading = () => {
        if (loadingScreen && !loadingScreen.classList.contains('fade-out')) {
            loadingScreen.classList.add('fade-out');
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 500);
        }
    };

    if (socket.connected) {
        // Connected? Finish immediately.
        finishLoading();
    } else {
        // Not connected? Wait a grace period (e.g. 1.5s) to see if it's just normal latency
        // If it connects within this time, 'connect' listener will handle it (we need to ensure that)
        // If not, we switch to server loading screen.

        // However, 'connect' listener usually effectively hides serverLoadingScreen logic.
        // We need 'connect' listener to ALSO trigger finishLoading if it happens late.

        // Better approach: 
        // 1. Show ServerLoadingScreen behind InitialLoader immediately (display:flex, z-index lower)
        if (serverLoadingScreen) {
            serverLoadingScreen.style.display = 'flex';
        }

        // 2. Wait 2 seconds before fading out InitialLoader. 
        // If connection happens during this 2s, 'connect' logic will hide ServerLoadingScreen.
        // So when InitialLoader fades, user sees Lobby.
        // If connection doesn't happen, ServerLoadingScreen remains visible.

        setTimeout(() => {
            // If connected now, ServerLoadingScreen matches 'none' (handled by connect listener).
            // If not connected, it is 'flex'.
            // Fade out InitialLoader to reveal whatever is behind.
            finishLoading();
        }, 1500);
    }
});

function updateLoginUI(user) {
    console.log('Updating UI for user:', user ? user.email : 'Guest');

    // Update Avatar Locks: Lock all except avatar_1 for guests
    const avatarOptions = document.querySelectorAll('.avatar-option');
    console.log('Checking avatar locks. Found options:', avatarOptions.length, 'User:', user ? 'Logged In' : 'Guest');

    avatarOptions.forEach(opt => {
        const src = opt.getAttribute('data-src');
        if (!user && src !== 'avatar_1.png') {
            opt.classList.add('locked');
            // Force style check for debug
            // opt.style.border = '2px solid red'; 
        } else {
            opt.classList.remove('locked');
            // opt.style.border = '';
        }
    });

    if (user) {
        if (guestLoginView) guestLoginView.style.display = 'none';
        if (userProfileView) userProfileView.style.display = 'block';
        if (userDisplayName) userDisplayName.style.display = 'block'; // Show Username

        // Align header to start when logged in (Avatar + Name)
        const header = document.querySelector('.profile-header-unified');
        if (header) header.style.justifyContent = 'flex-start';

        // Show invite button for authenticated users
        if (btnInviteFriend) btnInviteFriend.style.display = 'flex';

    } else {
        if (guestLoginView) guestLoginView.style.display = 'block';
        if (userProfileView) userProfileView.style.display = 'none';
        if (userDisplayName) userDisplayName.style.display = 'none'; // Hide Username for guests

        // Center avatar for guests
        const header = document.querySelector('.profile-header-unified');
        if (header) header.style.justifyContent = 'center';

        // Hide invite button for guests (they don't have friends)
        if (btnInviteFriend) btnInviteFriend.style.display = 'none';
    }
}

// 5. Authenticated Play Button
btnPlayAuth.addEventListener('click', () => {
    // Just proceed to lobby, user data is already set
    socket.emit('login', { name: myUsername, uuid: myUUID });
    switchScreen('lobby-section');
});

// 6. Logout
btnLogout.addEventListener('click', async () => {
    await setOffline();
    auth.signOut().then(() => {
        showModal('Signed Out', 'You have been signed out successfully.', () => {
            location.reload();
        });
    });
});


// 7. Account Settings Modal Logic
const settingsModalOverlay = document.getElementById('settings-modal-overlay');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const settingsUsernameInput = document.getElementById('settings-username');
const btnDeleteAccount = document.getElementById('btn-delete-account'); // New
const btnViewStats = document.getElementById('btn-view-stats'); // New

// Stats Modal Elements
const statsModalOverlay = document.getElementById('stats-modal-overlay');
const btnCloseStats = document.getElementById('btn-close-stats');
const statGames = document.getElementById('stat-games');
const statWins = document.getElementById('stat-wins');
const statScore = document.getElementById('stat-score');

btnAccountSettings.addEventListener('click', () => {
    if (currentUser) {
        settingsUsernameInput.value = currentUser.displayName || '';
        settingsModalOverlay.style.display = 'flex';
    }
});

btnCloseSettings.addEventListener('click', () => {
    settingsModalOverlay.style.display = 'none';
});

settingsModalOverlay.addEventListener('click', (e) => {
    if (e.target === settingsModalOverlay) {
        settingsModalOverlay.style.display = 'none';
    }
});

// View Stats
btnViewStats.addEventListener('click', () => {
    settingsModalOverlay.style.display = 'none'; // Close settings
    statsModalOverlay.style.display = 'flex';

    // Load Stats (From LocalStorage for now, keyed by UUID)
    // In a real app with Firestore, we would fetch() here.
    const savedStats = JSON.parse(localStorage.getItem(`stats_${myUUID}`)) || { games: 0, wins: 0, score: 0 };
    statGames.textContent = savedStats.games;
    statWins.textContent = savedStats.wins;
    statScore.textContent = savedStats.score;
});

btnCloseStats.addEventListener('click', () => {
    statsModalOverlay.style.display = 'none';
});

// Friends Modal
const btnFriends = document.getElementById('btn-friends');
const friendsModalOverlay = document.getElementById('friends-modal-overlay');
const btnCloseFriends = document.getElementById('btn-close-friends');

btnFriends.addEventListener('click', () => {
    friendsModalOverlay.style.display = 'flex';
});

btnCloseFriends.addEventListener('click', () => {
    friendsModalOverlay.style.display = 'none';
});

friendsModalOverlay.addEventListener('click', (e) => {
    if (e.target === friendsModalOverlay) {
        friendsModalOverlay.style.display = 'none';
    }
});

// Friends Modal Tabs Logic
const friendTabs = document.querySelectorAll('#friends-modal-overlay .auth-tab');
friendTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        // Remove active class from all tabs
        friendTabs.forEach(t => t.classList.remove('active'));
        // Hide all contents
        const allContents = document.querySelectorAll('#friends-modal-overlay .auth-form');
        allContents.forEach(c => c.style.display = 'none');

        // Activate clicked tab
        tab.classList.add('active');
        const targetId = tab.getAttribute('data-tab');
        const targetContent = document.getElementById(targetId);
        if (targetContent) {
            targetContent.style.display = 'block';
            // If opening My Friends or Requests, we should trigger a refresh (later)
        }
    });
});

// Delete Account
btnDeleteAccount.addEventListener('click', () => {
    showModal(
        'Delete Account',
        'Are you sure you want to permanently delete your account? This cannot be undone.',
        () => {
            // Confirm Logic
            if (currentUser) {
                currentUser.delete().then(() => {
                    console.log('Account deleted');
                    settingsModalOverlay.style.display = 'none';

                    // Explicitly sign out and reload
                    auth.signOut().then(() => {
                        showModal('Account Deleted', 'Your account has been deleted permanently.', () => {
                            location.reload();
                        });
                    });

                }).catch(error => {
                    console.error(error);
                    if (error.code === 'auth/requires-recent-login') {
                        showModal('Security Check', 'Please sign out and sign in again to delete your account.');
                    } else {
                        showModal('Error', 'Could not delete account: ' + error.message);
                    }
                });
            }
        },
        () => {
            // Cancel Logic - Do nothing, modal closes automatically
        }
    );
});

// Save Settings (Username)
btnSaveSettings.addEventListener('click', () => {
    const newName = settingsUsernameInput.value.trim();
    if (newName && currentUser) {
        if (newName === currentUser.displayName) {
            settingsModalOverlay.style.display = 'none';
            return;
        }

        // Update Firebase
        currentUser.updateProfile({
            displayName: newName
        }).then(() => {
            console.log('Username updated');

            // Update Local State
            myUsername = newName;
            userDisplayName.textContent = newName;
            usernameInput.value = newName;

            // Sync to Firestore Users collection so friends see updated name
            syncUserToDB(currentUser);

            // Feedback
            settingsModalOverlay.style.display = 'none';
            showModal('Success', 'Username updated successfully!');

        }).catch(err => {
            console.error(err);
            showModal('Error', 'Failed to update username.');
        });
    } else {
        showModal('Error', 'Username cannot be empty.');
    }
});

// 2. Create Room (Logic continues...)

// Tutorial Logic
const tutorialModalOverlay = document.getElementById('tutorial-modal-overlay');
const btnCloseTutorial = document.getElementById('btn-close-tutorial');
const tutorialTitle = document.getElementById('tutorial-title');
const tutorialContent = document.getElementById('tutorial-content');

const tutorials = {
    'root_rush': {
        title: 'How to Play: Root Rush',
        html: `
            <p><strong>Goal:</strong> Calculate the square root of the number shown.</p>
            <p><strong>Gameplay:</strong></p>
            <ul>
                <li>A number will appear (e.g., 144).</li>
                <li>Type the square root (e.g., 12) as fast as you can.</li>
                <li>The faster you answer, the more points you get!</li>
            </ul>
        `
    },
    'prime_master': {
        title: 'How to Play: Prime Master',
        html: `
            <p><strong>Goal:</strong> Select the prime number of four possible answers.</p>
            <p><strong>Gameplay:</strong></p>
            <ul>
                <li>Four numbers will appear.</li>
                <li>Click the prime number as fast as you can.</li>
                <li>Answer faster than the other players to score points!</li>
            </ul>
        `
    },
    'twenty_four': {
        title: 'How to Play: Twenty Four',
        html: `
            <p><strong>Goal:</strong> Make the number 24 using 4 numbers.</p>
            <p><strong>Gameplay:</strong></p>
            <ul>
                <li>You are given four numbers (e.g., 4, 7, 8, 8).</li>
                <li>Use addition (+), subtraction (-), multiplication (*), and division (/) to reach exactly 24.</li>
                <li>Use any combination attempting to get 24.</li>
                <li>Example: (8 - 4) * (8 - 2) = 24</li>
            </ul>
        `
    },
    'binary_blitz': {
        title: 'How to Play: Binary Blitz',
        html: `
            <p><strong>Goal:</strong> Convert the decimal number to binary.</p>
            <p><strong>Gameplay:</strong></p>
            <ul>
                <li>A decimal number will appear (e.g., 13).</li>
                <li>Type the binary equivalent (e.g., 1101) using the 0/1 keypad.</li>
                <li>Be the fastest to get points!</li>
                <li>Incorrect answers get 0 points.</li>
            </ul>
        `
    }
};

document.querySelectorAll('.mode-info-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent clicking the card behind it
        const mode = btn.getAttribute('data-mode');
        const content = tutorials[mode];

        if (content) {
            tutorialTitle.innerText = content.title;
            tutorialContent.innerHTML = content.html;
            tutorialModalOverlay.style.display = 'flex';
        }
    });
});

btnCloseTutorial.addEventListener('click', () => {
    tutorialModalOverlay.style.display = 'none';
});

// Info button in Configuration Header
document.getElementById('btn-config-info').addEventListener('click', () => {
    const mode = currentSettings.gameMode;
    const content = tutorials[mode];
    if (content) {
        tutorialTitle.innerText = content.title;
        tutorialContent.innerHTML = content.html;
        tutorialModalOverlay.style.display = 'flex';
    }
});

tutorialModalOverlay.addEventListener('click', (e) => {
    if (e.target === tutorialModalOverlay) {
        tutorialModalOverlay.style.display = 'none';
    }
});
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
        stopAllSounds();
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

        // Clear mode display
        roomModeBadge.style.display = 'none';
        roomModeDisplay.innerText = '';

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

btnShareRoom.addEventListener('click', async () => {
    const shareUrl = `${window.location.origin}/?c=${currentRoomId}`;
    const shareData = {
        title: 'Join Answer!',
        text: `Play Answer with me! Code: ${currentRoomId}`,
        url: shareUrl
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
            console.log('Content shared successfully');
        } catch (err) {
            // User cancelled the share or an error occurred
            if (err.name !== 'AbortError') {
                console.error('Error sharing:', err);
                showModal('Share Error', 'Could not share the room. Please try again.');
            }
        }
    } else {
        // Browser doesn't support Web Share API
        showModal('Share Not Available', 'Your browser does not support native sharing. Please copy the room code manually: ' + currentRoomId);
    }
});

// 6. Settings & Mode Logic
// =========================

function updateLobbyUI(settings) {
    const isModeSelected = !!settings.gameMode;

    if (!isModeSelected) {
        // Mode Selection Phase
        if (modeSelectionView.style.display !== 'block') {
            modeSelectionView.style.display = 'block';
            configurationView.style.display = 'none';
        }

        if (isHost) {
            // Host sees clickable cards
            guestModeMsg.style.display = 'none';
            // Ensure cards are fully active
            document.querySelectorAll('.mode-card').forEach(c => {
                c.classList.remove('guest-view');
            });
        } else {
            // Guest sees "Waiting for host..."
            guestModeMsg.style.display = 'block';
            // Make cards look interactive for info, but don't blocking clicks
            document.querySelectorAll('.mode-card').forEach(c => {
                c.classList.add('guest-view');
            });
        }
        // Hide mode badge if no mode selected
        roomModeBadge.style.display = 'none';
        roomModeDisplay.innerText = '';
    } else {
        // Configuration Phase
        if (configurationView.style.display !== 'flex') {
            modeSelectionView.style.display = 'none';
            configurationView.style.display = 'flex'; // It's a flex column
            configurationView.style.flexDirection = 'column';
        }
        // Update Config Header / Room Badge (Common)
        const niceName = settings.gameMode.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        configModeName.innerText = niceName;
        roomModeDisplay.innerText = niceName;
        roomModeBadge.style.display = 'inline-flex';

        if (isHost) {
            hostControls.style.display = 'block';
            guestControls.style.display = 'none';
            btnBackMode.style.display = 'block';

            // Reset header text to "Configure:" for host
            const configH2 = document.querySelector('#configuration-view h2');
            if (configH2 && configH2.firstChild && configH2.firstChild.nodeType === Node.TEXT_NODE) {
                configH2.firstChild.textContent = "Configure: ";
            } else if (configH2) {
                // Fallback if structure is lost
                configH2.innerHTML = `Configure: <span id="config-mode-name" style="color: var(--primary);">${niceName}</span>`;
                // Update global reference if we nuked it
                // But better to trust the HTML structure is stable
            }

            // MODE-SPECIFIC CONFIGURATION UI (HOST)
            const diffSelect = document.getElementById('difficulty-input');
            const modeTitle = document.querySelector('#configuration-view h2');
            console.log("updateLobbyUI DEBUG:", settings.gameMode);

            if (settings.gameMode === 'prime_master') {
                modeTitle.innerText = "Configure Prime Master";
                diffSelect.options[0].text = "Easy (10-99)";
                diffSelect.options[1].text = "Normal (100-500)";
                diffSelect.options[2].text = "Hard (200-999)";
            } else if (settings.gameMode === 'twenty_four') {
                modeTitle.innerText = "Configure Twenty Four";
                diffSelect.options[0].text = "Easy";
                diffSelect.options[1].text = "Normal";
                diffSelect.options[2].text = "Hard";
            } else if (settings.gameMode === 'binary_blitz') {
                modeTitle.innerText = "Configure Binary Blitz";
                diffSelect.options[0].text = "Easy (0-31)";
                diffSelect.options[1].text = "Normal (0-255)";
                diffSelect.options[2].text = "Hard (0-4095)";
            } else {
                // Default: Root Rush
                modeTitle.innerText = "Configure Root Rush";
                diffSelect.options[0].text = "Easy (100-1k)";
                diffSelect.options[1].text = "Normal (10k-1M)";
                diffSelect.options[2].text = "Hard (1M-100M)";
            }
        } else {
            // GUEST VIEW CONFIG
            guestControls.style.display = 'block';
            hostControls.style.display = 'none';
            btnBackMode.style.display = 'none';

            // Update Header to "Game Mode:" for guest
            const configH2 = document.querySelector('#configuration-view h2');
            if (configH2 && configH2.firstChild && configH2.firstChild.nodeType === Node.TEXT_NODE) {
                configH2.firstChild.textContent = "Game Mode: ";
            }

            // Update Guest Preview Values
            pRounds.innerText = `${settings.rounds} Rounds`;
            pTime.innerText = `${settings.timePerRound}s`;

            let diffText = settings.difficulty.charAt(0).toUpperCase() + settings.difficulty.slice(1);
            if (settings.gameMode === 'prime_master') {
                if (settings.difficulty === 'easy') diffText += " (10-99)";
                if (settings.difficulty === 'normal') diffText += " (100-500)";
                if (settings.difficulty === 'hard') diffText += " (200-999)";
                if (settings.difficulty === 'hard') diffText += " (200-999)";
            } else if (settings.gameMode === 'twenty_four') {
                // No extra text needed for 24 game
            } else if (settings.gameMode === 'binary_blitz') {
                if (settings.difficulty === 'easy') diffText += " (0-31)";
                if (settings.difficulty === 'normal') diffText += " (0-255)";
                if (settings.difficulty === 'hard') diffText += " (0-4095)";
            } else {
                if (settings.difficulty === 'easy') diffText += " (100-1k)";
                if (settings.difficulty === 'normal') diffText += " (10k-1M)";
                if (settings.difficulty === 'hard') diffText += " (1M-100M)";
            }
            pDifficulty.innerText = diffText;
        }
    }
}

// Host selects a mode
// Host selects a mode
document.getElementById('mode-card-root-rush').addEventListener('click', () => {
    console.log("Clicked Root Rush");
    if (!isHost) return;
    socket.emit('update_settings', { roomId: currentRoomId, settings: { gameMode: 'root_rush' } });
});

document.getElementById('mode-card-prime-master').addEventListener('click', () => {
    console.log("Clicked Prime Master");
    if (!isHost) return;
    socket.emit('update_settings', { roomId: currentRoomId, settings: { gameMode: 'prime_master' } });
});

document.getElementById('mode-card-twenty-four').addEventListener('click', () => {
    console.log("Clicked Twenty Four");
    if (!isHost) return;
    socket.emit('update_settings', { roomId: currentRoomId, settings: { gameMode: 'twenty_four', timePerRound: 30 } });
});

document.getElementById('mode-card-binary-blitz').addEventListener('click', () => {
    console.log("Clicked Binary Blitz");
    if (!isHost) return;
    socket.emit('update_settings', { roomId: currentRoomId, settings: { gameMode: 'binary_blitz', timePerRound: 30 } });
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
        btnStartGame.disabled = true;
        socket.emit('start_game', currentRoomId);
        // Safely re-enable if something goes wrong (socket error, etc)
        setTimeout(() => { if (btnStartGame) btnStartGame.disabled = false; }, 4000);
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

// Numeric Keypad Elements
// Numeric & Binary Keypad Elements
const numericKeypad = document.getElementById('numeric-keypad');
const binaryKeypad = document.getElementById('binary-keypad');
const btnToggleKeypad = document.getElementById('btn-toggle-keypad');
const keypadButtons = document.querySelectorAll('.keypad-button');

// Detect if mobile device
function isMobileDevice() {
    return window.innerWidth <= 768 || ('ontouchstart' in window);
}

// Initialize keypad visibility based on device
function initializeKeypad() {
    const isBinary = currentSettings && currentSettings.gameMode === 'binary_blitz';
    const targetKeypad = isBinary ? binaryKeypad : numericKeypad;
    const otherKeypad = isBinary ? numericKeypad : binaryKeypad;

    // Always hide the "other" keypad to be safe
    if (otherKeypad) otherKeypad.classList.remove('visible');
    if (isBinary && binaryKeypad) binaryKeypad.style.display = 'grid';
    // Note: binary keypad uses style.display='grid' in new_round vs 'visible' class toggling. 
    // We should align this. Let's assume new_round handles the 'grid' display, 
    // and this function handles the responsive 'visible' class if needed, 
    // BUT binary keypad is currently set to display:grid in CSS by default (no, styles says display:grid).
    // Actually, in index.html it has style="display: none;".
    // AND in new_round we do `binaryKeypad.style.display = 'grid'`.

    // For mobile, we generally want to show the keypad automatically.
    if (isMobileDevice()) {
        if (isBinary) {
            // Binary keypad is always shown in binary mode via new_round setting display:grid
            // We don't use 'visible' class for it because it's not a popup like numericKeypad on desktop?
            // Wait, numericKeypad has .visible { display: grid; } in CSS likely.
            // Let's just ensure input state is correct.
        } else {
            numericKeypad.classList.add('visible');
        }

        gameInput.setAttribute('readonly', 'readonly');
        gameInput.setAttribute('inputmode', 'none');
    } else {
        if (!isBinary) numericKeypad.classList.remove('visible');
        gameInput.removeAttribute('readonly');
        btnToggleKeypad.classList.remove('active');
    }
}

// Toggle keypad on desktop
// Toggle keypad on desktop
btnToggleKeypad.addEventListener('click', () => {
    const isBinary = currentSettings && currentSettings.gameMode === 'binary_blitz';
    // Binary keypad typically fixed, but if we want to toggle it:
    if (isBinary) {
        // For binary blitz, maybe we don't toggle? Or we toggle binaryKeypad?
        // Since binaryKeypad is inline-grid in 'new_round', let's assume this button is mostly for numeric.
        // But if user wants to type 0/1 on keyboard vs click.
        // Let's just toggle numeric for now or both if active.
    } else {
        numericKeypad.classList.toggle('visible');
    }
    btnToggleKeypad.classList.toggle('active');
});

// Handle keypad button clicks
keypadButtons.forEach(button => {
    button.addEventListener('click', () => {
        const value = button.getAttribute('data-value');
        const action = button.getAttribute('data-action');

        if (value !== null) {
            // Number button clicked
            gameInput.value += value;
        } else if (action === 'backspace') {
            // Backspace button clicked
            gameInput.value = gameInput.value.slice(0, -1);
        } else if (action === 'clear') {
            // Clear button clicked
            gameInput.value = '';
        }

        // Focus input to maintain cursor position (desktop only)
        if (!isMobileDevice()) {
            gameInput.focus();
        }
    });
});

// Re-initialize on window resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(initializeKeypad, 200);
});

// Initialize on load
initializeKeypad();

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

    // Play countdown SFX
    playSFX(sfxCount);

    // Hide both question types during countdown
    const mathExp = document.querySelector('.math-expression');
    if (mathExp) mathExp.style.visibility = 'hidden';

    const optionsArea = document.getElementById('options-area');
    if (optionsArea) optionsArea.style.display = 'none';

    // Reset Answer Input UI
    const inputContainer = document.querySelector('.input-container');
    if (inputContainer) inputContainer.style.display = 'flex';
    gameInput.value = '';
    gameInput.disabled = false;
    btnSubmitAnswer.disabled = false;

    // Reset Options UI
    if (optionsArea) {
        optionsArea.classList.remove('disabled');
        optionsArea.innerHTML = ''; // Clear previous round options
    }

    // Ensure Game Over overlay is closed
    const gameOverOverlay = document.getElementById('game-over-overlay');
    if (gameOverOverlay) gameOverOverlay.style.display = 'none';

    // Clear question initially
    questionNumber.parentElement.classList.remove('fade-in-up');
    questionNumber.innerText = '';

    // START COUNTDOWN
    const countdownOverlay = document.getElementById('start-countdown-overlay');
    const countdownValue = document.getElementById('countdown-value');

    // Reset overlay state (in case it had fade-out class from previous round)
    countdownOverlay.classList.remove('fade-out');
    countdownOverlay.style.display = 'flex';
    countdownOverlay.style.opacity = '1';
    countdownOverlay.style.visibility = 'visible';

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

    // Update Instructions
    const instructionEl = document.getElementById('game-instruction');
    if (instructionEl) {
        let text = "";
        const mode = currentSettings.gameMode;
        if (mode === 'root_rush') text = "Estimate the result of this square root!";
        else if (mode === 'prime_master') text = "Find the prime number faster than other players!";
        else if (mode === 'twenty_four') text = "Use the numbers and operators to make exactly 24!";
        else if (mode === 'binary_blitz') text = "Quick! Be the fastest player to convert this decimal to binary!";
        instructionEl.innerText = text;
    }

    // 1. Update info
    // 2. Show correct UI based on mode
    const mathExp = document.querySelector('.math-expression');
    const inputContainer = document.querySelector('.input-container');

    if (currentSettings.gameMode === 'prime_master') {
        const optionsArea = document.getElementById('options-area');
        optionsArea.style.display = 'grid';
        optionsArea.innerHTML = ''; // Reset
        optionsArea.classList.remove('disabled'); // Ensure interactivity is restored

        // Hide waiting overlay
        const waitingOverlay = document.getElementById('waiting-overlay');
        if (waitingOverlay) waitingOverlay.style.display = 'none';

        // Hide standard math expression and numeric input
        if (mathExp) mathExp.style.display = 'none';
        if (inputContainer) inputContainer.style.display = 'none';
        if (numericKeypad) numericKeypad.classList.remove('visible');

        // Shuffle options for this player specifically
        const rawOptions = data.options || [];
        const shuffledOptions = [...rawOptions];
        for (let i = shuffledOptions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
        }

        shuffledOptions.forEach(val => {
            const tile = document.createElement('div');
            tile.className = 'option-tile';
            tile.innerText = val;
            tile.onclick = () => {
                if (!optionsArea.classList.contains('disabled')) {
                    // Visual feedback
                    const allTiles = optionsArea.querySelectorAll('.option-tile');
                    allTiles.forEach(t => t.classList.remove('selected'));
                    tile.classList.add('selected');

                    optionsArea.classList.add('disabled');
                    socket.emit('submit_answer', { roomId: currentRoomId, answer: val });

                    // Show waiting overlay
                    const waitingOverlay = document.getElementById('waiting-overlay');
                    if (waitingOverlay) waitingOverlay.style.display = 'flex';
                }
            };
            optionsArea.appendChild(tile);
        });
    } else if (currentSettings.gameMode === 'twenty_four') {
        const tfArea = document.getElementById('twenty-four-area');
        tfArea.style.display = 'flex';

        // Hide others
        if (mathExp) mathExp.style.display = 'none';
        if (inputContainer) inputContainer.style.display = 'none';
        if (numericKeypad) numericKeypad.classList.remove('visible');
        const optionsArea = document.getElementById('options-area');
        if (optionsArea) optionsArea.style.display = 'none';
        const waitingOverlay = document.getElementById('waiting-overlay');
        if (waitingOverlay) waitingOverlay.style.display = 'none';

        // Setup 24 Game UI
        initializeTwentyFourGame(data.question); // question is [n1, n2, n3, n4]
    } else if (currentSettings.gameMode === 'binary_blitz') {
        // Binary Blitz Mode
        if (mathExp) {
            mathExp.style.display = 'flex';
            mathExp.style.visibility = 'visible';
            // Remove radical sign if present, or just use question-number text
            const radicalSpan = mathExp.querySelector('.radical');
            if (radicalSpan) radicalSpan.style.display = 'none';
        }

        if (inputContainer) inputContainer.style.display = 'flex';

        // Hide standard keypad, show binary
        if (numericKeypad) numericKeypad.classList.remove('visible');
        const binaryKeypad = document.getElementById('binary-keypad');
        if (binaryKeypad) binaryKeypad.style.display = 'grid';

        const optionsArea = document.getElementById('options-area');
        if (optionsArea) optionsArea.style.display = 'none';
        const tfArea = document.getElementById('twenty-four-area');
        if (tfArea) tfArea.style.display = 'none';

        questionNumber.parentElement.classList.remove('fade-in-up');
        void questionNumber.offsetWidth; // Trigger reflow
        questionNumber.innerText = data.question; // Decimal number
    } else {
        // Root Rush mode
        if (mathExp) {
            mathExp.style.display = 'flex';
            mathExp.style.visibility = 'visible';
            const radicalSpan = mathExp.querySelector('.radical');
            if (radicalSpan) radicalSpan.style.display = 'inline';
        }
        if (inputContainer) inputContainer.style.display = 'flex';
        const optionsArea = document.getElementById('options-area');
        if (optionsArea) optionsArea.style.display = 'none';
        const tfArea = document.getElementById('twenty-four-area');
        if (tfArea) tfArea.style.display = 'none';

        // Hide binary keypad
        const binaryKeypad = document.getElementById('binary-keypad');
        if (binaryKeypad) binaryKeypad.style.display = 'none';

        // Restore keypad if mobile
        if (isMobileDevice()) {
            if (numericKeypad) numericKeypad.classList.add('visible');
        }

        questionNumber.parentElement.classList.remove('fade-in-up');
        void questionNumber.offsetWidth; // Trigger reflow
        questionNumber.innerText = data.question.toLocaleString(); // Format with commas
    }

    // Update Round Counter
    roundBadge.innerText = data.round;
    totalRoundsBadge.innerText = data.totalRounds;
    // questionNumber.parentElement.classList.add('fade-in-up'); // DISABLED per request for snappy load

    // 3. Reset Input
    gameInput.value = '';
    gameInput.disabled = false;
    gameInput.focus();
    feedbackContainer.innerHTML = '';

    // 4. Start Timer Animation
    if (countdownInterval) clearInterval(countdownInterval);
    if (ticTacTimeout) clearTimeout(ticTacTimeout);
    stopSFX(sfxTicTac);

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

    // TicTac sound (last 1/3)
    ticTacTimeout = setTimeout(() => {
        playSFX(sfxTicTac);
    }, (duration * 2 / 3) * 1000);
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

// Restrict Input for Binary Blitz
gameInput.addEventListener('input', (e) => {
    if (currentSettings && currentSettings.gameMode === 'binary_blitz') {
        // Remove any character that is not 0 or 1
        const val = gameInput.value;
        const cleanVal = val.replace(/[^01]/g, '');
        if (val !== cleanVal) {
            gameInput.value = cleanVal;
            // Optionally shake or show brief error
        }
    }
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
    // Stop local timer and TicTac
    if (countdownInterval) clearInterval(countdownInterval);
    if (ticTacTimeout) clearTimeout(ticTacTimeout);
    stopSFX(sfxTicTac);

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

    // Find my result
    const myResult = data.rankings.find(r => r.id === socket.id);
    const myRank = data.rankings.indexOf(myResult);

    // Check if I am a winner (must have answered and be 1st or tied for 1st)
    const isWinner = myResult && myResult.awarded > 0 && (myRank === 0 ||
        (data.isTie && myResult.diff === data.rankings[0].diff && data.mode === 'root_rush') ||
        (data.isTie && myResult.time === data.rankings[0].time && (data.mode === 'prime_master' || data.mode === 'twenty_four' || data.mode === 'binary_blitz')));

    const isTie = !!data.isTie;

    // Set winner section based on my result
    const winnerIcon = winnerSection.querySelector('i');
    const winnerLabel = winnerSection.querySelector('.winner-label');

    if (data.winner === "No one") {
        winnerSection.classList.add('no-winner');
        winnerSection.classList.remove('is-tie');
        winnerNameEl.innerText = "No one got it right!";
        winnerLabel.innerText = "Try faster next time!";
        winnerLabel.style.display = 'inline';
        winnerIcon.style.display = 'none';
    } else if (isTie) {
        // Empate
        winnerSection.classList.remove('no-winner');
        winnerSection.classList.add('is-tie');
        winnerIcon.className = 'fa-solid fa-handshake';
        winnerIcon.style.display = 'block';
        winnerNameEl.innerText = "It's a tie!";
        winnerLabel.innerText = data.mode === 'prime_master' ? "Multiple players were just as fast!" : "Multiple players had the same difference";
        winnerLabel.style.display = 'inline';
    } else if (isWinner) {
        // Yo gané
        winnerSection.classList.remove('no-winner', 'is-tie');
        winnerIcon.className = 'fa-solid fa-trophy';
        winnerIcon.style.display = 'block';
        winnerNameEl.innerText = "You won this round!";
        winnerLabel.innerText = "You were the closest!";
        winnerLabel.style.display = 'inline';
    } else {
        // Otro ganó
        winnerSection.classList.remove('no-winner', 'is-tie');
        winnerIcon.className = 'fa-solid fa-times-circle';
        winnerIcon.style.display = 'block';
        winnerNameEl.innerText = `${data.winner} won`;
        winnerLabel.innerText = "was the closest";
        winnerLabel.style.display = 'inline';
    }

    // Play result SFX
    if (isWinner) {
        playSFX(sfxGoodAns);
    } else {
        playSFX(sfxBadAns);
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

            const playerInfo = document.createElement('div');
            playerInfo.className = 'player-info';

            const playerName = document.createElement('div');
            playerName.className = 'player-name';
            playerName.innerText = r.name + (isMe ? ' (You)' : '');

            const playerDetails = document.createElement('div');
            playerDetails.className = 'player-details';

            const answer = document.createElement('span');
            answer.className = 'player-answer';
            answer.innerText = r.answer !== null ? r.answer : '-';

            const extra = document.createElement('span');
            extra.className = 'answer-diff';

            if (data.mode === 'prime_master' || data.mode === 'twenty_four' || data.mode === 'binary_blitz') {
                // Show speed in seconds
                if (r.time && r.time !== Infinity) {
                    const speed = ((r.time - data.startTime) / 1000).toFixed(2);
                    extra.innerText = `${speed}s`;
                } else {
                    extra.innerText = '-';
                }
            } else {
                // Show difference
                extra.innerText = (r.diff !== null && r.diff !== undefined && r.diff !== Infinity) ? `±${r.diff}` : '-';
            }

            // For 24 game, render formatting if correct
            if (data.mode === 'twenty_four' && r.diff === 0) {
                // show the formula instead of the plain number answer if available
                if (r.answer && typeof r.answer === 'string') {
                    // r.answer comes as "3+4+5+6 = 24" from backend
                    answer.innerText = r.answer.replace(' = 24', '');
                }
            }

            playerDetails.appendChild(answer);
            playerDetails.appendChild(extra);
            playerInfo.appendChild(playerName);
            playerInfo.appendChild(playerDetails);

            const points = document.createElement('div');
            points.className = 'points-earned';
            points.innerText = r.awarded ? `+${r.awarded}` : '0';

            row.appendChild(rankNum);
            row.appendChild(playerInfo);
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

    // Play Applause with 4s + 1s fade-out
    playSFX(sfxApplause);
    if (applauseTimeout) clearTimeout(applauseTimeout);
    if (applauseFadeInterval) clearInterval(applauseFadeInterval);

    applauseTimeout = setTimeout(() => {
        const fadeDuration = 1000;
        const interval = 50;
        const step = interval / fadeDuration;

        applauseFadeInterval = setInterval(() => {
            sfxApplause.volume = Math.max(sfxApplause.volume - (0.5 * step), 0);
            if (sfxApplause.volume <= 0) {
                clearInterval(applauseFadeInterval);
                stopSFX(sfxApplause);
            }
        }, interval);
    }, 4000);
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
let lastUserCount = 0;
socket.on('update_users', (users) => {
    // Play enter sound if someone joined (and it's not the initial join)
    if (users.length > lastUserCount && lastUserCount > 0) {
        playSFX(sfxPlayerEnter);
    }
    lastUserCount = users.length;

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
    stopAllSounds();
    currentRoomId = null; // Prevent beforeunload prompt
    window.location.reload();
});

// ==========================================
// 24 GAME LOGIC
// ==========================================
function initializeTwentyFourGame(numbers) {
    const handArea = document.getElementById('tf-hand-area');
    const equationArea = document.getElementById('tf-equation-area');
    const operatorArea = document.getElementById('tf-operator-area');

    handArea.innerHTML = '';
    equationArea.innerHTML = '<div class="tf-placeholder">Make 24! Click or drag numbers/operators.</div>';

    // Clear operators selection state if any

    // Create Number Tiles
    numbers.forEach((num, index) => {
        const tile = createTfTile(num, 'number', index);
        handArea.appendChild(tile);
    });

    // Re-attach listeners to static operators (if lost or just ensuring)
    const operators = operatorArea.querySelectorAll('.tf-tile.operator');
    operators.forEach(op => {
        // Clone to remove old listeners
        const newOp = op.cloneNode(true);
        op.parentNode.replaceChild(newOp, op);

        newOp.addEventListener('click', () => {
            moveTileToEquation(newOp.cloneNode(true));
        });

        // Draggable for operators?
        // Let's make copies draggable
        newOp.setAttribute('draggable', 'true');
        newOp.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({
                val: newOp.getAttribute('data-val'),
                type: 'operator'
            }));
            newOp.classList.add('dragging');
        });
        newOp.addEventListener('dragend', () => {
            newOp.classList.remove('dragging');
        });
    });

    // Equation Area Drop Zone
    equationArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        equationArea.classList.add('drag-over');
    });

    equationArea.addEventListener('dragleave', () => {
        equationArea.classList.remove('drag-over');
    });

    equationArea.addEventListener('drop', (e) => {
        e.preventDefault();
        equationArea.classList.remove('drag-over');
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));

        if (data.type === 'number') {
            // Find the original tile in hand or moved
            const originalId = `tf-num-${data.index}`;
            const original = document.getElementById(originalId);
            if (original && original.parentElement === handArea) {
                moveTileToEquation(original);
            }
        } else if (data.type === 'operator') {
            // Create new operator tile
            const newOp = document.createElement('div');
            newOp.className = 'tf-tile operator';
            newOp.innerText = data.val === '*' ? '×' : (data.val === '/' ? '÷' : data.val);
            newOp.setAttribute('data-val', data.val);
            moveTileToEquation(newOp);
        }
    });

    // Clear Button
    document.getElementById('btn-tf-clear').onclick = () => {
        // Move all numbers back to hand
        const nums = equationArea.querySelectorAll('.tf-tile.number-tile');
        nums.forEach(n => {
            handArea.appendChild(n);
        });
        // Remove operators
        const ops = equationArea.querySelectorAll('.tf-tile.operator');
        ops.forEach(o => o.remove());

        checkPlaceholder();
    };

    // Submit Button
    document.getElementById('btn-tf-submit').onclick = () => {
        submitTwentyFourAnswer();
    };
}

function createTfTile(val, type, index) {
    const tile = document.createElement('div');
    tile.className = `tf-tile ${type === 'number' ? 'number-tile' : 'operator'}`;
    tile.innerText = val;
    if (type === 'number') {
        tile.id = `tf-num-${index}`;
        tile.setAttribute('data-index', index);
        tile.setAttribute('data-val', val);
    } else {
        tile.setAttribute('data-val', val);
    }

    tile.setAttribute('draggable', 'true');

    // Click Handler
    tile.addEventListener('click', () => {
        if (tile.parentElement.id === 'tf-hand-area') {
            moveTileToEquation(tile);
        } else if (tile.parentElement.id === 'tf-equation-area') {
            if (type === 'number') {
                document.getElementById('tf-hand-area').appendChild(tile);
            } else {
                tile.remove();
            }
            checkPlaceholder();
        }
    });

    // Drag start
    tile.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({
            val: val,
            type: type,
            index: index
        }));
        tile.classList.add('dragging');
    });

    tile.addEventListener('dragend', () => {
        tile.classList.remove('dragging');
    });

    return tile;
}

function moveTileToEquation(tile) {
    const equationArea = document.getElementById('tf-equation-area');
    const placeholder = equationArea.querySelector('.tf-placeholder');
    if (placeholder) placeholder.remove();

    equationArea.appendChild(tile);

    // Ensure the tile being moved has the 'return' click behavior
    // If it was a clone (operator), it needs a listener
    // If it was an existing node (number), it keeps its listener but logic branches on parentElement

    // If it's a new operator clone, we need to add the click-to-remove listener
    if (tile.classList.contains('operator') && !tile.onclick) {
        tile.onclick = () => {
            tile.remove();
            checkPlaceholder();
        };
    }
}

function checkPlaceholder() {
    const equationArea = document.getElementById('tf-equation-area');
    if (equationArea.children.length === 0) {
        equationArea.innerHTML = '<div class="tf-placeholder">Drag numbers and operators here...</div>';
    }
}

function submitTwentyFourAnswer() {
    const equationArea = document.getElementById('tf-equation-area');
    const tiles = Array.from(equationArea.children);

    if (tiles.some(t => t.classList.contains('tf-placeholder'))) {
        showModal('Error', 'Please build an expression first!');
        return;
    }

    let expression = '';
    tiles.forEach(tile => {
        const val = tile.getAttribute('data-val');
        expression += val;
    });

    console.log("Submitting:", expression);

    // Optional: Local validation of 4 numbers used?
    // We can let server handle it or give fast feedback.
    // Let's rely on server for robust logic, but could check count locally.
    // Optional: Local validation
    // We used to check numsUsed < 4, but user requested allowing subsets.
    const numsUsed = tiles.filter(t => t.classList.contains('number-tile')).length;
    if (numsUsed === 0) {
        showModal('Hint', 'You must use at least one number!');
        return;
    }

    socket.emit('submit_answer', { roomId: currentRoomId, answer: expression });

    const waitingOverlay = document.getElementById('waiting-overlay');
    if (waitingOverlay) waitingOverlay.style.display = 'flex';
}

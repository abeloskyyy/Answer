// Firebase Configuration
// IMPORTANT: Replace the measurements below with your own from the Firebase Console!
// Go to: Project Settings -> General -> Your apps -> SDK setup and configuration -> CDN

const firebaseConfig = {
    apiKey: "AIzaSyB2FDp-ZB2KGW10eR2CrOrFMD2PhWMKx6U",
    authDomain: "answer-mathgame.firebaseapp.com",
    projectId: "answer-mathgame",
    storageBucket: "answer-mathgame.firebasestorage.app",
    messagingSenderId: "894472877590",
    appId: "1:894472877590:web:d3b3e38e75c5c35881a737"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
window.auth = firebase.auth();

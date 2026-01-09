// Configuration for the client
// This file will be overwritten by the build script for production if needed
window.GAME_CONFIG = {
    // Default to current host if typically served, but for mobile this will need to be the server IP
    // For local dev with "npm start", it's fine.
    // When built for mobile, user should change this.
    SERVER_URL: window.location.hostname === 'localhost' || window.location.protocol === 'file:'
        ? "http://localhost:3000"
        : window.location.origin
};

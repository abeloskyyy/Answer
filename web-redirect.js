// ============================================
// WEB TO APP REDIRECT LOGIC
// ============================================
// This script detects if the mobile app is installed and redirects to it
// Place this in the <head> of your web version (index.html)

(function () {
    'use strict';

    // Only run on mobile devices
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    // Don't redirect if already in the app
    function isInApp() {
        return window.cordova !== undefined;
    }

    if (isMobileDevice() && !isInApp()) {
        console.log('Mobile device detected, checking for app...');

        // Get room code from URL if present
        const urlParams = new URLSearchParams(window.location.search);
        const roomCode = urlParams.get('c');

        // Build deep link URL
        let deepLinkUrl = 'answer://open';
        if (roomCode) {
            deepLinkUrl += '?c=' + roomCode.toUpperCase();
        }

        // Try to open the app
        const startTime = Date.now();
        let hasFocused = false;

        // Listen for visibility change (app opened successfully)
        const onVisibilityChange = function () {
            if (document.hidden) {
                hasFocused = true;
            }
        };

        const onBlur = function () {
            hasFocused = true;
        };

        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('blur', onBlur);
        window.addEventListener('pagehide', onBlur);

        // Attempt to open the app
        window.location.href = deepLinkUrl;

        // If app didn't open after 2 seconds, assume it's not installed
        setTimeout(function () {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('pagehide', onBlur);

            const elapsed = Date.now() - startTime;

            // If the page is still visible and focused, app probably isn't installed
            if (!hasFocused && !document.hidden && elapsed < 3000) {
                console.log('App not detected, staying on web version');
                // Optionally show a banner suggesting to install the app
                showAppInstallBanner(roomCode);
            }
        }, 2500);
    }

    // Optional: Show a banner suggesting to install the app
    function showAppInstallBanner(roomCode) {
        // Only show once per session
        if (sessionStorage.getItem('appBannerShown')) return;
        sessionStorage.setItem('appBannerShown', 'true');

        const banner = document.createElement('div');
        banner.id = 'app-install-banner';
        banner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 20px;
            text-align: center;
            z-index: 10000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            font-family: 'Fredoka', sans-serif;
            animation: slideDown 0.3s ease-out;
        `;

        banner.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; max-width: 600px; margin: 0 auto;">
                <div style="flex: 1; text-align: left;">
                    <strong>📱 Get the App!</strong>
                    <div style="font-size: 0.85rem; opacity: 0.9; margin-top: 2px;">
                        Better experience on mobile
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <a href="https://play.google.com/store/apps/details?id=com.abelosky.answer" 
                       target="_blank"
                       style="background: white; color: #667eea; padding: 8px 16px; border-radius: 20px; text-decoration: none; font-weight: 600; font-size: 0.9rem;">
                        Install
                    </a>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                            style="background: transparent; border: 1px solid white; color: white; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-weight: 600; font-size: 0.9rem;">
                        ✕
                    </button>
                </div>
            </div>
        `;

        // Add animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideDown {
                from {
                    transform: translateY(-100%);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(banner);

        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (banner.parentElement) {
                banner.style.animation = 'slideDown 0.3s ease-out reverse';
                setTimeout(() => banner.remove(), 300);
            }
        }, 10000);
    }
})();

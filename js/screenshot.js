// ==UserScript==
// @name         Screenshot
// @namespace    video-screenshot
// @version      1.2.2
// @description  Screenshot any video on any website
// @match        *://*/*
// @exclude      /^https?://\S+\.(txt|png|jpg|jpeg|gif|xml|svg|manifest|log|ini)[^\/]*$/
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';

    if (window.top !== window) return;

    // ========== CONFIG ==========
    const CONFIG = {
        btnSize: 28,
        btnTop: 40,
        btnLeft: 10,
        iconSize: 28,
        minVideoWidth: 200,
        minVideoHeight: 150,
        fadeDelay: 3000,
        hideDelay: 3000,
        fadeOpacity: 0.4,
        minOpacity: 0.15,
        tapThreshold: 20,
        shortcutKey: 's'
    };

    // ========== CONSTANTS ==========
    const ICON = `<svg viewBox="0 0 24 24" width="${CONFIG.iconSize}" height="${CONFIG.iconSize}" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
    const IS_MOBILE = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const processedVideos = new WeakSet();

    // ========== STYLES ==========
    const injectStyles = () => {
        const style = document.createElement('style');
        style.textContent = `
            .video-screenshot-container {
                position: absolute;
                top: ${CONFIG.btnTop}px;
                left: ${CONFIG.btnLeft}px;
                z-index: 9999;
                opacity: 1;
                transition: opacity 0.5s;
                pointer-events: auto;
            }
            .video-screenshot-btn {
                width: ${CONFIG.btnSize}px;
                height: ${CONFIG.btnSize}px;
                border: none;
                border-radius: 18px;
                background: rgba(18, 18, 18, 0.7);
                color: #3f3f3f61;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                backdrop-filter: blur(1px);
                transition: background 0.15s, transform 0.15s;
                touch-action: manipulation;
                -webkit-tap-highlight-color: transparent;
            }
            .video-screenshot-btn:hover,
            .video-screenshot-btn:active {
                background: rgba(26, 26, 26, 0.9);
                color: #000;
            }
            .video-screenshot-btn:hover { transform: scale(1.1); }
            .video-screenshot-btn:active { transform: scale(0.95); }
        `;
        document.head.appendChild(style);
    };

    // ========== CORE FUNCTIONS ==========
    const capture = (video) => {
        if (!video?.videoWidth) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);

        const filename = `${document.title.trim() || 'screenshot'}_${Date.now()}.png`;
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = filename.replace(/[<>:"/\\|?*]/g, '_');
        link.click();
    };

    const addButton = (video) => {
        if (processedVideos.has(video)) return;
        if (video.offsetWidth < CONFIG.minVideoWidth || video.offsetHeight < CONFIG.minVideoHeight) return;
        processedVideos.add(video);

        const container = document.createElement('div');
        container.className = 'video-screenshot-container';

        const btn = document.createElement('button');
        btn.className = 'video-screenshot-btn';
        btn.innerHTML = ICON;
        btn.title = 'Chụp màn hình (S)';

        // Event handler
        const handleCapture = (e) => {
            e.preventDefault();
            e.stopPropagation();
            capture(video);
        };

        // Touch events for mobile
        if (IS_MOBILE) {
            let touch = null;
            btn.addEventListener('touchstart', (e) => {
                touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                e.stopPropagation();
            }, { passive: true });

            btn.addEventListener('touchend', (e) => {
                if (!touch) return;
                const t = e.changedTouches[0];
                if (Math.abs(t.clientX - touch.x) < CONFIG.tapThreshold &&
                    Math.abs(t.clientY - touch.y) < CONFIG.tapThreshold) {
                    handleCapture(e);
                }
                touch = null;
            }, { passive: false });

            btn.addEventListener('touchmove', () => { touch = null; }, { passive: true });
        }

        btn.addEventListener('click', handleCapture);
        container.appendChild(btn);

        // Position
        const parent = video.parentElement;
        if (parent) {
            if (getComputedStyle(parent).position === 'static') {
                parent.style.position = 'relative';
            }
            parent.appendChild(container);
        }

        // Auto-hide logic
        let fadeTimer, hideTimer;
        const show = () => {
            clearTimeout(fadeTimer);
            clearTimeout(hideTimer);
            container.style.opacity = '1';
            startHide();
        };

        const startHide = () => {
            fadeTimer = setTimeout(() => {
                container.style.opacity = CONFIG.fadeOpacity;
                hideTimer = setTimeout(() => {
                    container.style.opacity = CONFIG.minOpacity;
                }, CONFIG.hideDelay);
            }, CONFIG.fadeDelay);
        };

        video.addEventListener('click', show);
        if (IS_MOBILE) video.addEventListener('touchstart', show, { passive: true });
        container.addEventListener('mouseenter', show);
        container.addEventListener('mouseleave', startHide);

        show();
    };

    // ========== KEYBOARD SHORTCUT ==========
    const initKeyboard = () => {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
            if (e.key.toLowerCase() === CONFIG.shortcutKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                for (const video of document.querySelectorAll('video')) {
                    const r = video.getBoundingClientRect();
                    if (r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0 && video.videoWidth) {
                        e.preventDefault();
                        capture(video);
                        break;
                    }
                }
            }
        });
    };

    // ========== INIT ==========
    const scan = () => document.querySelectorAll('video').forEach(addButton);

    injectStyles();
    initKeyboard();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    scan();
    setTimeout(scan, 1000);
    setTimeout(scan, 3000);
})();

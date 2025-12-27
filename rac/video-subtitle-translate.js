// ==UserScript==
// @name         Video Subtitle Translator
// @namespace    video-subtitle-translate
// @version      2.0.1
// @description  Translate video subtitles on any website including YouTube
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      translate.googleapis.com
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';

    if (window.top !== window) return;

    // ===== CONFIGURATION =====
    const CONFIG = {
        targetLang: 'vi',
        translatedFontSize: 16,
        translatedColor: '#ffeb3b',
        showOriginal: true
    };

    try {
        const saved = localStorage.getItem('video-subtitle-settings');
        if (saved) Object.assign(CONFIG, JSON.parse(saved));
    } catch (e) { }

    const saveConfig = () => {
        localStorage.setItem('video-subtitle-settings', JSON.stringify(CONFIG));
        updateStyles();
    };

    // ===== STATE =====
    const state = {
        enabled: false,
        cache: new Map(),
        observer: null,
        processing: new Set()
    };

    // ===== SUBTITLE SELECTORS =====
    // Use specific selectors to avoid duplicates
    const SUBTITLE_SELECTORS = [
        // YouTube - only caption segment, not nested spans
        '.ytp-caption-segment',
        // Netflix
        '.player-timedtext-text-container > span',
        // Vimeo
        '.vp-captions > span',
        '.captions-text',
        // Bilibili
        '.bpx-player-subtitle-panel-text',
        // Amazon Prime
        '.atvwebplayersdk-captions-text',
        // Disney+
        '.cue-container > span',
        // Generic - direct children only
        '.caption-window > span',
        '.subtitle > span',
        '.vjs-text-track-cue > span'
    ].join(', ');

    // ===== ICONS =====
    const ICONS = {
        translate: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2v3"/><path d="M22 22l-5-10-5 10M14 18h6"/></svg>`,
        translateActive: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>`,
        settings: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`
    };

    // ===== TRANSLATION API =====
    async function translateText(text) {
        if (!text?.trim()) return '';

        const key = text.trim();
        if (state.cache.has(key)) return state.cache.get(key);
        if (state.processing.has(key)) return '';

        state.processing.add(key);

        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${CONFIG.targetLang}&dt=t&q=${encodeURIComponent(text)}`;

            if (typeof GM_xmlhttpRequest !== 'undefined') {
                return new Promise((resolve) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: url,
                        onload: (res) => {
                            try {
                                const data = JSON.parse(res.responseText);
                                const translated = data[0]?.map(i => i[0]).join('') || '';
                                if (state.cache.size >= 500) {
                                    state.cache.delete(state.cache.keys().next().value);
                                }
                                state.cache.set(key, translated);
                                resolve(translated);
                            } catch (e) {
                                resolve('');
                            }
                            state.processing.delete(key);
                        },
                        onerror: () => {
                            state.processing.delete(key);
                            resolve('');
                        }
                    });
                });
            }

            const res = await fetch(url);
            const data = await res.json();
            const translated = data[0]?.map(i => i[0]).join('') || '';

            if (state.cache.size >= 500) {
                state.cache.delete(state.cache.keys().next().value);
            }
            state.cache.set(key, translated);
            return translated;
        } catch (e) {
            return '';
        } finally {
            state.processing.delete(key);
        }
    }

    // ===== SUBTITLE PROCESSING =====
    async function processSubtitle(el) {
        const text = el.textContent?.trim();
        if (!text || el.dataset.vstDone || text.length < 2) return;

        // Skip if parent already processed (avoid duplicates)
        if (el.parentElement?.dataset.vstDone) return;

        const translated = await translateText(text);
        if (translated && translated !== text && el.isConnected) {
            el.dataset.vstDone = '1';
            el.dataset.vstText = translated;
            el.classList.add('vst-has-translation');
        }
    }

    function scanSubtitles() {
        if (!state.enabled) return;
        document.querySelectorAll(SUBTITLE_SELECTORS).forEach(el => {
            if (!el.dataset.vstDone && el.textContent?.trim()) {
                processSubtitle(el);
            }
        });
    }

    // ===== OBSERVER =====
    function startObserver() {
        if (state.observer) return;
        state.observer = new MutationObserver(() => {
            if (state.enabled) scanSubtitles();
        });
        state.observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    function stopObserver() {
        state.observer?.disconnect();
        state.observer = null;
    }

    // ===== TOGGLE =====
    function toggle() {
        state.enabled = !state.enabled;

        const btn = document.querySelector('#vst-toggle-btn');
        if (btn) {
            btn.innerHTML = state.enabled ? ICONS.translateActive : ICONS.translate;
            btn.style.background = state.enabled ? 'rgba(255, 235, 59, 0.9)' : 'rgba(0, 0, 0, 0.7)';
            btn.style.color = state.enabled ? '#000' : '#fff';
        }

        if (state.enabled) {
            startObserver();
            scanSubtitles();
        } else {
            stopObserver();
            document.querySelectorAll('.vst-has-translation').forEach(el => {
                delete el.dataset.vstDone;
                delete el.dataset.vstText;
                el.classList.remove('vst-has-translation');
            });
        }
    }

    // ===== STYLES =====
    function updateStyles() {
        let style = document.querySelector('#vst-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'vst-styles';
            document.head.appendChild(style);
        }

        style.textContent = `
            /* Translation display */
            .vst-has-translation[data-vst-text]::after {
                content: attr(data-vst-text);
                display: block;
                color: ${CONFIG.translatedColor};
                font-size: ${CONFIG.translatedFontSize}px;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.9), -1px -1px 2px rgba(0,0,0,0.9);
                margin-top: 4px;
                line-height: 1.3;
            }
            ${!CONFIG.showOriginal ? '.vst-has-translation { font-size: 0 !important; }' : ''}
            
            /* Floating button */
            #vst-container {
                position: fixed;
                bottom: 80px;
                right: 16px;
                z-index: 2147483647;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            #vst-toggle-btn, #vst-settings-btn {
                width: 40px;
                height: 40px;
                border: none;
                border-radius: 50%;
                background: rgba(0, 0, 0, 0.7);
                color: #fff;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                backdrop-filter: blur(4px);
                transition: all 0.2s;
                touch-action: manipulation;
            }
            #vst-toggle-btn:hover, #vst-settings-btn:hover {
                transform: scale(1.1);
                opacity: 1 !important;
            }
            #vst-settings-btn {
                width: 32px;
                height: 32px;
            }
            
            /* Auto-hide states */
            #vst-container.vst-fade {
                opacity: 0.4;
            }
            #vst-container.vst-hidden {
                opacity: 0;
                pointer-events: none;
            }
            #vst-container:hover {
                opacity: 1 !important;
                pointer-events: auto !important;
            }
            
            /* Settings panel */
            #vst-settings-panel {
                position: fixed;
                bottom: 140px;
                right: 16px;
                background: rgba(28, 28, 28, 0.95);
                border-radius: 12px;
                padding: 16px;
                z-index: 2147483647;
                min-width: 240px;
                color: #fff;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                backdrop-filter: blur(10px);
                display: none;
            }
            #vst-settings-panel.vst-open { display: block; }
            #vst-settings-panel h4 {
                margin: 0 0 12px;
                font-size: 14px;
                font-weight: 500;
            }
            #vst-settings-panel .row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            #vst-settings-panel label { color: #aaa; }
            #vst-settings-panel input[type="range"] { width: 80px; }
            #vst-settings-panel input[type="color"] {
                width: 32px;
                height: 24px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
        `;
    }

    // ===== AUTO-HIDE =====
    let fadeTimer = null;
    let hideTimer = null;

    function resetAutoHide() {
        const container = document.querySelector('#vst-container');
        if (!container) return;

        container.classList.remove('vst-fade', 'vst-hidden');

        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);

        fadeTimer = setTimeout(() => {
            if (!state.enabled) container.classList.add('vst-fade');
        }, 3000);

        hideTimer = setTimeout(() => {
            if (!state.enabled) container.classList.add('vst-hidden');
        }, 10000);
    }

    function setupAutoHide() {
        document.addEventListener('mousemove', resetAutoHide);
        document.addEventListener('click', resetAutoHide);
        resetAutoHide();
    }

    // ===== TOGGLE SETTINGS =====
    function toggleSettings(e) {
        e.stopPropagation();
        const panel = document.querySelector('#vst-settings-panel');
        if (panel) panel.classList.toggle('vst-open');
    }

    // ===== UI =====
    function createUI() {
        if (!document.querySelector('video')) return;
        if (document.querySelector('#vst-container')) return;

        const container = document.createElement('div');
        container.id = 'vst-container';

        // Toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'vst-toggle-btn';
        toggleBtn.innerHTML = ICONS.translate;
        toggleBtn.title = 'Dịch phụ đề (T)';
        toggleBtn.onclick = (e) => { e.stopPropagation(); toggle(); };

        // Settings button
        const settingsBtn = document.createElement('button');
        settingsBtn.id = 'vst-settings-btn';
        settingsBtn.innerHTML = ICONS.settings;
        settingsBtn.title = 'Cài đặt';
        settingsBtn.onclick = toggleSettings;

        container.appendChild(toggleBtn);
        container.appendChild(settingsBtn);
        document.body.appendChild(container);

        // Settings panel
        const panel = document.createElement('div');
        panel.id = 'vst-settings-panel';
        panel.innerHTML = `
            <h4>Cài đặt phụ đề</h4>
            <div class="row">
                <label>Cỡ chữ dịch</label>
                <div><input type="range" id="vst-fontsize" min="12" max="32" value="${CONFIG.translatedFontSize}"> <span id="vst-fontsize-val">${CONFIG.translatedFontSize}px</span></div>
            </div>
            <div class="row">
                <label>Màu dịch</label>
                <input type="color" id="vst-color" value="${CONFIG.translatedColor}">
            </div>
        `;
        panel.onclick = (e) => e.stopPropagation();
        document.body.appendChild(panel);

        // Start auto-hide
        setupAutoHide();

        // Settings events
        panel.querySelector('#vst-fontsize').oninput = (e) => {
            CONFIG.translatedFontSize = parseInt(e.target.value);
            panel.querySelector('#vst-fontsize-val').textContent = CONFIG.translatedFontSize + 'px';
            saveConfig();
        };
        panel.querySelector('#vst-color').oninput = (e) => {
            CONFIG.translatedColor = e.target.value;
            saveConfig();
        };

        // Close panel on outside click
        document.addEventListener('click', () => {
            panel.classList.remove('vst-open');
        });
    }

    // ===== KEYBOARD =====
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
        if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.altKey && !e.metaKey) {
            if (document.querySelector('video')) {
                e.preventDefault();
                toggle();
            }
        }
    });

    // ===== INIT =====
    function init() {
        updateStyles();
        createUI();
    }

    // Wait for video
    const checkVideo = () => {
        if (document.querySelector('video')) {
            init();
        }
    };

    const videoObserver = new MutationObserver(checkVideo);
    videoObserver.observe(document.body, { childList: true, subtree: true });

    if (document.readyState === 'complete') {
        checkVideo();
    } else {
        window.addEventListener('load', checkVideo);
    }

    setTimeout(checkVideo, 2000);
})();

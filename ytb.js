// ==UserScript==
// @name         YSub
// @namespace    yt
// @version      2.9.0
// @description  Bilingual Subtitles with Settings and Drag Support
// @match        https://www.youtube.com/*
// @updateURL    https://raw.githubusercontent.com/quanghy-hub/script-cat/refs/heads/main/yt.js
// @downloadURL  https://raw.githubusercontent.com/quanghy-hub/script-cat/refs/heads/main/yt.js
// @exclude      /^https?://\S+\.(txt|png|jpg|jpeg|gif|xml|svg|manifest|log|ini|webp|webm)[^\/]*$/
// @exclude      /^https?://\S+_live_chat*$/
// @connect      translate.googleapis.com
// @inject-into  page
// @allFrames    true
// @run-at       document-start
// ==/UserScript==

(() => {
    'use strict';
    if (window.top !== window) return;

    // ==================== CONFIG ====================
    const CONFIG = {
        STORAGE_KEY: 'yt-subtitle-settings',
        CACHE_LIMIT: 500,
        DEBOUNCE_MS: 300,           // Tăng debounce để giảm cập nhật
        SENTENCE_STABLE_MS: 800,    // Đợi câu ổn định trước khi dịch
        MIN_TEXT_LENGTH: 15,        // Độ dài tối thiểu để bắt đầu dịch
        TRANSLATE_API: 'https://translate.googleapis.com/translate_a/single'
    };

    const SELECTORS = {
        player: '#movie_player, .html5-video-player',
        controls: '.ytp-right-controls',
        translateBtn: '.ytp-translate-button',
        settingsBtn: '.ytp-subtitle-settings-button',
        settingsPanel: '#yt-subtitle-settings',
        subtitleContainer: '#yt-bilingual-subtitles',
        captionSegment: '.ytp-caption-segment',
        video: 'video'
    };

    const ICONS = {
        translate: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2v3"/><path d="M22 22l-5-10-5 10M14 18h6"/></svg>`,
        translateActive: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>`,
        settings: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`
    };

    // ==================== UTILITIES ====================
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);
    const isWatchPage = () => /\/watch|[?&]v=/.test(location.href);

    const safeHTML = (html) => {
        if (typeof trustedTypes !== 'undefined' && trustedTypes.defaultPolicy) {
            return trustedTypes.defaultPolicy.createHTML(html);
        }
        return html;
    };

    // ==================== SETTINGS ====================
    const Settings = {
        defaults: {
            targetLang: 'vi',
            fontSize: 16,
            translatedFontSize: 16,
            originalColor: '#ffffff',
            translatedColor: '#0e8cecff',
            displayMode: 'compact',
            showOriginal: true,
            containerPosition: { x: '5%', y: '70px' }, // Vị trí container
            containerAlignment: 'left' // Canh lề: left, center, right
        },
        current: null,

        load() {
            try {
                const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
                this.current = { ...this.defaults, ...(saved ? JSON.parse(saved) : {}) };
            } catch {
                this.current = { ...this.defaults };
            }
            return this.current;
        },

        save() {
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.current));
            Styles.update();
        },

        get(key) {
            return this.current?.[key] ?? this.defaults[key];
        },

        set(key, value) {
            this.current[key] = value;
            this.save();
        },

        // Lưu vị trí container
        saveContainerPosition(x, y, alignment = 'left') {
            this.current.containerPosition = { x, y };
            this.current.containerAlignment = alignment;
            this.save();
        }
    };

    // ==================== STATE ====================
    const State = {
        translateEnabled: false,
        observer: null,
        processTimeout: null,
        sentenceTimeout: null,
        cache: new Map(),
        isDragging: false,
        dragStartPos: { x: 0, y: 0 },
        containerStartPos: { x: 0, y: 0 },
        currentDragPos: null,
        lastRawText: '',
        lastStableText: '',
        pendingText: ''
    };

    // ==================== DRAG MANAGER ====================
    const DragManager = {
        // Lưu trữ các handler đã bind để có thể remove đúng cách
        _boundHandlers: null,
        _currentContainer: null,

        init(container) {
            if (!container) return;

            // Nếu đã init container này rồi thì bỏ qua
            if (container._dragInitialized) return;
            container._dragInitialized = true;

            this._currentContainer = container;

            // Bind handlers một lần duy nhất và lưu lại
            this._boundHandlers = {
                onDragStart: this.onDragStart.bind(this),
                onDragStartTouch: this.onDragStartTouch.bind(this),
                onDragMove: this.onDragMove.bind(this),
                onDragMoveTouch: this.onDragMoveTouch.bind(this),
                onDragEnd: this.onDragEnd.bind(this)
            };

            // Thêm lớp drag-handle vào container
            container.classList.add('yt-sub-draggable');

            // Thiết lập vị trí từ cài đặt
            this.applySavedPosition(container);

            // Thêm sự kiện cho chuột
            container.addEventListener('mousedown', this._boundHandlers.onDragStart);
            container.addEventListener('touchstart', this._boundHandlers.onDragStartTouch, { passive: false });

            // Ngăn chặn sự kiện mặc định khi kéo
            container.addEventListener('dragstart', (e) => e.preventDefault());

            // Thêm style cho container khi kéo
            container.style.cursor = 'move';
            container.style.userSelect = 'none';
        },

        onDragStart(e) {
            // Cho phép kéo cả khi click vào text (người dùng thường click vào text)
            // Chỉ chặn nếu đang select text
            if (window.getSelection()?.toString()) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            const container = this._currentContainer || $(SELECTORS.subtitleContainer);
            if (!container) return;

            State.isDragging = true;

            // Lưu vị trí bắt đầu
            State.dragStartPos.x = e.clientX;
            State.dragStartPos.y = e.clientY;

            const rect = container.getBoundingClientRect();
            State.containerStartPos.x = rect.left;
            State.containerStartPos.y = rect.top;

            // Thêm style khi đang kéo
            container.style.transition = 'none';
            container.style.opacity = '0.8';
            container.style.zIndex = '9999';
            container.classList.add('yt-sub-dragging');

            // Thêm sự kiện cho toàn document - sử dụng handler đã bind
            document.addEventListener('mousemove', this._boundHandlers.onDragMove);
            document.addEventListener('mouseup', this._boundHandlers.onDragEnd);
        },

        onDragStartTouch(e) {
            if (e.touches.length !== 1) return;

            const container = this._currentContainer || $(SELECTORS.subtitleContainer);
            if (!container) return;

            // Cho phép kéo cả khi touch vào text
            // Chỉ chặn nếu đang select text
            if (window.getSelection()?.toString()) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            State.isDragging = true;

            // Lưu vị trí bắt đầu từ touch
            State.dragStartPos.x = e.touches[0].clientX;
            State.dragStartPos.y = e.touches[0].clientY;

            const rect = container.getBoundingClientRect();
            State.containerStartPos.x = rect.left;
            State.containerStartPos.y = rect.top;

            // Thêm style khi đang kéo
            container.style.transition = 'none';
            container.style.opacity = '0.8';
            container.style.zIndex = '9999';
            container.classList.add('yt-sub-dragging');

            // Thêm sự kiện touch - sử dụng handler đã bind
            document.addEventListener('touchmove', this._boundHandlers.onDragMoveTouch, { passive: false });
            document.addEventListener('touchend', this._boundHandlers.onDragEnd);
            document.addEventListener('touchcancel', this._boundHandlers.onDragEnd);
        },

        // Hàm xử lý drag chung cho cả mouse và touch
        handleDragMove(clientX, clientY) {
            const container = $(SELECTORS.subtitleContainer);
            if (!container) return;

            const deltaX = clientX - State.dragStartPos.x;
            const deltaY = clientY - State.dragStartPos.y;

            const maxX = window.innerWidth - container.offsetWidth;
            const maxY = window.innerHeight - container.offsetHeight;

            const newX = Math.max(0, Math.min(State.containerStartPos.x + deltaX, maxX));
            const newY = Math.max(0, Math.min(State.containerStartPos.y + deltaY, maxY));

            // Xác định canh lề và áp dụng vị trí
            const alignment = newX > maxX * 0.7 ? 'right' : newX < maxX * 0.3 ? 'left' : 'center';

            container.style.left = alignment === 'right' ? 'auto' : newX + 'px';
            container.style.right = alignment === 'right' ? (window.innerWidth - newX - container.offsetWidth) + 'px' : 'auto';
            container.style.top = newY + 'px';
            container.style.bottom = 'auto';
            container.style.transform = 'none';

            State.currentDragPos = { x: newX, y: newY, alignment };
        },

        onDragMove(e) {
            if (!State.isDragging) return;
            e.preventDefault();
            e.stopPropagation();
            this.handleDragMove(e.clientX, e.clientY);
        },

        onDragMoveTouch(e) {
            if (!State.isDragging || e.touches.length !== 1) return;
            e.preventDefault();
            e.stopPropagation();
            this.handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
        },

        onDragEnd(e) {
            if (!State.isDragging) return;

            // Chỉ preventDefault nếu event tồn tại và có method này
            if (e && e.preventDefault) {
                e.preventDefault();
                e.stopPropagation();
            }

            const container = this._currentContainer || $(SELECTORS.subtitleContainer);
            if (container) {
                // Xóa style kéo
                container.style.transition = '';
                container.style.opacity = '';
                container.style.zIndex = '';
                container.classList.remove('yt-sub-dragging');
            }

            // Lưu vị trí vào cài đặt
            if (State.currentDragPos) {
                const pos = State.currentDragPos;
                Settings.saveContainerPosition(pos.x + 'px', pos.y + 'px', pos.alignment);
            }

            // Reset state
            State.isDragging = false;
            State.currentDragPos = null;

            // Xóa sự kiện - sử dụng handler đã bind
            if (this._boundHandlers) {
                document.removeEventListener('mousemove', this._boundHandlers.onDragMove);
                document.removeEventListener('mouseup', this._boundHandlers.onDragEnd);
                document.removeEventListener('touchmove', this._boundHandlers.onDragMoveTouch);
                document.removeEventListener('touchend', this._boundHandlers.onDragEnd);
                document.removeEventListener('touchcancel', this._boundHandlers.onDragEnd);
            }
        },

        applySavedPosition(container) {
            if (!container) return;

            const pos = Settings.get('containerPosition');
            const alignment = Settings.get('containerAlignment');

            if (pos && pos.x && pos.y) {
                // Áp dụng vị trí đã lưu
                if (alignment === 'right') {
                    container.style.right = pos.x;
                    container.style.left = 'auto';
                } else if (alignment === 'center') {
                    container.style.left = '50%';
                    container.style.right = 'auto';
                    container.style.transform = 'translateX(-50%)';
                } else {
                    container.style.left = pos.x;
                    container.style.right = 'auto';
                }

                if (pos.y.includes('%')) {
                    container.style.top = 'auto';
                    container.style.bottom = pos.y;
                } else {
                    container.style.top = pos.y;
                    container.style.bottom = 'auto';
                }
            } else {
                // Vị trí mặc định
                container.style.left = '5%';
                container.style.bottom = '70px';
                container.style.top = 'auto';
                container.style.right = 'auto';
            }
        },

        resetPosition(container) {
            if (!container) return;

            // Reset về vị trí mặc định
            container.style.left = '5%';
            container.style.bottom = '70px';
            container.style.top = 'auto';
            container.style.right = 'auto';
            container.style.transform = 'none';

            // Xóa vị trí đã lưu
            Settings.saveContainerPosition('5%', '70px', 'left');
        }
    };

    // ==================== STYLES ====================
    const Styles = {
        update() {
            let el = $('#yt-tools-styles');
            if (!el) {
                el = document.createElement('style');
                el.id = 'yt-tools-styles';
                document.head.appendChild(el);
            }

            const s = Settings.current;
            const hideOriginal = s.displayMode === 'compact' && !s.showOriginal;

            el.textContent = `
                /* Buttons */
                .ytp-translate-button, .ytp-subtitle-settings-button {
                    position: relative; width: 48px; height: 100%;
                    display: inline-flex !important; align-items: center; justify-content: center;
                    opacity: 0.9; transition: opacity 0.1s;
                }
                .ytp-translate-button svg, .ytp-subtitle-settings-button svg { width: 24px; height: 24px; }
                .ytp-translate-button:hover, .ytp-subtitle-settings-button:hover { opacity: 1; }
                .ytp-translate-button.active { opacity: 1; color: #1c87eb; }
                .ytp-translate-button.active svg { fill: #189aeb; }

                /* Hide YouTube captions when translating */
                .yt-translating .ytp-caption-window-container,
                .yt-translating .caption-window {
                    opacity: 0 !important;
                    visibility: hidden !important;
                    pointer-events: none !important;
                    display: none !important;
                }

                /* Unified bilingual subtitle container */
                #yt-bilingual-subtitles {
                    display: inline-flex !important;
                    flex-direction: column !important;
                    align-items: flex-start !important;
                    visibility: visible !important; opacity: 1 !important;
                    position: fixed !important;
                    padding: 8px 12px !important;
                    background: rgba(8,8,8,0.85) !important; 
                    border-radius: 6px !important;
                    border: none !important;
                    max-width: 90% !important;
                    min-width: 200px !important;
                    text-align: left !important; 
                    z-index: 9998 !important;
                    pointer-events: auto !important;
                    gap: 4px !important;
                    cursor: move !important;
                    user-select: none !important;
                    transition: opacity 0.2s, transform 0.2s !important;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
                    backdrop-filter: blur(4px) !important;
                }
                
                /* Hiệu ứng khi hover */
                #yt-bilingual-subtitles:hover {
                    background: rgba(15,15,15,0.9) !important;
                }
                
                /* Hiệu ứng khi đang kéo */
                #yt-bilingual-subtitles.yt-sub-dragging {
                    opacity: 0.8 !important;
                    box-shadow: 0 6px 20px rgba(0,0,0,0.4) !important;
                    z-index: 9999 !important;
                }
                
                #yt-bilingual-subtitles .sub-original {
                    color: ${s.originalColor} !important;
                    font-size: ${s.fontSize}px !important;
                    text-shadow: 1px 1px 3px rgba(0,0,0,0.9) !important;
                    white-space: normal !important;
                    word-wrap: break-word !important;
                    overflow-wrap: break-word !important;
                    max-width: 100% !important;
                    line-height: 1.3 !important;
                    ${hideOriginal ? 'display: none !important;' : ''}
                }
                #yt-bilingual-subtitles .sub-translated {
                    color: ${s.translatedColor} !important;
                    font-size: ${s.translatedFontSize}px !important;
                    text-shadow: 1px 1px 3px rgba(0,0,0,0.9) !important;
                    white-space: normal !important;
                    word-wrap: break-word !important;
                    overflow-wrap: break-word !important;
                    max-width: 100% !important;
                    line-height: 1.3 !important;
                }

                /* Settings panel */
                #yt-subtitle-settings {
                    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    background: rgba(28,28,28,0.95); border-radius: 12px; padding: 20px;
                    z-index: 99999; min-width: 280px; color: #fff;
                    font-family: 'Roboto', Arial, sans-serif;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5); backdrop-filter: blur(10px);
                }
                #yt-subtitle-settings h3 {
                    margin: 0 0 16px; font-size: 16px; font-weight: 500;
                    display: flex; justify-content: space-between; align-items: center;
                }
                #yt-subtitle-settings .close-btn {
                    background: none; border: none; color: #aaa;
                    font-size: 20px; cursor: pointer; padding: 0; line-height: 1;
                }
                #yt-subtitle-settings .close-btn:hover { color: #fff; }
                #yt-subtitle-settings .setting-row {
                    display: flex; justify-content: space-between; align-items: center;
                    margin-bottom: 12px; font-size: 14px;
                }
                #yt-subtitle-settings label { color: #aaa; }
                #yt-subtitle-settings input[type="range"] { width: 100px; accent-color: #ff0000; }
                #yt-subtitle-settings input[type="color"] {
                    width: 40px; height: 28px; border: none; border-radius: 4px; cursor: pointer;
                }
                #yt-subtitle-settings select {
                    background: #333; color: #fff; border: 1px solid #555;
                    border-radius: 4px; padding: 4px 8px;
                }
                #yt-subtitle-settings .toggle {
                    position: relative; width: 40px; height: 20px;
                    background: #555; border-radius: 10px; cursor: pointer; transition: background 0.2s;
                }
                #yt-subtitle-settings .toggle.active { background: #ff0000; }
                #yt-subtitle-settings .toggle::after {
                    content: ''; position: absolute; width: 16px; height: 16px;
                    background: #fff; border-radius: 50%; top: 2px; left: 2px; transition: left 0.2s;
                }
                #yt-subtitle-settings .toggle.active::after { left: 22px; }
                
                /* Nút reset vị trí trong settings */
                #yt-subtitle-settings .reset-position-btn {
                    background: #555; color: #fff; border: none;
                    border-radius: 4px; padding: 6px 12px;
                    cursor: pointer; font-size: 13px;
                    margin-top: 8px; width: 100%;
                    transition: background 0.2s;
                }
                #yt-subtitle-settings .reset-position-btn:hover {
                    background: #666;
                }
            `;
        }
    };

    // ==================== TRANSLATION ====================
    const Translation = {
        // Regex để phát hiện kết thúc câu
        SENTENCE_END: /[.!?;:。！？；：]\s*$/,

        async translate(text) {
            if (!text?.trim()) return '';
            const key = text.trim();

            if (State.cache.has(key)) return State.cache.get(key);

            try {
                const url = `${CONFIG.TRANSLATE_API}?client=gtx&sl=auto&tl=${Settings.get('targetLang')}&dt=t&q=${encodeURIComponent(text)}`;
                const res = await fetch(url);
                const data = await res.json();
                const translated = data?.[0]?.map(i => i[0]).join('') || '';

                // Cache with limit
                if (State.cache.size >= CONFIG.CACHE_LIMIT) {
                    State.cache.delete(State.cache.keys().next().value);
                }
                State.cache.set(key, translated);
                return translated;
            } catch (e) {
                console.error('[YT-Sub] Translation failed:', e);
                return '';
            }
        },

        isCompleteSentence(text) {
            return this.SENTENCE_END.test(text.trim());
        },

        async process() {
            const segments = $$(SELECTORS.captionSegment);
            if (!segments.length) {
                // Reset buffer khi không có caption
                State.lastRawText = '';
                State.pendingText = '';
                return this.removeContainer();
            }

            const currentText = Array.from(segments)
                .map(s => s.textContent.trim())
                .filter(Boolean)
                .join(' ');

            if (!currentText) return this.removeContainer();

            if (currentText === State.lastRawText) return;

            State.lastRawText = currentText;
            State.pendingText = currentText;
            clearTimeout(State.sentenceTimeout);

            const shouldTranslateNow =
                this.isCompleteSentence(currentText) ||
                (currentText.length >= CONFIG.MIN_TEXT_LENGTH &&
                    currentText !== State.lastStableText &&
                    State.cache.has(currentText.trim()));

            if (shouldTranslateNow) {
                await this.translateAndShow(currentText);
            } else {
                State.sentenceTimeout = setTimeout(async () => {
                    if (State.pendingText === currentText &&
                        currentText !== State.lastStableText &&
                        currentText.length >= CONFIG.MIN_TEXT_LENGTH) {
                        await this.translateAndShow(currentText);
                    }
                }, CONFIG.SENTENCE_STABLE_MS);
            }
        },

        async translateAndShow(text) {
            if (!text || text === State.lastStableText) return;

            const container = $(SELECTORS.subtitleContainer);
            if (container?.dataset.source === text) return;

            const translated = await this.translate(text);
            if (translated && translated !== text) {
                State.lastStableText = text;
                this.updateContainer(text, translated);
            }
        },

        updateContainer(original, translated) {
            const player = $(SELECTORS.player);
            if (!player) return;

            let container = $(SELECTORS.subtitleContainer);
            if (!container) {
                container = document.createElement('div');
                container.id = 'yt-bilingual-subtitles';
                container.innerHTML = safeHTML(`
                    <div class="sub-original"></div>
                    <div class="sub-translated"></div>
                `);
                document.body.appendChild(container);
                DragManager.init(container);
            }

            container.querySelector('.sub-original').textContent = original;
            container.querySelector('.sub-translated').textContent = translated;
            container.dataset.source = original;
            player.classList.add('yt-translating');
        },

        removeContainer(forceRemoveClass = false) {
            const container = $(SELECTORS.subtitleContainer);
            if (container) {
                container.remove();
            }

            // Reset stable text khi remove container
            State.lastStableText = '';

            // Chỉ xóa class khi tắt dịch hoàn toàn, không xóa khi caption tạm thời mất
            if (forceRemoveClass) {
                document.querySelectorAll('.yt-translating').forEach(el => el.classList.remove('yt-translating'));
            }
        },

        debouncedProcess() {
            clearTimeout(State.processTimeout);
            State.processTimeout = setTimeout(() => {
                if (State.translateEnabled) this.process();
            }, CONFIG.DEBOUNCE_MS);
        }
    };

    // ==================== OBSERVER ====================
    const Observer = {
        start() {
            if (State.observer) return;
            State.observer = new MutationObserver(() => {
                if (State.translateEnabled) Translation.debouncedProcess();
            });
            State.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        },

        stop() {
            State.observer?.disconnect();
            State.observer = null;
        }
    };

    // ==================== UI ====================
    const UI = {
        createButton(className, title, icon, onClick) {
            const btn = document.createElement('button');
            btn.className = `ytp-button ${className}`;
            btn.title = title;
            btn.innerHTML = safeHTML(icon);
            btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
            return btn;
        },

        addButtons() {
            const controls = $(SELECTORS.controls);
            if (!controls) return;

            if (!$(SELECTORS.settingsBtn)) {
                controls.insertBefore(
                    this.createButton('ytp-subtitle-settings-button', 'Cài đặt phụ đề', ICONS.settings, () => this.showSettings()),
                    controls.firstChild
                );
            }
            if (!$(SELECTORS.translateBtn)) {
                controls.insertBefore(
                    this.createButton('ytp-translate-button', 'Dịch phụ đề (T)', ICONS.translate, () => this.toggleTranslation()),
                    controls.firstChild
                );
            }
        },

        toggleTranslation() {
            State.translateEnabled = !State.translateEnabled;
            const btn = $(SELECTORS.translateBtn);

            if (btn) {
                btn.classList.toggle('active', State.translateEnabled);
                btn.innerHTML = safeHTML(State.translateEnabled ? ICONS.translateActive : ICONS.translate);
                btn.title = State.translateEnabled ? 'Tắt dịch (T)' : 'Dịch phụ đề (T)';
            }

            if (State.translateEnabled) {
                Observer.start();
                Translation.debouncedProcess();
            } else {
                Observer.stop();
                Translation.removeContainer(true); // Force remove class khi tắt dịch
            }
        },

        showSettings() {
            if ($(SELECTORS.settingsPanel)) return;
            const s = Settings.current;

            const panel = document.createElement('div');
            panel.id = 'yt-subtitle-settings';
            panel.innerHTML = safeHTML(`
                <h3>Cài đặt phụ đề<button class="close-btn">×</button></h3>
                <div class="setting-row">
                    <label>Cỡ chữ gốc</label>
                    <div><input type="range" id="s-fontsize" min="12" max="32" value="${s.fontSize}"> <span id="s-fontsize-val">${s.fontSize}px</span></div>
                </div>
                <div class="setting-row">
                    <label>Cỡ chữ dịch</label>
                    <div><input type="range" id="s-trans-fontsize" min="12" max="32" value="${s.translatedFontSize}"> <span id="s-trans-fontsize-val">${s.translatedFontSize}px</span></div>
                </div>
                <div class="setting-row"><label>Màu gốc</label><input type="color" id="s-orig-color" value="${s.originalColor}"></div>
                <div class="setting-row"><label>Màu dịch</label><input type="color" id="s-trans-color" value="${s.translatedColor}"></div>
                <div class="setting-row">
                    <label>Chế độ</label>
                    <select id="s-mode">
                        <option value="compact" ${s.displayMode === 'compact' ? 'selected' : ''}>Gọn</option>
                        <option value="full" ${s.displayMode === 'full' ? 'selected' : ''}>Đầy đủ</option>
                    </select>
                </div>
                <div class="setting-row"><label>Hiện gốc</label><div class="toggle ${s.showOriginal ? 'active' : ''}" id="s-show-orig"></div></div>
                <button class="reset-position-btn" id="s-reset-pos">Đặt lại vị trí container</button>
            `);
            document.body.appendChild(panel);

            // Event handlers
            const bind = (id, event, handler) => panel.querySelector(id)[event] = handler;
            bind('.close-btn', 'onclick', () => panel.remove());
            bind('#s-fontsize', 'oninput', (e) => {
                Settings.set('fontSize', +e.target.value);
                panel.querySelector('#s-fontsize-val').textContent = e.target.value + 'px';
            });
            bind('#s-trans-fontsize', 'oninput', (e) => {
                Settings.set('translatedFontSize', +e.target.value);
                panel.querySelector('#s-trans-fontsize-val').textContent = e.target.value + 'px';
            });
            bind('#s-orig-color', 'oninput', (e) => Settings.set('originalColor', e.target.value));
            bind('#s-trans-color', 'oninput', (e) => Settings.set('translatedColor', e.target.value));
            bind('#s-mode', 'onchange', (e) => Settings.set('displayMode', e.target.value));
            bind('#s-show-orig', 'onclick', (e) => {
                Settings.set('showOriginal', !Settings.get('showOriginal'));
                e.target.classList.toggle('active', Settings.get('showOriginal'));
            });
            bind('#s-reset-pos', 'onclick', () => {
                const container = $(SELECTORS.subtitleContainer);
                DragManager.resetPosition(container);
                panel.remove();
            });

            // Close on outside click
            setTimeout(() => {
                const handler = (e) => {
                    if (!panel.contains(e.target) && !e.target.closest(SELECTORS.settingsBtn)) {
                        panel.remove();
                        document.removeEventListener('click', handler);
                    }
                };
                document.addEventListener('click', handler);
            }, 100);
        },

        handleFullscreen() {
            const isFS = document.fullscreenElement || document.webkitFullscreenElement;
            [$(SELECTORS.translateBtn), $(SELECTORS.settingsBtn)].forEach(btn => {
                if (btn) btn.style.bottom = isFS ? '2px' : '0';
            });
        }
    };

    // ==================== INITIALIZATION ====================
    function init() {
        if (!isWatchPage()) return;
        Settings.load();
        Styles.update();
        UI.addButtons();
        if (State.translateEnabled) Observer.start();
    }

    function cleanup() {
        Observer.stop();
        Translation.removeContainer();
        State.translateEnabled = false;
    }

    // ==================== EVENT LISTENERS ====================
    document.addEventListener('fullscreenchange', () => UI.handleFullscreen());
    document.addEventListener('yt-navigate-finish', () => { cleanup(); init(); });

    document.addEventListener('keydown', (e) => {
        const active = document.activeElement;
        if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable) return;
        if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.altKey && !e.metaKey && $(SELECTORS.video)) {
            e.preventDefault();
            UI.toggleTranslation();
        }
    });

    // Xử lý resize window để cập nhật vị trí container
    window.addEventListener('resize', () => {
        const container = $(SELECTORS.subtitleContainer);
        if (container) {
            // Đảm bảo container không ra ngoài màn hình khi resize
            const rect = container.getBoundingClientRect();
            if (rect.left < 0) container.style.left = '0px';
            if (rect.top < 0) container.style.top = '0px';
            if (rect.right > window.innerWidth) {
                container.style.left = (window.innerWidth - container.offsetWidth) + 'px';
            }
            if (rect.bottom > window.innerHeight) {
                container.style.top = (window.innerHeight - container.offsetHeight) + 'px';
            }
        }
    });

    // Wait for YouTube player controls
    const waitForControls = () => {
        if ($(SELECTORS.controls)) return init();

        let retries = 0;
        const observer = new MutationObserver(() => {
            if ($(SELECTORS.controls)) {
                observer.disconnect();
                init();
            } else if (++retries > 50) {
                observer.disconnect();
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    };

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', waitForControls, { once: true })
        : waitForControls();
})();
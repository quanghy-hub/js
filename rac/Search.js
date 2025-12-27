// ==UserScript==
// @name         Search
// @namespace    qsb.search.bubble
// @version      1.7.0
// @description  Khôi phục toàn bộ tính năng gốc
// @match        *://*/*
// @updateURL    https://raw.githubusercontent.com/quanghy-hub/script-cat/refs/heads/main/serch.js
// @downloadURL  https://raw.githubusercontent.com/quanghy-hub/script-cat/refs/heads/main/serch.js
// @exclude      *://mail.google.com/*
// @run-at       document-end
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_openInTab
// @grant        GM_download
// @license      MIT
// ==/UserScript==

(() => {
    'use strict';

    // =========================================================================
    // SECTION 1: CONSTANTS & CONFIGURATION
    // =========================================================================

    const CONFIG = {
        // Storage keys
        STORE_KEY: 'qsb.providers.v4',
        CFG_KEY: 'qsb.cfg.v1',

        // UI dimensions
        BUBBLE_OFFSET_Y: 8,
        ICON_SIZE: 28,
        ICON_IMG_SIZE: 16,
        MAX_PROVIDERS: 8,
        ICONS_PER_ROW: 5,

        // Timing (ms)
        TOAST_DURATION: 1200,
        SELECTION_DELAY: 150,
        HOVER_DELAY: 120,
        HOVER_HIDE_DELAY: 220,
        LONG_PRESS_DELAY: 450,

        // Translation languages
        LANGUAGES: ['auto', 'vi', 'en', 'ja', 'zh-CN', 'ko', 'fr', 'de', 'es'],

        // Default translation config
        DEFAULT_CFG: { from: 'auto', to: 'vi' }
    };

    const DEFAULT_PROVIDERS = [
        { name: 'Google', url: 'https://www.google.com/search?q={{q}}', icon: 'https://www.google.com/favicon.ico' },
        { name: 'YouTube', url: 'https://www.youtube.com/results?search_query={{q}}', icon: 'https://www.youtube.com/favicon.ico' },
        { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={{q}}', icon: 'https://duckduckgo.com/favicon.ico' },
        { name: 'Bing', url: 'https://www.bing.com/search?q={{q}}', icon: 'https://www.bing.com/favicon.ico' },
        { name: 'Ảnh Google', url: 'https://www.google.com/search?tbm=isch&q={{q}}', icon: 'https://www.google.com/favicon.ico' },
        { name: 'Bằng ảnh', url: 'https://lens.google.com/uploadbyurl?url={{img}}', icon: 'https://www.google.com/favicon.ico' },
        { name: 'Dịch (GG)', url: 'https://translate.google.com/?sl={{from}}&tl={{to}}&text={{q}}&op=translate', icon: 'https://translate.google.com/favicon.ico' },
        { name: 'Perplexity', url: 'https://www.perplexity.ai/?q={{q}}', icon: 'https://www.perplexity.ai/favicon.ico' },
    ];

    // =========================================================================
    // SECTION 2: STORAGE HELPERS
    // =========================================================================

    const Storage = {
        /** Get translation config */
        getConfig() {
            try {
                return JSON.parse(GM_getValue(CONFIG.CFG_KEY)) || CONFIG.DEFAULT_CFG;
            } catch {
                return CONFIG.DEFAULT_CFG;
            }
        },

        /** Save translation config */
        setConfig(cfg) {
            GM_setValue(CONFIG.CFG_KEY, JSON.stringify(cfg || {}));
        },

        /** Get search providers list */
        getProviders() {
            try {
                const arr = JSON.parse(GM_getValue(CONFIG.STORE_KEY));
                return Array.isArray(arr) && arr.length ? arr.slice(0, CONFIG.MAX_PROVIDERS) : DEFAULT_PROVIDERS;
            } catch {
                return DEFAULT_PROVIDERS;
            }
        },

        /** Save search providers list */
        setProviders(arr) {
            GM_setValue(CONFIG.STORE_KEY, JSON.stringify((arr || []).slice(0, CONFIG.MAX_PROVIDERS)));
        }
    };

    // =========================================================================
    // SECTION 3: UTILITY FUNCTIONS
    // =========================================================================

    const Utils = {
        /** Encode query string for URL */
        encodeQuery: (s) => encodeURIComponent(String(s || '').trim().replace(/\s+/g, ' ')),

        /** Escape HTML special characters */
        escapeHtml: (s = '') => s.replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m])),

        /** Copy text to clipboard */
        async copyText(txt) {
            try {
                await navigator.clipboard.writeText(txt);
                return true;
            } catch {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = txt;
                    ta.style.cssText = 'position:fixed;opacity:0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    ta.remove();
                    return true;
                } catch {
                    return false;
                }
            }
        },

        /** Select all text intelligently */
        selectAllSmart() {
            const ae = document.activeElement;
            if (ae?.tagName === 'INPUT' || ae?.tagName === 'TEXTAREA') {
                try { ae.focus(); ae.select(); return true; } catch { }
            }
            try {
                const sel = getSelection();
                if (!sel) return false;
                sel.removeAllRanges();
                const r = document.createRange();
                r.selectNodeContents(document.body || document.documentElement);
                sel.addRange(r);
                return true;
            } catch {
                return false;
            }
        },

        /** Extract filename from URL for download */
        filenameFromUrl(u) {
            try {
                const url = new URL(u, location.href);
                const name = url.pathname.split('/').pop() || 'image';
                const clean = name.split('?')[0].split('#')[0] || 'image';
                return clean.match(/\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i) ? clean : (clean + '.jpg');
            } catch {
                return 'image.jpg';
            }
        },

        /** Find image element from target */
        getImageFromTarget(target) {
            if (target.closest?.('.qsb-bubble')) return null;
            if (target.tagName === 'IMG') return target;
            return target.closest('picture')?.querySelector('img');
        }
    };

    // =========================================================================
    // SECTION 4: STYLES
    // =========================================================================

    const STYLES = `
        /* Bubble Container */
        .qsb-bubble {
            position: absolute;
            z-index: 2147483646;
            display: none;
            background: #1a1a1a;
            padding: 6px;
            border-radius: 8px;
            box-shadow: 0 8px 25px rgba(0,0,0,.5);
        }

        /* Icon Grid */
        .qsb-icons {
            display: grid;
            gap: 6px;
            grid-template-columns: repeat(${CONFIG.ICONS_PER_ROW}, ${CONFIG.ICON_SIZE}px);
        }

        /* Icon Item */
        .qsb-item {
            width: ${CONFIG.ICON_SIZE}px;
            height: ${CONFIG.ICON_SIZE}px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background .15s;
        }
        .qsb-item:hover { background: rgba(255,255,255,.15); }
        .qsb-item img { width: ${CONFIG.ICON_IMG_SIZE}px; height: ${CONFIG.ICON_IMG_SIZE}px; object-fit: contain; }
        .qsb-item .glyph { font: 15px/1 system-ui; color: #eee; }

        /* Toast Notification */
        .qsb-toast {
            position: fixed;
            padding: 6px 12px;
            background: #222;
            color: #fff;
            border-radius: 6px;
            font: 12px system-ui;
            z-index: 2147483647;
            box-shadow: 0 5px 15px rgba(0,0,0,.3);
        }

        /* Settings Modal */
        .qsb-cfg {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2147483647;
            font-family: system-ui;
        }
        .qsb-panel {
            background: #181818;
            color: #eee;
            width: min(650px, 94vw);
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 15px 50px #000;
        }
        .qsb-panel h3 { margin: 0 0 15px; font-size: 16px; font-weight: 600; color: #fff; }
        .qsb-grid { display: grid; grid-template-columns: 1fr 2fr 2fr; gap: 8px; margin-bottom: 15px; }
        .qsb-head { font-size: 11px; opacity: .6; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
        .qsb-grid input, .qsb-lang select { background: #252525; border: none; color: #fff; padding: 6px 10px; border-radius: 4px; width: 100%; font: 13px system-ui; }
        .qsb-grid input:focus, .qsb-lang select:focus { background: #303030; outline: none; }
        .qsb-acts { display: flex; justify-content: space-between; align-items: center; margin-top: 15px; }
        .qsb-btn { padding: 8px 16px; border: none; border-radius: 6px; background: #333; color: #eee; cursor: pointer; }
        .qsb-btn.p { background: #238636; color: #fff; }
        .qsb-btn:hover { filter: brightness(1.1); }
        .qsb-note { font-size: 11px; opacity: .5; max-width: 300px; }
    `;

    // =========================================================================
    // SECTION 5: UI COMPONENTS
    // =========================================================================

    const UI = {
        bubble: null,
        grid: null,

        /** Show toast notification */
        showToast(msg, x, y) {
            const el = document.createElement('div');
            el.className = 'qsb-toast';
            el.textContent = msg;
            el.style.left = Math.min(x, innerWidth - 200) + 'px';
            el.style.top = Math.max(6, y - 36) + 'px';
            document.body.appendChild(el);
            setTimeout(() => el.remove(), CONFIG.TOAST_DURATION);
        },

        /** Create bubble element if not exists */
        ensureBubble() {
            if (this.bubble) return this.bubble;

            this.bubble = document.createElement('div');
            this.bubble.className = 'qsb-bubble';
            this.grid = document.createElement('div');
            this.grid.className = 'qsb-icons';
            this.bubble.appendChild(this.grid);

            this.bubble.onmouseenter = () => clearTimeout(Handlers.hoverHideTimer);
            this.bubble.onmouseleave = () => {
                if (!Handlers.hoverImgEl?.matches(':hover')) this.hideBubble();
            };

            document.body.appendChild(this.bubble);
            return this.bubble;
        },

        /** Hide bubble */
        hideBubble() {
            if (this.bubble) this.bubble.style.display = 'none';
            Handlers.lastCtx = null;
        },

        /** Show bubble with items */
        showBubble(items, x, y) {
            this.ensureBubble();
            this.grid.innerHTML = '';

            items.forEach(it => {
                const btn = document.createElement('div');
                btn.className = 'qsb-item';
                btn.title = it.title || '';
                btn.innerHTML = it.html;
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    it.onClick();
                };
                this.grid.appendChild(btn);
            });

            this.grid.style.gridTemplateColumns = `repeat(${Math.min(CONFIG.ICONS_PER_ROW, items.length)}, ${CONFIG.ICON_SIZE}px)`;

            // Position bubble within viewport
            this.bubble.style.display = 'block';
            const w = this.bubble.offsetWidth, h = this.bubble.offsetHeight;
            const l = Math.max(6, Math.min(x, scrollX + innerWidth - w - 6));
            const t = Math.max(6, Math.min(y, scrollY + innerHeight - h - 6));
            this.bubble.style.left = l + 'px';
            this.bubble.style.top = t + 'px';
        },

        /** Download image with fallback */
        downloadImage(src, x, y) {
            const fallback = () => GM_openInTab(src, { active: true, insert: true });

            if (typeof GM_download === 'function') {
                try {
                    GM_download({
                        url: src,
                        name: Utils.filenameFromUrl(src),
                        saveAs: false,
                        onerror: fallback,
                        ontimeout: fallback
                    });
                    this.showToast('Đang tải ảnh...', x, y);
                    return;
                } catch { }
            }
            fallback();
            this.showToast('Mở tab mới để lưu', x, y);
        }
    };

    // =========================================================================
    // SECTION 6: SETTINGS PANEL
    // =========================================================================

    const Settings = {
        /** Open settings modal */
        open() {
            const providers = Storage.getProviders();
            const cfg = Storage.getConfig();

            const modal = document.createElement('div');
            modal.className = 'qsb-cfg';
            modal.innerHTML = this._buildHTML(providers, cfg);

            // Close on backdrop click
            modal.onclick = e => e.target === modal && modal.remove();

            // Reset button
            modal.querySelector('#qr').onclick = () => {
                Storage.setProviders(DEFAULT_PROVIDERS);
                modal.remove();
                alert('Đã khôi phục mặc định!');
            };

            // Save button
            modal.querySelector('#qs').onclick = () => {
                this._save(modal);
            };

            document.body.appendChild(modal);
        },

        /** Build settings HTML */
        _buildHTML(providers, cfg) {
            const langOptions = (selected) =>
                CONFIG.LANGUAGES.map(l => `<option ${cfg[selected] === l ? 'selected' : ''}>${l}</option>`).join('');

            const providerRows = Array.from({ length: CONFIG.MAX_PROVIDERS }).map((_, i) => {
                const p = providers[i] || { name: '', url: '', icon: '' };
                return `
                    <input value="${Utils.escapeHtml(p.name)}" placeholder="Tên ${i + 1}">
                    <input value="${Utils.escapeHtml(p.url)}" placeholder="URL...">
                    <input value="${Utils.escapeHtml(p.icon)}" placeholder="Icon...">
                `;
            }).join('');

            return `
                <div class="qsb-panel">
                    <h3>Cấu hình Quick Search</h3>
                    <div class="qsb-grid" id="qsb-grid">
                        <div class="qsb-head">Tên hiển thị</div>
                        <div class="qsb-head">URL Query ({{q}} / {{img}})</div>
                        <div class="qsb-head">Icon URL</div>
                        ${providerRows}
                    </div>
                    <div class="qsb-lang" style="display:flex;gap:10px;align-items:center">
                        <label>Dịch từ:</label>
                        <select id="qf">${langOptions('from')}</select>
                        <label>đến:</label>
                        <select id="qt">${langOptions('to')}</select>
                    </div>
                    <div class="qsb-acts">
                        <div class="qsb-note">Mẹo: Dùng {{q}} cho text, {{img}} cho ảnh.</div>
                        <div style="display:flex;gap:10px">
                            <button class="qsb-btn" id="qr">Mặc định</button>
                            <button class="qsb-btn p" id="qs">Lưu</button>
                        </div>
                    </div>
                </div>
            `;
        },

        /** Save settings from modal */
        _save(modal) {
            const inputs = modal.querySelectorAll('#qsb-grid input');
            const newProviders = [];

            for (let i = 0; i < inputs.length; i += 3) {
                const name = inputs[i].value.trim();
                if (name) {
                    newProviders.push({
                        name,
                        url: inputs[i + 1].value.trim(),
                        icon: inputs[i + 2].value.trim()
                    });
                }
            }

            Storage.setProviders(newProviders);
            Storage.setConfig({
                from: modal.querySelector('#qf').value,
                to: modal.querySelector('#qt').value
            });

            modal.remove();
            alert('Đã lưu cấu hình!');
        }
    };

    // =========================================================================
    // SECTION 7: ACTION BUILDERS
    // =========================================================================

    const Actions = {
        /** Find image search provider */
        findImageProvider(providers) {
            return providers.find(x => /bằng ảnh/i.test(x.name)) ||
                providers.find(x => x.url.includes('{{img}}')) ||
                { name: 'Tìm ảnh', url: 'https://lens.google.com/uploadbyurl?url={{img}}' };
        },

        /** Open search URL */
        openSearch(provider, text, imgUrl) {
            const cfg = Storage.getConfig();
            const url = (provider.url || '')
                .replace('{{q}}', imgUrl ? '' : Utils.encodeQuery(text))
                .replace('{{img}}', imgUrl ? encodeURIComponent(imgUrl) : '')
                .replace('{{from}}', encodeURIComponent(cfg.from))
                .replace('{{to}}', encodeURIComponent(cfg.to));

            if (url) GM_openInTab(url, { active: true, insert: true });
            UI.hideBubble();
        },

        /** Build bubble items for context */
        buildItems(ctx) {
            const providers = Storage.getProviders();
            const items = [];

            if (ctx.type === 'text') {
                // Copy button
                items.push({
                    title: 'Copy',
                    html: '<span class="glyph">⧉</span>',
                    onClick: async () => {
                        const ok = await Utils.copyText(ctx.text);
                        UI.showToast(ok ? 'Đã chép' : 'Lỗi chép', ctx.x, ctx.y);
                        UI.hideBubble();
                    }
                });

                // Select all button
                items.push({
                    title: 'Select All',
                    html: '<span class="glyph">⤢</span>',
                    onClick: () => {
                        Utils.selectAllSmart();
                        UI.showToast('Đã chọn hết', ctx.x, ctx.y);
                    }
                });

                // Provider buttons
                providers.forEach(p => items.push({
                    title: p.name,
                    html: p.icon ? `<img src="${p.icon}">` : '<span class="glyph">🔗</span>',
                    onClick: () => this.openSearch(p, ctx.text)
                }));

            } else if (ctx.type === 'image') {
                const imgProvider = this.findImageProvider(providers);

                // Download button
                items.push({
                    title: 'Tải ảnh',
                    html: '<span class="glyph">⬇</span>',
                    onClick: () => {
                        UI.downloadImage(ctx.img, ctx.x, ctx.y);
                        UI.hideBubble();
                    }
                });

                // Copy URL button
                items.push({
                    title: 'Copy URL',
                    html: '<span class="glyph">⧉</span>',
                    onClick: async () => {
                        await Utils.copyText(ctx.img);
                        UI.showToast('Đã chép URL', ctx.x, ctx.y);
                        UI.hideBubble();
                    }
                });

                // Search by image button
                items.push({
                    title: imgProvider.name,
                    html: imgProvider.icon ? `<img src="${imgProvider.icon}">` : '<span class="glyph">🔗</span>',
                    onClick: () => this.openSearch(imgProvider, null, ctx.img)
                });
            }

            return items;
        }
    };

    // =========================================================================
    // SECTION 8: EVENT HANDLERS
    // =========================================================================

    const Handlers = {
        lastCtx: null,
        selTimer: null,
        hoverTimer: null,
        hoverHideTimer: null,
        hoverImgEl: null,

        /** Handle text selection */
        onSelectionChange() {
            clearTimeout(this.selTimer);
            this.selTimer = setTimeout(() => {
                const sel = getSelection();
                const txt = String(sel).trim();

                // Ignore if typing in input/textarea
                const ae = document.activeElement;
                if (!txt || ae?.tagName === 'INPUT' || ae?.tagName === 'TEXTAREA') return;

                const r = sel.getRangeAt(0).getBoundingClientRect();
                if (r.width > 0) {
                    this.lastCtx = {
                        type: 'text',
                        text: txt,
                        x: r.left + scrollX,
                        y: r.bottom + scrollY + CONFIG.BUBBLE_OFFSET_Y
                    };
                    UI.showBubble(Actions.buildItems(this.lastCtx), this.lastCtx.x, this.lastCtx.y);
                }
            }, CONFIG.SELECTION_DELAY);
        },

        /** Handle context menu on image */
        onContextMenu(e) {
            const img = Utils.getImageFromTarget(e.target);
            if (img?.src) {
                const x = e.pageX + 6, y = e.pageY + 6;
                this.lastCtx = { type: 'image', img: img.src, x, y };
                UI.showBubble(Actions.buildItems(this.lastCtx), x, y);
            }
        },

        /** Handle mouse hover on image */
        onPointerEnter(e) {
            if (e.pointerType !== 'mouse') return;
            const img = Utils.getImageFromTarget(e.target);
            if (!img) return;

            this.hoverImgEl = img;
            clearTimeout(this.hoverTimer);
            clearTimeout(this.hoverHideTimer);

            this.hoverTimer = setTimeout(() => {
                const src = img.currentSrc || img.src;
                if (!src) return;
                const x = e.pageX + 6, y = e.pageY + 6;
                this.lastCtx = { type: 'image', img: src, x, y };
                UI.showBubble(Actions.buildItems(this.lastCtx), x, y);
            }, CONFIG.HOVER_DELAY);
        },

        /** Handle mouse leave from image */
        onPointerLeave(e) {
            if (e.pointerType !== 'mouse') return;
            if (Utils.getImageFromTarget(e.target) === this.hoverImgEl) {
                clearTimeout(this.hoverTimer);
                this.hoverHideTimer = setTimeout(() => {
                    if (!UI.bubble?.matches(':hover')) UI.hideBubble();
                }, CONFIG.HOVER_HIDE_DELAY);
            }
        },

        /** Setup long press handlers for touch/mouse hold */
        setupLongPress() {
            let pressTmr, startX, startY, targetImg;

            const onDown = (e) => {
                targetImg = Utils.getImageFromTarget(e.target);
                if (!targetImg) return;

                startX = e.pageX || e.touches?.[0]?.pageX;
                startY = e.pageY || e.touches?.[0]?.pageY;

                pressTmr = setTimeout(() => {
                    if (!targetImg) return;
                    const src = targetImg.currentSrc || targetImg.src;
                    if (src) {
                        this.lastCtx = { type: 'image', img: src, x: startX + 6, y: startY + 6 };
                        UI.showBubble(Actions.buildItems(this.lastCtx), this.lastCtx.x, this.lastCtx.y);
                    }
                }, CONFIG.LONG_PRESS_DELAY);
            };

            const onMove = (e) => {
                if (!pressTmr) return;
                const x = e.pageX || e.touches?.[0]?.pageX;
                const y = e.pageY || e.touches?.[0]?.pageY;
                if (Math.abs(x - startX) > 5 || Math.abs(y - startY) > 5) {
                    clearTimeout(pressTmr);
                    pressTmr = null;
                }
            };

            const onUp = () => {
                clearTimeout(pressTmr);
                pressTmr = null;
            };

            document.addEventListener('pointerdown', onDown, { passive: true });
            document.addEventListener('pointermove', onMove, { passive: true });
            document.addEventListener('pointerup', onUp, { passive: true });
            document.addEventListener('pointercancel', onUp, { passive: true });
        },

        /** Setup dismiss handlers */
        setupDismiss() {
            document.addEventListener('mousedown', (e) => {
                if (UI.bubble && !UI.bubble.contains(e.target)) UI.hideBubble();
            });
            document.addEventListener('scroll', () => UI.hideBubble(), { capture: true, passive: true });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') UI.hideBubble();
            });
        }
    };

    // =========================================================================
    // SECTION 9: INITIALIZATION
    // =========================================================================

    function init() {
        // Inject styles
        GM_addStyle(STYLES);

        // Setup event listeners
        document.addEventListener('selectionchange', () => Handlers.onSelectionChange());
        document.addEventListener('contextmenu', (e) => Handlers.onContextMenu(e), { capture: true });
        document.addEventListener('pointerenter', (e) => Handlers.onPointerEnter(e), { capture: true });
        document.addEventListener('pointerleave', (e) => Handlers.onPointerLeave(e), { capture: true });

        Handlers.setupLongPress();
        Handlers.setupDismiss();

        // Register settings menu
        GM_registerMenuCommand('⚙️ Cấu hình Quick Search', () => Settings.open());
    }

    // Start
    init();

})();

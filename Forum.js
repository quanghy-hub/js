// ==UserScript==
// @name         Forum
// @namespace    forum
// @version      1.3.0
// @description  Chia 2 cột Masonry + dàn rộng full màn hình
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @license      MIT
// ==/UserScript==

'use strict';

const HOST = location.host;
const STORAGE_KEY = 'forum_split_v1.3.0';
const DEFAULTS = { enabled: false, wide: true, minWidth: 1000, gap: 1, fadeTime: 150, initDelay: 100 };

// ===== CONFIG =====
const Config = {
    _cache: null,
    get() {
        if (this._cache) return this._cache;
        try {
            const saved = JSON.parse(GM_getValue(STORAGE_KEY) || '{}');
            this._cache = { ...DEFAULTS, ...(saved.hosts?.[HOST] || {}), _hosts: saved.hosts || {} };
        } catch { this._cache = { ...DEFAULTS, _hosts: {} }; }
        return this._cache;
    },
    save(cfg) {
        const { enabled, wide, minWidth, gap, fadeTime, initDelay } = cfg;
        cfg._hosts[HOST] = { enabled, wide, minWidth, gap, fadeTime, initDelay };
        GM_setValue(STORAGE_KEY, JSON.stringify({ hosts: cfg._hosts }));
        this._cache = cfg;
    }
};

let CFG = Config.get();
let activeWrappers = [], styleEl = null, modal = null, observer = null;

// ===== EARLY HIDE =====
if (CFG.enabled) {
    const s = document.createElement('style');
    s.id = 'fs-early';
    s.textContent = `html.fs-loading body{opacity:0!important}html.fs-ready body{opacity:1;transition:opacity ${CFG.fadeTime}ms ease-out}`;
    (document.head || document.documentElement).appendChild(s);
    document.documentElement.classList.add('fs-loading');
}

// ===== CSS =====
const CSS = `
html.fs-wide .p-body-inner,html.fs-wide .p-pageWrapper,html.fs-wide .pageWidth,
html.fs-wide #content,html.fs-wide .container,html.fs-wide .wrap,html.fs-wide main{max-width:100%!important;width:100%!important;margin-inline:auto!important}
html.fs-active .p-body-sidebar,html.fs-active aside.p-body-sidebar,html.fs-active .block--category-boxes{display:none!important}
html.fs-active .p-body-inner{max-width:100%!important;width:100%!important;padding:0!important}
html.fs-active .p-body-main,html.fs-active .p-body-main--withSidebar{display:block!important}
html.fs-active .p-body-content{width:100%!important;max-width:100%!important}
.fs-wrapper{display:flex!important;gap:var(--fs-gap,1px);align-items:flex-start}
.fs-column{flex:1;min-width:0;display:flex;flex-direction:column;gap:var(--fs-gap,1px)}
.fs-column>*{margin:0!important}
.fs-wrapper img,.fs-wrapper video,.fs-wrapper iframe{max-width:100%!important;height:auto!important}
.fs-original-hidden{display:none!important}`;

const SELECTORS = [
    { c: '.block-body.js-replyNewMessageContainer', i: 'article.message--post, article.message' },
    { c: '.structItemContainer', i: '.structItem--thread, .structItem' }
];

// ===== HELPERS =====
const toast = msg => {
    let t = document.getElementById('fs-toast');
    if (!t) { t = document.createElement('div'); t.id = 'fs-toast'; t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1a1a1ae6;color:#fff;padding:10px 20px;border-radius:20px;font:14px/1.4 system-ui;z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .2s'; document.body.appendChild(t); }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._timer); t._timer = setTimeout(() => t.style.opacity = '0', 2000);
};

const injectStyles = () => {
    if (styleEl) return;
    styleEl = document.createElement('style');
    styleEl.id = 'fs-styles';
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
};

const showContent = () => {
    document.documentElement.classList.remove('fs-loading');
    document.documentElement.classList.add('fs-ready');
};

// ===== MASONRY =====
const createMasonry = (container, itemSelector) => {
    const items = Array.from(container.querySelectorAll(`:scope > ${itemSelector}`));
    if (items.length < 3) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'fs-wrapper';
    wrapper.style.setProperty('--fs-gap', `${CFG.gap}px`);

    const left = document.createElement('div'), right = document.createElement('div');
    left.className = right.className = 'fs-column';
    wrapper.append(left, right);

    container.parentNode.insertBefore(wrapper, container);
    document.documentElement.classList.add('fs-active');
    if (CFG.wide) document.documentElement.classList.add('fs-wide');

    items.forEach(item => (left.offsetHeight <= right.offsetHeight ? left : right).appendChild(item));
    container.classList.add('fs-original-hidden');
    return { wrapper, container, items };
};

const destroyMasonry = inst => {
    if (!inst) return;
    inst.items.forEach(i => inst.container.appendChild(i));
    inst.container.classList.remove('fs-original-hidden');
    inst.wrapper.remove();
};

const applyMasonry = () => {
    SELECTORS.forEach(({ c, i }) => {
        document.querySelectorAll(c).forEach(el => {
            if (el.classList.contains('fs-original-hidden') || activeWrappers.some(w => w.container === el)) return;
            const inst = createMasonry(el, i);
            if (inst) activeWrappers.push(inst);
        });
    });
};

const removeMasonry = () => {
    activeWrappers.forEach(destroyMasonry);
    activeWrappers = [];
    document.documentElement.classList.remove('fs-active', 'fs-wide');
};

// ===== LOGIC =====
const shouldActivate = () => CFG.enabled && innerWidth > innerHeight && innerWidth >= CFG.minWidth;
const update = () => shouldActivate() ? applyMasonry() : removeMasonry();
const refresh = () => { removeMasonry(); if (shouldActivate()) setTimeout(applyMasonry, 100); };
const toggle = () => { CFG.enabled = !CFG.enabled; Config.save(CFG); update(); toast(CFG.enabled ? '📐 BẬT' : '📐 TẮT'); };

// ===== MODAL =====
const createModal = () => {
    const div = document.createElement('div');
    div.id = 'fs-overlay';
    div.innerHTML = `<style>
#fs-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483646;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s}
#fs-overlay.open{opacity:1;pointer-events:auto}
#fs-panel{background:#1e1e1e;padding:20px;border-radius:14px;width:min(300px,90vw);color:#eee;font:14px/1.5 system-ui;box-shadow:0 10px 40px rgba(0,0,0,.5)}
.fs-head{margin-bottom:12px;border-bottom:1px solid #333;padding-bottom:10px}
.fs-title{font-weight:700;font-size:15px;margin:0;color:#fff}
.fs-sub{font-size:11px;color:#888;margin-top:3px}
.fs-group{background:#2a2a2a;padding:10px 12px;border-radius:10px;margin-bottom:10px}
.fs-row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}
.fs-row:last-child{margin-bottom:0}
.fs-label{flex:1;color:#ddd}
.fs-input{border:1px solid #444;background:#333;color:#fff;border-radius:5px;padding:4px 8px;width:60px;text-align:right;font:inherit}
.fs-switch{position:relative;width:38px;height:20px;flex-shrink:0}
.fs-switch input{opacity:0;width:0;height:0}
.fs-slider{position:absolute;cursor:pointer;inset:0;background:#555;transition:.2s;border-radius:20px}
.fs-slider:before{position:absolute;content:"";height:16px;width:16px;left:2px;bottom:2px;background:#fff;transition:.2s;border-radius:50%}
input:checked+.fs-slider{background:#007AFF}
input:checked+.fs-slider:before{transform:translateX(18px)}
.fs-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.fs-btn{border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;background:#333;color:#fff;transition:.15s}
.fs-btn:hover{background:#444}
.fs-btn.primary{background:#007AFF}
.fs-btn.primary:hover{background:#0066d6}
</style>
<div id="fs-panel">
<div class="fs-head"><h3 class="fs-title">📐 Forum Split</h3><div class="fs-sub">${HOST}</div></div>
<div class="fs-group">
<div class="fs-row"><span class="fs-label">Bật Split 2 cột</span><label class="fs-switch"><input type="checkbox" id="fs-en"><span class="fs-slider"></span></label></div>
<div class="fs-row"><span class="fs-label">Dàn rộng Full</span><label class="fs-switch"><input type="checkbox" id="fs-wide"><span class="fs-slider"></span></label></div>
</div>
<div class="fs-group">
<div class="fs-row"><span class="fs-label">Min Width</span><input id="fs-minw" type="number" class="fs-input" step="100">px</div>
<div class="fs-row"><span class="fs-label">Gap</span><input id="fs-gap" type="number" class="fs-input" min="0" max="20">px</div>
<div class="fs-row"><span class="fs-label">Fade Time</span><input id="fs-fade" type="number" class="fs-input" min="0" max="500">ms</div>
<div class="fs-row"><span class="fs-label">Init Delay</span><input id="fs-delay" type="number" class="fs-input" min="0" max="500">ms</div>
</div>
<div class="fs-actions"><button class="fs-btn" id="fs-refresh">🔄</button><button class="fs-btn" id="fs-close">Đóng</button><button class="fs-btn primary" id="fs-save">Lưu</button></div>
</div>`;
    document.body.appendChild(div);
    const $ = id => div.querySelector('#' + id);
    $('fs-close').onclick = () => div.classList.remove('open');
    $('fs-refresh').onclick = () => { refresh(); toast('🔄'); };
    div.onclick = e => { if (e.target === div) div.classList.remove('open'); };
    $('fs-save').onclick = () => {
        CFG.enabled = $('fs-en').checked;
        CFG.wide = $('fs-wide').checked;
        CFG.minWidth = Math.max(0, +$('fs-minw').value || 1000);
        CFG.gap = Math.max(0, Math.min(20, +$('fs-gap').value || 1));
        CFG.fadeTime = Math.max(0, Math.min(500, +$('fs-fade').value || 150));
        CFG.initDelay = Math.max(0, Math.min(500, +$('fs-delay').value || 100));
        Config.save(CFG); refresh(); div.classList.remove('open'); toast('✓');
    };
    return div;
};

const openSettings = () => {
    if (!modal) modal = createModal();
    const $ = id => modal.querySelector('#' + id);
    $('fs-en').checked = CFG.enabled;
    $('fs-wide').checked = CFG.wide;
    $('fs-minw').value = CFG.minWidth;
    $('fs-gap').value = CFG.gap;
    $('fs-fade').value = CFG.fadeTime;
    $('fs-delay').value = CFG.initDelay;
    requestAnimationFrame(() => modal.classList.add('open'));
};

// ===== INIT =====
const init = () => {
    injectStyles();
    setTimeout(() => {
        update();
        showContent();
        observer = new MutationObserver(() => { if (shouldActivate()) { clearTimeout(observer._t); observer._t = setTimeout(applyMasonry, 300); } });
        observer.observe(document.body, { childList: true, subtree: true });
    }, CFG.initDelay);
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(update, 200); });
    addEventListener('orientationchange', () => setTimeout(update, 300));
    document.addEventListener('keydown', e => { if (e.altKey && e.shiftKey && e.code === 'KeyS') { e.preventDefault(); openSettings(); } });
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('📐 Cài đặt (Alt+Shift+S)', openSettings);
        GM_registerMenuCommand('🔄 Toggle', toggle);
    }
};

document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();

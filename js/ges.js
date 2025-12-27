// ==UserScript==
// @name         Gestures
// @namespace    unified-gestures
// @version      4.0.0
// @description  Long-press/Right-click mở link, Double-tap đóng tab, Edge swipe scroll, Pager
// @match        *://*/*
// @exclude      *://mail.google.com/*
// @run-at       document-start
// @noframes
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_openInTab
// @grant        window.close
// @license      MIT
// ==/UserScript==

'use strict';

const STORAGE_KEY = 'ges_v4';

const DEFAULTS = {
    lpress: { enabled: true, mode: 'bg', ms: 500 },
    rclick: { enabled: true, mode: 'fg' },
    dblRightMs: 500,
    dblTap: { enabled: false, ms: 300 },
    edge: { enabled: true, width: 40, speed: 3 },
    pager: { enabled: true, threshold: 80, window: 1000, hops: 3 }
};

const Config = {
    _cache: null,
    get() {
        if (this._cache) return this._cache;
        try {
            const saved = JSON.parse(GM_getValue(STORAGE_KEY) || '{}');
            this._cache = {
                lpress: { ...DEFAULTS.lpress, ...saved.lpress },
                rclick: { ...DEFAULTS.rclick, ...saved.rclick },
                edge: { ...DEFAULTS.edge, ...saved.edge },
                pager: { ...DEFAULTS.pager, ...saved.pager },
                dblRightMs: saved.dblRightMs ?? DEFAULTS.dblRightMs,
                dblTap: { ...DEFAULTS.dblTap, ...saved.dblTap }
            };
        } catch { this._cache = { ...DEFAULTS }; }
        return this._cache;
    },
    save(cfg) {
        GM_setValue(STORAGE_KEY, JSON.stringify({
            lpress: cfg.lpress, rclick: cfg.rclick, edge: cfg.edge, pager: cfg.pager,
            dblRightMs: cfg.dblRightMs, dblTap: cfg.dblTap
        }));
        this._cache = cfg;
    }
};

let CFG = Config.get();

/* STATE & HELPERS */
const State = {
    suppressUntil: 0, lpFired: false, rcHandled: false,
    lp: { timer: null, active: false, x: 0, y: 0 },
    dblRight: { lastTime: 0, x: 0, y: 0, timer: null },
    dblTap: { last: null },
    edge: { active: false, lastY: 0 }
};

const TOL = { move: 20, tap: 30 };
const dist = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);
const suppress = (ms = 500) => { State.suppressUntil = Date.now() + ms; };
const isEditable = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
const isInteractive = el => { if (!el) return false; const t = el.tagName; return t === 'A' || t === 'BUTTON' || t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA' || t === 'VIDEO' || t === 'AUDIO' || el.onclick || el.closest?.('button, a, [role="button"], [onclick]'); };

const getValidLink = ev => {
    for (const n of (ev.composedPath?.() || [])) {
        if (n.tagName === 'A' && n.href && !/^(javascript|mailto|tel|sms|#):/.test(n.href)) return n;
    }
    return null;
};

const openTab = (url, mode) => {
    const active = mode === 'fg';
    try { GM_openInTab(url, { active, insert: true, setParent: true }); }
    catch { const w = window.open(url, '_blank', active ? '' : 'noopener'); if (w && !active) { w.blur(); window.focus(); } }
    suppress(800);
};

const closeTab = () => { try { window.close(); } catch { } };

const cancelLP = () => { clearTimeout(State.lp.timer); State.lp.timer = null; State.lp.active = false; };

const toast = msg => {
    let t = document.getElementById('ges-toast');
    if (!t) { t = document.createElement('div'); t.id = 'ges-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._timer); t._timer = setTimeout(() => t.style.opacity = '0', 2000);
};

/* PAGER */
let wheelAcc = 0, wheelTimer = null, wheelDir = 0, wheelHops = 0;

const findLink = (keywords, relType) => {
    if (relType) {
        const rel = document.querySelector(`a[rel="${relType}"], link[rel="${relType}"]`);
        if (rel?.href) return rel.href;
    }
    for (const a of document.querySelectorAll('a[href]')) {
        const t = (a.innerText || a.getAttribute('aria-label') || '').toLowerCase();
        if (keywords.some(k => t.includes(k))) return a.href;
    }
    return null;
};

const goPage = (dir, isMax) => {
    const href = isMax
        ? findLink(dir > 0 ? ['last', 'cuối', '末'] : ['first', 'đầu', '首'], dir > 0 ? 'last' : 'first')
        : findLink(dir > 0 ? ['next', 'tiếp', 'sau', '»', '›', '下一'] : ['prev', 'trước', 'lùi', '«', '‹', '上一'], dir > 0 ? 'next' : 'prev');
    toast(isMax ? (dir > 0 ? '⏭ Cuối' : '⏮ Đầu') : (dir > 0 ? '▶ Sau' : '◀ Trước'));
    if (href) location.href = href;
};

/* STYLES */
const injectStyles = () => {
    const s = document.createElement('style');
    s.id = 'ges-styles';
    s.textContent = `
        #ges-toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1a1a1ae6;color:#fff;padding:8px 16px;border-radius:20px;font:13px/1.4 system-ui;z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .2s}
        #ges-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:2147483646;opacity:0;pointer-events:none;transition:opacity .2s}
        #ges-overlay.open{opacity:1;pointer-events:auto}
        #ges-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(.95);width:min(360px,90vw);max-height:85vh;overflow-y:auto;background:#1e1e1e;padding:16px;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.5);font:13px/1.5 system-ui;z-index:2147483647;opacity:0;pointer-events:none;transition:.2s;color:#eee}
        #ges-overlay.open #ges-panel{opacity:1;transform:translate(-50%,-50%) scale(1);pointer-events:auto}
        .ges-head{margin-bottom:12px;border-bottom:1px solid #333;padding-bottom:10px}
        .ges-title{font-weight:700;font-size:15px;margin:0;color:#fff}
        .ges-group{background:#2a2a2a;padding:10px 12px;border-radius:10px;margin-bottom:10px}
        .ges-group-title{font-size:10px;color:#888;text-transform:uppercase;font-weight:600;margin-bottom:8px;letter-spacing:.5px}
        .ges-row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}
        .ges-row:last-child{margin-bottom:0}
        .ges-label{flex:1;color:#ddd}
        .ges-input,.ges-select{border:1px solid #444;background:#333;color:#fff;border-radius:5px;padding:4px 8px;width:70px;text-align:right;font:inherit}
        .ges-select{width:auto;text-align:left}
        .ges-switch{position:relative;width:36px;height:20px;flex-shrink:0}
        .ges-switch input{opacity:0;width:0;height:0}
        .ges-slider{position:absolute;cursor:pointer;inset:0;background:#555;transition:.2s;border-radius:20px}
        .ges-slider:before{position:absolute;content:"";height:16px;width:16px;left:2px;bottom:2px;background:#fff;transition:.2s;border-radius:50%}
        input:checked+.ges-slider{background:#007AFF}
        input:checked+.ges-slider:before{transform:translateX(16px)}
        .ges-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
        .ges-btn{border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;background:#333;color:#fff;transition:.15s}
        .ges-btn:hover{background:#444}
        .ges-btn.primary{background:#007AFF}
        .ges-btn.primary:hover{background:#0066d6}
        .ges-hint{font-size:10px;color:#666;margin-top:-4px}
    `;
    document.documentElement.appendChild(s);
};

/* SETTINGS MODAL */
let modal = null;

const createModal = () => {
    const div = document.createElement('div');
    div.id = 'ges-overlay';
    div.innerHTML = `
        <div id="ges-panel">
            <div class="ges-head"><h3 class="ges-title">⚙️ Gestures</h3></div>
            <div class="ges-group">
                <div class="ges-group-title">🖱️ Chuột</div>
                <div class="ges-row"><span class="ges-label">Long-press mở link</span><label class="ges-switch"><input type="checkbox" id="g-lp-en"><span class="ges-slider"></span></label></div>
                <div class="ges-row"><span class="ges-label">↳ Chế độ</span><select id="g-lp-mode" class="ges-select"><option value="bg">Nền</option><option value="fg">Trước</option></select></div>
                <div class="ges-row"><span class="ges-label">↳ Thời gian</span><input id="g-lp-ms" type="number" class="ges-input" min="200" max="2000" step="50">ms</div>
                <div class="ges-row"><span class="ges-label">Right-click mở link</span><label class="ges-switch"><input type="checkbox" id="g-rc-en"><span class="ges-slider"></span></label></div>
                <div class="ges-row"><span class="ges-label">↳ Chế độ</span><select id="g-rc-mode" class="ges-select"><option value="bg">Nền</option><option value="fg">Trước</option></select></div>
                <div class="ges-row"><span class="ges-label">Double Right-click đóng tab</span><input id="g-dblr" type="number" class="ges-input" min="200" max="1000" step="50">ms</div>
            </div>
            <div class="ges-group">
                <div class="ges-group-title">📱 Mobile</div>
                <div class="ges-row"><span class="ges-label">Double Tap đóng tab</span><label class="ges-switch"><input type="checkbox" id="g-dblt-en"><span class="ges-slider"></span></label></div>
                <div class="ges-row"><span class="ges-label">↳ Thời gian</span><input id="g-dblt" type="number" class="ges-input" min="150" max="500" step="50">ms</div>
                <div class="ges-row"><span class="ges-label">Edge Swipe cuộn nhanh</span><label class="ges-switch"><input type="checkbox" id="g-edge-en"><span class="ges-slider"></span></label></div>
                <div class="ges-row"><span class="ges-label">↳ Vùng</span><input id="g-edge-w" type="number" class="ges-input" min="20" max="100" step="5">px</div>
                <div class="ges-row"><span class="ges-label">↳ Tốc độ</span><input id="g-edge-s" type="number" class="ges-input" min="1" max="10" step="0.5">x</div>
            </div>
            <div class="ges-group">
                <div class="ges-group-title">📄 Pager</div>
                <div class="ges-row"><span class="ges-label">Cuộn ngang chuyển trang</span><label class="ges-switch"><input type="checkbox" id="p-en"><span class="ges-slider"></span></label></div>
                <div class="ges-hint">Giữ Shift để cuộn thường</div>
            </div>
            <div class="ges-actions"><button class="ges-btn" id="ges-close">Đóng</button><button class="ges-btn primary" id="ges-save">Lưu</button></div>
        </div>`;
    document.body.appendChild(div);

    const $ = id => div.querySelector('#' + id);
    const close = () => div.classList.remove('open');

    $('ges-close').onclick = close;
    $('ges-save').onclick = () => {
        CFG.lpress = { enabled: $('g-lp-en').checked, mode: $('g-lp-mode').value, ms: +$('g-lp-ms').value || 500 };
        CFG.rclick = { enabled: $('g-rc-en').checked, mode: $('g-rc-mode').value };
        CFG.dblRightMs = +$('g-dblr').value || 500;
        CFG.dblTap = { enabled: $('g-dblt-en').checked, ms: +$('g-dblt').value || 300 };
        CFG.edge = { enabled: $('g-edge-en').checked, width: +$('g-edge-w').value || 40, speed: +$('g-edge-s').value || 3 };
        CFG.pager.enabled = $('p-en').checked;
        Config.save(CFG);
        close(); toast('✓ Đã lưu!');
    };
    div.onclick = e => { if (e.target === div) close(); };
    return div;
};

const syncModal = () => {
    if (!modal) return;
    const $ = id => modal.querySelector('#' + id);
    $('g-lp-en').checked = CFG.lpress.enabled;
    $('g-lp-mode').value = CFG.lpress.mode;
    $('g-lp-ms').value = CFG.lpress.ms;
    $('g-rc-en').checked = CFG.rclick.enabled;
    $('g-rc-mode').value = CFG.rclick.mode;
    $('g-dblr').value = CFG.dblRightMs;
    $('g-dblt-en').checked = CFG.dblTap.enabled;
    $('g-dblt').value = CFG.dblTap.ms;
    $('g-edge-en').checked = CFG.edge.enabled;
    $('g-edge-w').value = CFG.edge.width;
    $('g-edge-s').value = CFG.edge.speed;
    $('p-en').checked = CFG.pager.enabled;
};

const openSettings = () => {
    if (!modal) modal = createModal();
    syncModal();
    requestAnimationFrame(() => modal.classList.add('open'));
};

/* EVENTS */
const initEvents = () => {
    const guard = e => { if (Date.now() < State.suppressUntil) { e.preventDefault(); e.stopPropagation(); return true; } return false; };
    ['click', 'auxclick', 'contextmenu'].forEach(evt => window.addEventListener(evt, guard, true));

    window.addEventListener('contextmenu', e => { if (State.lpFired || State.lp.active) { e.preventDefault(); e.stopPropagation(); } }, true);

    // Long Press
    window.addEventListener('pointerdown', e => {
        State.lpFired = false;
        if ((e.pointerType === 'mouse' && e.button !== 0) || !CFG.lpress.enabled || isEditable(e.target)) return;
        const link = getValidLink(e);
        if (!link) return;
        State.lp = { timer: null, active: true, x: e.clientX, y: e.clientY };
        State.lp.timer = setTimeout(() => {
            if (State.lp.active) { State.lp.active = false; State.lpFired = true; openTab(link.href, CFG.lpress.mode); }
        }, CFG.lpress.ms);
    }, true);

    window.addEventListener('pointermove', e => {
        if (State.lp.active && dist(e.clientX, e.clientY, State.lp.x, State.lp.y) > TOL.move) cancelLP();
    }, true);

    ['pointerup', 'pointercancel'].forEach(evt => window.addEventListener(evt, cancelLP, true));
    window.addEventListener('click', e => { if (State.lpFired) { e.preventDefault(); e.stopPropagation(); State.lpFired = false; } }, true);

    // Double Right Click - chỉ xử lý vùng trống
    const pageLoadTime = Date.now();
    let dblRightLastEvent = null;

    window.addEventListener('mousedown', e => {
        State.rcHandled = false;
        if (e.button !== 2 || isEditable(e.target)) return;

        const link = getValidLink(e);
        if (link) { dblRightLastEvent = null; return; }

        const now = Date.now();
        if (now - pageLoadTime < 1000) return;

        clearTimeout(State.dblRight.timer);

        if (dblRightLastEvent &&
            now - dblRightLastEvent.time < CFG.dblRightMs &&
            dist(e.clientX, e.clientY, dblRightLastEvent.x, dblRightLastEvent.y) < TOL.move) {
            e.preventDefault(); e.stopPropagation();
            dblRightLastEvent = null;
            State.rcHandled = true;
            closeTab();
        } else {
            dblRightLastEvent = { time: now, x: e.clientX, y: e.clientY };
            State.dblRight.timer = setTimeout(() => { dblRightLastEvent = null; }, CFG.dblRightMs + 100);
        }
    }, true);

    // Right Click Open Link
    window.addEventListener('contextmenu', e => {
        if (State.rcHandled || guard(e)) { e.preventDefault(); e.stopPropagation(); return; }
        if (!CFG.rclick.enabled) return;
        const link = getValidLink(e);
        if (link) {
            e.preventDefault(); e.stopPropagation();
            State.rcHandled = true;
            openTab(link.href, CFG.rclick.mode);
        }
    }, true);

    // Touch
    window.addEventListener('touchstart', e => {
        State.lpFired = false;
        if (isEditable(e.target) || e.touches.length !== 1) return;
        const t = e.touches[0], now = Date.now();
        if (CFG.edge.enabled && t.clientX < CFG.edge.width) { State.edge = { active: true, lastY: t.clientY }; cancelLP(); return; }
        if (CFG.dblTap.enabled && !isInteractive(e.target)) {
            const last = State.dblTap.last;
            const timeSinceLast = last ? now - last.time : Infinity;
            if (last && last.ended && timeSinceLast >= 100 && timeSinceLast < CFG.dblTap.ms && dist(t.clientX, t.clientY, last.x, last.y) < TOL.tap) {
                e.preventDefault(); e.stopPropagation(); State.dblTap.last = null; closeTab(); return;
            }
            if (!last || timeSinceLast > 50) State.dblTap.last = { time: now, x: t.clientX, y: t.clientY, ended: false };
        }
    }, { capture: true, passive: false });

    window.addEventListener('touchmove', e => {
        if (State.dblTap.last && e.touches.length === 1) {
            const t = e.touches[0];
            if (dist(t.clientX, t.clientY, State.dblTap.last.x, State.dblTap.last.y) > TOL.tap) State.dblTap.last = null;
        }
        if (!State.edge.active || e.touches.length !== 1) { State.edge.active = false; return; }
        const t = e.touches[0], dy = State.edge.lastY - t.clientY;
        State.edge.lastY = t.clientY;
        (document.scrollingElement || document.documentElement).scrollTop += dy * CFG.edge.speed;
        e.preventDefault();
    }, { capture: true, passive: false });

    window.addEventListener('touchend', () => {
        State.edge.active = false;
        if (State.dblTap.last && !State.dblTap.last.ended) {
            State.dblTap.last.ended = true;
            State.dblTap.last.time = Date.now();
            const savedTime = State.dblTap.last.time;
            setTimeout(() => { if (State.dblTap.last && State.dblTap.last.time === savedTime) State.dblTap.last = null; }, CFG.dblTap.ms + 50);
        }
    }, true);
    window.addEventListener('touchcancel', () => { State.edge.active = false; State.dblTap.last = null; }, true);

    // Pager
    window.addEventListener('wheel', e => {
        if (!CFG.pager.enabled || e.shiftKey || Math.abs(e.deltaX) < Math.abs(e.deltaY) || Math.abs(e.deltaX) < 10) return;
        let el = e.target;
        while (el && el !== document.body) {
            if (el.scrollWidth > el.clientWidth && ['auto', 'scroll'].includes(getComputedStyle(el).overflowX)) return;
            if (el.tagName === 'INPUT' || el.isContentEditable) return;
            el = el.parentElement;
        }
        wheelAcc += e.deltaX;
        if (Math.abs(wheelAcc) > CFG.pager.threshold) {
            const dir = wheelAcc > 0 ? 1 : -1;
            wheelHops = dir !== wheelDir ? 1 : wheelHops + 1;
            wheelDir = dir; wheelAcc = 0;
            clearTimeout(wheelTimer);
            wheelTimer = setTimeout(() => { wheelDir = 0; wheelHops = 0; }, CFG.pager.window);
            if (wheelHops >= CFG.pager.hops) { goPage(dir, true); wheelHops = 0; } else goPage(dir, false);
        }
    }, { passive: true });

    document.addEventListener('keydown', e => { if (e.altKey && e.shiftKey && e.code === 'KeyG') openSettings(); });
};

/* INIT */
injectStyles();
if (document.body) initEvents();
else document.addEventListener('DOMContentLoaded', initEvents);

if (typeof GM_registerMenuCommand !== 'undefined') GM_registerMenuCommand('⚙️ Cài đặt (Alt+Shift+G)', openSettings);

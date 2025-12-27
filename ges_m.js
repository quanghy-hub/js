// ==UserScript==
// @name         Mobile Gestures
// @namespace    mobile-gestures
// @version      1.2.3
// @description  Long-press mở link, Double-tap đóng tab, Edge swipe scroll
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

const STORAGE_KEY = 'ges_mobile_v1';
const DEFAULTS = { lpress: { enabled: true, mode: 'bg', ms: 500 }, dblTap: { enabled: false, ms: 300 }, edge: { enabled: true, width: 40, speed: 3, side: 'both' } };

const Config = {
    _c: null,
    get() {
        if (this._c) return this._c;
        try {
            const s = JSON.parse(GM_getValue(STORAGE_KEY) || '{}');
            this._c = { lpress: { ...DEFAULTS.lpress, ...s.lpress }, dblTap: { ...DEFAULTS.dblTap, ...s.dblTap }, edge: { ...DEFAULTS.edge, ...s.edge } };
        } catch { this._c = { ...DEFAULTS }; }
        return this._c;
    },
    save(c) { GM_setValue(STORAGE_KEY, JSON.stringify({ lpress: c.lpress, dblTap: c.dblTap, edge: c.edge })); this._c = c; }
};

let CFG = Config.get();
const State = { suppressUntil: 0, lpFired: false, lp: { timer: null, active: false, x: 0, y: 0 }, dblTap: { last: null }, edge: { active: false, lastY: 0, lastTime: 0, velocity: 0 } };
const TOL = { move: 20, tap: 30 };
const dist = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);
const suppress = (ms = 500) => { State.suppressUntil = Date.now() + ms; };
const isEditable = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
const isInteractive = el => { if (!el) return false; const t = el.tagName; return t === 'A' || t === 'BUTTON' || t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA' || t === 'VIDEO' || t === 'AUDIO' || el.onclick || el.closest?.('button, a, [role="button"], [onclick]'); };
const getValidLink = ev => { for (const n of (ev.composedPath?.() || [])) if (n.tagName === 'A' && n.href && !/^(javascript|mailto|tel|sms|#):/.test(n.href)) return n; return null; };
const cancelLP = () => { clearTimeout(State.lp.timer); State.lp.timer = null; State.lp.active = false; };

const isInEdgeZone = (x) => {
    const { enabled, width, side } = CFG.edge;
    if (!enabled) return false;
    const w = window.innerWidth;
    if (side === 'left') return x < width;
    if (side === 'right') return x > w - width;
    return x < width || x > w - width; // both
};

const openTab = (url, mode) => {
    const active = mode === 'fg';
    try { GM_openInTab(url, { active, insert: true, setParent: true }); } catch { window.open(url, '_blank'); }
    suppress(800);
};

const closeTab = () => { try { window.close(); } catch { } };

const toast = msg => {
    let t = document.getElementById('ges-toast');
    if (!t) { t = document.createElement('div'); t.id = 'ges-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._timer); t._timer = setTimeout(() => t.style.opacity = '0', 2000);
};

/* MOMENTUM SCROLL */
let momentumRAF = null;
const startMomentum = (velocity) => {
    cancelAnimationFrame(momentumRAF);
    const el = document.scrollingElement || document.documentElement;
    const friction = 0.97, minVelocity = 0.3;
    const step = () => {
        if (Math.abs(velocity) < minVelocity) return;
        el.scrollTop += velocity;
        velocity *= friction;
        momentumRAF = requestAnimationFrame(step);
    };
    step();
};
const stopMomentum = () => cancelAnimationFrame(momentumRAF);

/* STYLES */
const injectStyles = () => {
    const s = document.createElement('style'); s.id = 'ges-styles';
    s.textContent = `#ges-toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1a1a1ae6;color:#fff;padding:8px 16px;border-radius:20px;font:13px/1.4 system-ui;z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .2s}#ges-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:2147483646;opacity:0;pointer-events:none;transition:opacity .2s}#ges-overlay.open{opacity:1;pointer-events:auto}#ges-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(.95);width:min(320px,90vw);max-height:85vh;overflow-y:auto;background:#1e1e1e;padding:14px;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.5);font:13px/1.5 system-ui;z-index:2147483647;opacity:0;pointer-events:none;transition:.2s;color:#eee}#ges-overlay.open #ges-panel{opacity:1;transform:translate(-50%,-50%) scale(1);pointer-events:auto}.ges-title{font-weight:700;font-size:14px;margin:0 0 10px;color:#fff}.ges-g{background:#2a2a2a;padding:10px;border-radius:8px;margin-bottom:8px}.ges-gt{font-size:10px;color:#888;text-transform:uppercase;font-weight:600;margin-bottom:6px}.ges-r{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px}.ges-r:last-child{margin-bottom:0}.ges-l{flex:1;color:#ddd;font-size:12px}.ges-i,.ges-s{border:1px solid #444;background:#333;color:#fff;border-radius:4px;padding:3px 6px;width:60px;text-align:right;font:inherit}.ges-s{width:auto;text-align:left}.ges-sw{position:relative;width:32px;height:18px;flex-shrink:0}.ges-sw input{opacity:0;width:0;height:0}.ges-sl{position:absolute;cursor:pointer;inset:0;background:#555;transition:.2s;border-radius:18px}.ges-sl:before{position:absolute;content:"";height:14px;width:14px;left:2px;bottom:2px;background:#fff;transition:.2s;border-radius:50%}input:checked+.ges-sl{background:#007AFF}input:checked+.ges-sl:before{transform:translateX(14px)}.ges-a{display:flex;justify-content:flex-end;gap:6px;margin-top:10px}.ges-btn{border:none;padding:6px 14px;border-radius:5px;cursor:pointer;font-weight:600;font-size:11px;background:#333;color:#fff}.ges-btn.p{background:#007AFF}`;
    document.documentElement.appendChild(s);
};

/* SETTINGS */
let modal = null;
const createModal = () => {
    const d = document.createElement('div'); d.id = 'ges-overlay';
    d.innerHTML = `<div id="ges-panel"><h3 class="ges-title">📱 Mobile Gestures</h3>
<div class="ges-g"><div class="ges-gt">👆 Touch</div>
<div class="ges-r"><span class="ges-l">Long-press mở link</span><label class="ges-sw"><input type="checkbox" id="g-lp"><span class="ges-sl"></span></label></div>
<div class="ges-r"><span class="ges-l">↳ Chế độ</span><select id="g-lpm" class="ges-s"><option value="bg">Nền</option><option value="fg">Trước</option></select></div>
<div class="ges-r"><span class="ges-l">↳ Thời gian</span><input id="g-lpms" type="number" class="ges-i" min="200" max="2000" step="50">ms</div>
<div class="ges-r"><span class="ges-l">Double Tap đóng tab</span><label class="ges-sw"><input type="checkbox" id="g-dbl"><span class="ges-sl"></span></label></div>
<div class="ges-r"><span class="ges-l">↳ Thời gian</span><input id="g-dblms" type="number" class="ges-i" min="150" max="500" step="50">ms</div></div>
<div class="ges-g"><div class="ges-gt">📜 Edge Swipe</div>
<div class="ges-r"><span class="ges-l">Bật cuộn nhanh</span><label class="ges-sw"><input type="checkbox" id="g-e"><span class="ges-sl"></span></label></div>
<div class="ges-r"><span class="ges-l">↳ Vị trí</span><select id="g-eside" class="ges-s"><option value="both">Cả hai</option><option value="left">Trái</option><option value="right">Phải</option></select></div>
<div class="ges-r"><span class="ges-l">↳ Vùng</span><input id="g-ew" type="number" class="ges-i" min="20" max="100" step="5">px</div>
<div class="ges-r"><span class="ges-l">↳ Tốc độ</span><input id="g-es" type="number" class="ges-i" min="1" max="10" step="0.5">x</div></div>
<div class="ges-a"><button class="ges-btn" id="ges-c">Đóng</button><button class="ges-btn p" id="ges-s">Lưu</button></div></div>`;
    document.body.appendChild(d);
    const $ = id => d.querySelector('#' + id), close = () => d.classList.remove('open');
    $('ges-c').onclick = close;
    $('ges-s').onclick = () => {
        CFG.lpress = { enabled: $('g-lp').checked, mode: $('g-lpm').value, ms: +$('g-lpms').value || 500 };
        CFG.dblTap = { enabled: $('g-dbl').checked, ms: +$('g-dblms').value || 300 };
        CFG.edge = { enabled: $('g-e').checked, side: $('g-eside').value, width: +$('g-ew').value || 40, speed: +$('g-es').value || 3 };
        Config.save(CFG); close(); toast('✓ Đã lưu!');
    };
    d.onclick = e => { if (e.target === d) close(); };
    return d;
};

const openSettings = () => {
    if (!modal) modal = createModal();
    const $ = id => modal.querySelector('#' + id);
    $('g-lp').checked = CFG.lpress.enabled; $('g-lpm').value = CFG.lpress.mode; $('g-lpms').value = CFG.lpress.ms;
    $('g-dbl').checked = CFG.dblTap.enabled; $('g-dblms').value = CFG.dblTap.ms;
    $('g-e').checked = CFG.edge.enabled; $('g-eside').value = CFG.edge.side || 'both';
    $('g-ew').value = CFG.edge.width; $('g-es').value = CFG.edge.speed;
    requestAnimationFrame(() => modal.classList.add('open'));
};

/* EVENTS */
const initEvents = () => {
    const guard = e => { if (Date.now() < State.suppressUntil) { e.preventDefault(); e.stopPropagation(); return true; } return false; };
    ['click', 'auxclick', 'contextmenu'].forEach(evt => window.addEventListener(evt, guard, true));

    // Block context menu when long-press fires
    window.addEventListener('contextmenu', e => { if (State.lpFired || State.lp.active) { e.preventDefault(); e.stopPropagation(); } }, true);

    window.addEventListener('touchstart', e => {
        State.lpFired = false;
        stopMomentum();
        if (isEditable(e.target) || e.touches.length !== 1) return;
        const t = e.touches[0], now = Date.now();

        // Edge swipe
        if (isInEdgeZone(t.clientX)) {
            State.edge = { active: true, lastY: t.clientY, lastTime: now, velocity: 0 };
            return;
        }

        // Double tap - only if enabled AND not on interactive element
        // Requires previous tap to be completed (ended:true) to prevent synthetic events
        if (CFG.dblTap.enabled && !isInteractive(e.target)) {
            const last = State.dblTap.last;
            const timeSinceLast = last ? now - last.time : Infinity;
            // Must have: ended, within ms window, but at least 100ms gap (prevents synthetic events)
            if (last && last.ended && timeSinceLast >= 100 && timeSinceLast < CFG.dblTap.ms && dist(t.clientX, t.clientY, last.x, last.y) < TOL.tap) {
                e.preventDefault(); e.stopPropagation(); State.dblTap.last = null; closeTab(); return;
            }
            // Only save new tap if this isn't a duplicate event (at least 50ms since last touchstart)
            if (!last || timeSinceLast > 50) {
                State.dblTap.last = { time: now, x: t.clientX, y: t.clientY, ended: false };
            }
        }

        // Long press
        if (!CFG.lpress.enabled) return;
        const link = getValidLink(e);
        if (!link) return;
        State.lp = { timer: null, active: true, x: t.clientX, y: t.clientY };
        State.lp.timer = setTimeout(() => {
            if (State.lp.active) { State.lp.active = false; State.lpFired = true; openTab(link.href, CFG.lpress.mode); }
        }, CFG.lpress.ms);
    }, { capture: true, passive: false });

    window.addEventListener('touchmove', e => {
        if (State.lp.active && e.touches.length === 1) {
            const t = e.touches[0];
            if (dist(t.clientX, t.clientY, State.lp.x, State.lp.y) > TOL.move) cancelLP();
        }
        // Reset double-tap nếu di chuyển quá xa
        if (State.dblTap.last && e.touches.length === 1) {
            const t = e.touches[0];
            if (dist(t.clientX, t.clientY, State.dblTap.last.x, State.dblTap.last.y) > TOL.tap) {
                State.dblTap.last = null;
            }
        }
        if (!State.edge.active || e.touches.length !== 1) { State.edge.active = false; return; }

        const t = e.touches[0], now = Date.now();
        const dy = State.edge.lastY - t.clientY;
        const dt = now - State.edge.lastTime;

        // Calculate velocity for momentum
        if (dt > 0) State.edge.velocity = (dy * CFG.edge.speed) / dt * 16; // normalize to ~60fps

        State.edge.lastY = t.clientY;
        State.edge.lastTime = now;

        (document.scrollingElement || document.documentElement).scrollTop += dy * CFG.edge.speed;
        e.preventDefault();
    }, { capture: true, passive: false });

    window.addEventListener('touchend', e => {
        cancelLP();
        if (State.edge.active && Math.abs(State.edge.velocity) > 1) {
            startMomentum(State.edge.velocity);
        }
        State.edge.active = false;
        // Mark tap as completed and auto-expire after timeout
        if (State.dblTap.last && !State.dblTap.last.ended) {
            State.dblTap.last.ended = true;
            State.dblTap.last.time = Date.now(); // Update time to when tap ended
            const savedTime = State.dblTap.last.time;
            setTimeout(() => {
                if (State.dblTap.last && State.dblTap.last.time === savedTime) {
                    State.dblTap.last = null;
                }
            }, CFG.dblTap.ms + 50);
        }
    }, true);

    window.addEventListener('touchcancel', () => { cancelLP(); State.edge.active = false; }, true);
    window.addEventListener('click', e => { if (State.lpFired) { e.preventDefault(); e.stopPropagation(); State.lpFired = false; } }, true);
};

/* INIT */
injectStyles();
if (document.body) initEvents(); else document.addEventListener('DOMContentLoaded', initEvents);
if (typeof GM_registerMenuCommand !== 'undefined') GM_registerMenuCommand('📱 Cài đặt', openSettings);

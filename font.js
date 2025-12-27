// ==UserScript==
// @name         Aa Text Size per-site (centered panel, 60–200%)
// @namespace    qh.textsize.per_site
// @version      1.9.0
// @description  Tăng/giảm cỡ CHỮ THEO TỪNG WEBSITE bằng text-size-adjust. Panel 90% chiều ngang, căn giữa. Dải 60–200%. Không có icon nổi.
// @match        *://*/*
// @exclude      *://mail.google.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @license      MIT
// ==/UserScript==

(() => {
    'use strict';

    const HOST = location.host.replace(/^www\./, '');
    const KEY = `qh_ts:${HOST}`;
    const MIN = 60, MAX = 200, STEP = 1;
    const DEFAULT = { enabled: true, pct: 100 }; // 100% = mặc định

    function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
    function read() {
        try {
            const obj = Object.assign({}, DEFAULT, JSON.parse(GM_getValue(KEY, '{}')));
            // Tương thích rất cũ: adjPct 0..+100 -> pct 100..200
            if (typeof obj.adjPct === 'number' && !('pct' in obj)) {
                obj.pct = clamp(100 + obj.adjPct, MIN, MAX);
            }
            obj.pct = clamp(obj.pct, MIN, MAX);
            return obj;
        } catch { return { ...DEFAULT }; }
    }
    function save() { GM_setValue(KEY, JSON.stringify(state)); }

    let state = read();

    // Áp ngay khi khởi chạy
    GM_addStyle(`
    html{ --qh_ts_value:${state.enabled ? state.pct : 100}% !important; }
    html{ -webkit-text-size-adjust: var(--qh_ts_value) !important; text-size-adjust: var(--qh_ts_value) !important; }

    /* PANEL: căn giữa đáy, ~90% chiều ngang, không bị ảnh hưởng bởi text-size-adjust */
    .qh-aa-panel{
      position: fixed; left:50%; bottom:12px; transform: translateX(-50%);
      z-index: 2147483647;
      width: min(90vw, 960px);
      padding: 12px; border-radius: 12px;
      background: rgba(255,255,255,.98); color:#111; border:1px solid rgba(0,0,0,.12);
      box-shadow: 0 8px 32px rgba(0,0,0,.18); font: 500 14px/1.35 system-ui,sans-serif;
      -webkit-text-size-adjust: 100% !important; text-size-adjust: 100% !important;
      user-select: none;
    }
    .qh-aa-top{ display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
    .qh-aa-x{ width:28px; height:28px; border-radius:8px; border:1px solid rgba(0,0,0,.12); background:#fff; cursor:pointer; }
    .qh-aa-row{ display:flex; align-items:center; gap:12px; margin-top:8px; flex-wrap:wrap; }

    /* Thanh trượt: dài theo panel, cố định chiều cao, mượt mobile */
    .qh-aa-wrap{ position:relative; flex:1 1 600px; height: 44px; }
    .qh-aa-range{
      position:absolute; left:0; right:0; top:16px; width:100%; height:28px;
      appearance:none; -webkit-appearance:none; background:transparent;
      touch-action: pan-x;
    }
    .qh-aa-range::-webkit-slider-runnable-track{
      height:4px; border-radius:999px;
      background:linear-gradient(to right,#4c7cff 0%, #4c7cff var(--fill,0%), rgba(0,0,0,.2) var(--fill,0%), rgba(0,0,0,.2) 100%);
    }
    .qh-aa-range::-moz-range-track{
      height:4px; border-radius:999px; background: rgba(0,0,0,.2);
    }
    .qh-aa-range::-webkit-slider-thumb{
      -webkit-appearance:none; appearance:none; width:20px; height:20px; border-radius:50%;
      background:#fff; border:1px solid rgba(0,0,0,.25); margin-top:-8px; box-shadow:0 1px 2px rgba(0,0,0,.15);
    }
    .qh-aa-range::-moz-range-thumb{
      width:20px; height:20px; border-radius:50%; background:#fff; border:1px solid rgba(0,0,0,.25);
      box-shadow:0 1px 2px rgba(0,0,0,.15);
    }

    /* Bubble % trên track */
    .qh-aa-bubble{
      position:absolute; top:-2px; transform:translateX(-50%);
      padding:2px 6px; border-radius:8px; font-weight:700; font-size:12px;
      background:#111; color:#fff; pointer-events:none; white-space:nowrap;
    }
    .qh-aa-bubble::after{
      content:""; position:absolute; left:50%; transform:translateX(-50%);
      bottom:-5px; border:5px solid transparent; border-top-color:#111;
    }

    .qh-aa-badge{ min-width:76px; text-align:right; font-weight:700; }
    .qh-aa-btn2{ padding:6px 10px; border-radius:8px; border:1px solid rgba(0,0,0,.12); background:#fff; font:600 13px/1 system-ui,sans-serif; cursor:pointer; }
    .qh-aa-note{ font-size:12px; color:#555; margin-top:6px; }

    @media (prefers-color-scheme: dark){
      .qh-aa-panel{ background: rgba(26,26,26,.98); color:#f1f1f1; border-color: rgba(255,255,255,.12); }
      .qh-aa-x,.qh-aa-btn2{ background:#151515; color:#eee; border-color: rgba(255,255,255,.12); }
      .qh-aa-note{ color:#aaa; }
      .qh-aa-range::-webkit-slider-runnable-track{
        background:linear-gradient(to right,#9bb4ff 0%, #9bb4ff var(--fill,0%), rgba(255,255,255,.2) var(--fill,0%), rgba(255,255,255,.2) 100%);
      }
      .qh-aa-range::-moz-range-track{ background: rgba(255,255,255,.2); }
      .qh-aa-range::-webkit-slider-thumb{ background:#222; border-color: rgba(255,255,255,.25); }
      .qh-aa-range::-moz-range-thumb{ background:#222; border-color: rgba(255,255,255,.25); }
    }
  `);

    function applyPct(pct) {
        const val = state.enabled ? pct : 100;
        const root = document.documentElement;
        root.style.setProperty('--qh_ts_value', val + '%');
        root.style.setProperty('text-size-adjust', val + '%', 'important');
        root.style.setProperty('-webkit-text-size-adjust', val + '%', 'important');
    }

    applyPct(state.pct);

    // Panel state
    let $panel, $range, $out, $enable, $bubble, rafId = 0, pending = state.pct;

    function openPanel() {
        closePanel();
        $panel = document.createElement('div');
        $panel.className = 'qh-aa-panel';
        $panel.innerHTML = `
      <div class="qh-aa-top">
        <div class="title">Cỡ chữ: ${HOST}</div>
        <button class="qh-aa-x" type="button" aria-label="Đóng">✕</button>
      </div>

      <div class="qh-aa-row" style="align-items:flex-start;">
        <div class="qh-aa-wrap">
          <div class="qh-aa-bubble" id="qh-aa-bubble">${state.pct}%</div>
          <input class="qh-aa-range" type="range" min="${MIN}" max="${MAX}" step="${STEP}" value="${state.pct}" />
        </div>
        <div class="qh-aa-badge"><span id="qh-aa-out">${state.pct}</span>%</div>
      </div>

      <div class="qh-aa-row">
        <button class="qh-aa-btn2" data-delta="-1">-1%</button>
        <button class="qh-aa-btn2" data-delta="+1">+1%</button>
        <button class="qh-aa-btn2" data-set="100">Reset 100%</button>
      </div>

      <div class="qh-aa-row">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input id="qh-aa-enable" type="checkbox" ${state.enabled ? 'checked' : ''} />
          Bật trên ${HOST}
        </label>
      </div>
      <div class="qh-aa-note">Phóng CHỮ bằng <code>text-size-adjust</code>. Dải 60–200%, bước 1%.</div>
    `;
        document.documentElement.appendChild($panel);

        // refs
        $panel.querySelector('.qh-aa-x').onclick = closePanel;
        $range = $panel.querySelector('.qh-aa-range');
        $out = $panel.querySelector('#qh-aa-out');
        $enable = $panel.querySelector('#qh-aa-enable');
        $bubble = $panel.querySelector('#qh-aa-bubble');

        // visuals
        const thumbPx = 20;
        const updateVisual = (val) => {
            if (!$range || !$bubble || !$out) return;
            const min = +$range.min, max = +$range.max;
            const pct01 = (val - min) / (max - min);
            const rect = $range.getBoundingClientRect();
            const x = pct01 * (rect.width - thumbPx) + thumbPx / 2;
            $bubble.style.left = x + 'px';
            $bubble.textContent = val + '%';
            $range.style.setProperty('--fill', Math.round(pct01 * 100) + '%');
            $out.textContent = String(val);
        };

        const schedule = () => {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                rafId = 0;
                applyPct(pending);
                updateVisual(pending);
            });
        };

        // input handlers
        $range.addEventListener('input', () => {
            pending = clamp(+$range.value, MIN, MAX);
            schedule();
        }, { passive: true });

        const commit = () => { state.pct = pending; save(); };
        ['change', 'keyup'].forEach(ev => {
            $range.addEventListener(ev, () => { pending = clamp(+$range.value, MIN, MAX); schedule(); commit(); });
        });

        window.addEventListener('resize', () => updateVisual(clamp(+$range.value, MIN, MAX)), { passive: true });

        // buttons
        $panel.querySelectorAll('.qh-aa-btn2[data-delta]').forEach(b => {
            b.onclick = () => {
                const d = b.getAttribute('data-delta') === '+1' ? 1 : -1;
                pending = clamp((+$range.value) + d, MIN, MAX);
                $range.value = String(pending);
                schedule(); commit();
            };
        });
        $panel.querySelector('.qh-aa-btn2[data-set="100"]').onclick = () => {
            pending = 100; $range.value = '100'; schedule(); commit();
        };

        // enable
        $enable.onchange = () => { state.enabled = !!$enable.checked; save(); applyPct(pending); updateVisual(pending); };

        // click ngoài để đóng
        setTimeout(() => {
            const onDocClick = (e) => {
                if (!$panel) return;
                if (!$panel.contains(e.target)) closePanel();
            };
            document.addEventListener('click', onDocClick, { capture: true, once: true });
        }, 0);

        // init visuals
        updateVisual(state.pct);
    }

    function closePanel() {
        if ($panel && $panel.isConnected) $panel.remove();
        $panel = $range = $out = $enable = $bubble = null;
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    }

    // Menu ScriptCat
    function registerMenu() {
        try {
            GM_registerMenuCommand(`Aa • Mở cài đặt (${HOST})`, openPanel);
            GM_registerMenuCommand(`Aa • +1%`, () => { state.pct = clamp(state.pct + 1, MIN, MAX); save(); applyPct(state.pct); });
            GM_registerMenuCommand(`Aa • -1%`, () => { state.pct = clamp(state.pct - 1, MIN, MAX); save(); applyPct(state.pct); });
            GM_registerMenuCommand(`Aa • Reset 100%`, () => { state.pct = 100; save(); applyPct(state.pct); });
            GM_registerMenuCommand(state.enabled ? `Aa • Tắt trên ${HOST}` : `Aa • Bật trên ${HOST}`, () => {
                state.enabled = !state.enabled; save(); applyPct(state.pct);
            });
        } catch { }
    }

    registerMenu();
})();
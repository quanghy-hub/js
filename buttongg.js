// ==UserScript==
// @name         Google Search Extra Buttons
// @description  Quick time filter for Google Search
// @version      5.0.0
// @match        *://www.google.*/search*
// @include      /^https?:\/\/www\.google\.[a-z.]+\/search.*/
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    // Config 
    const CONFIG = {
        ICON_SIZE: 36,
        CELL_SIZE: 32,
        COLUMNS: 6
    };

    const STYLES = `
        .gseb-trigger {
            position: fixed;
            top: 130px;
            left: 160px;
            width: ${CONFIG.ICON_SIZE}px;
            height: ${CONFIG.ICON_SIZE}px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #4285f4;
            color: #fff;
            border: none;
            border-radius: 50%;
            cursor: grab;
            z-index: 99999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            font-size: 16px;
            user-select: none;
            touch-action: none;
        }
        .gseb-trigger:active { opacity: 0.8; }
        .gseb-trigger.active { background: #1a73e8; }
        .gseb-trigger.dragging { cursor: grabbing; opacity: 0.7; }
        
        .gseb-panel {
            position: fixed;
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            padding: 10px;
            z-index: 99998;
            display: none;
        }
        .gseb-panel.show { display: block; }
        
        .gseb-grid {
            display: grid;
            grid-template-columns: repeat(${CONFIG.COLUMNS}, ${CONFIG.CELL_SIZE}px);
            gap: 4px;
        }
        
        .gseb-header {
            grid-column: 1 / -1;
            font-size: 10px;
            color: #5f6368;
            padding: 4px 2px 2px;
            font-weight: 600;
            border-top: 1px solid #eee;
        }
        .gseb-header:first-child { border-top: none; padding-top: 0; }
        
        .gseb-cell {
            width: ${CONFIG.CELL_SIZE}px;
            height: 28px;
            border: none;
            border-radius: 6px;
            background: #f1f3f4;
            color: #3c4043;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
        }
        .gseb-cell:hover { background: #4285f4; color: #fff; }
        
        html[dark] .gseb-panel { background: #292a2d; }
        html[dark] .gseb-header { color: #9aa0a6; border-color: #444; }
        html[dark] .gseb-cell { background: #3c4043; color: #e8eaed; }
        html[dark] .gseb-cell:hover { background: #4285f4; }
    `;

    const FILTERS = [
        { name: 'Hour', p: 'h', n: [1, 2, 3, 4, 6, 12] },
        { name: 'Day', p: 'd', n: [1, 2, 3, 4, 5, 6, 7] },
        { name: 'Week', p: 'w', n: [1, 2, 3, 4] },
        { name: 'Month', p: 'm', n: [1, 2, 3, 6, 9, 12] },
        { name: 'Year', p: 'y', n: [1, 2, 3, 4, 5] },
        { name: 'File', p: 'file', n: ['PDF', 'DOC', 'XLS', 'PPT', 'TXT'] }
    ];

    let panel, trigger, panelOpen = false, isDragging = false, touchMoved = false;

    function init() {
        document.head.appendChild(Object.assign(document.createElement('style'), { textContent: STYLES }));

        trigger = document.createElement('button');
        trigger.className = 'gseb-trigger';
        trigger.innerHTML = '🔍';

        const saved = localStorage.getItem('gseb_pos');
        if (saved) { const p = JSON.parse(saved); trigger.style.top = p.top + 'px'; trigger.style.left = p.left + 'px'; }

        panel = document.createElement('div');
        panel.className = 'gseb-panel';

        const grid = document.createElement('div');
        grid.className = 'gseb-grid';

        FILTERS.forEach(f => {
            const header = document.createElement('div');
            header.className = 'gseb-header';
            header.textContent = f.name;
            grid.appendChild(header);

            f.n.forEach(v => {
                const btn = document.createElement('button');
                btn.className = 'gseb-cell';
                btn.textContent = f.p === 'file' ? v : v + f.p.toUpperCase();
                btn.onclick = (e) => { e.stopPropagation(); f.p === 'file' ? applyFile(v) : applyTime(f.p, v); };
                grid.appendChild(btn);
            });
        });

        panel.appendChild(grid);
        document.body.append(trigger, panel);
        setupEvents();
    }

    function setupEvents() {
        let startX, startY, startL, startT;

        const show = () => { updatePos(); panel.classList.add('show'); trigger.classList.add('active'); panelOpen = true; };
        const hide = () => { panel.classList.remove('show'); trigger.classList.remove('active'); panelOpen = false; };
        const toggle = () => { panelOpen ? hide() : show(); };

        // Drag handlers
        const onStart = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            const pt = e.touches?.[0] || e;
            startX = pt.clientX; startY = pt.clientY;
            startL = trigger.offsetLeft; startT = trigger.offsetTop;
            isDragging = false; touchMoved = false;
            trigger.classList.add('dragging');
        };

        const onMove = (e) => {
            const pt = e.touches?.[0] || e;
            const dx = pt.clientX - startX, dy = pt.clientY - startY;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) { isDragging = true; touchMoved = true; }
            if (isDragging) {
                if (e.cancelable) e.preventDefault();
                trigger.style.left = Math.max(0, startL + dx) + 'px';
                trigger.style.top = Math.max(0, startT + dy) + 'px';
            }
        };

        const onEnd = () => {
            trigger.classList.remove('dragging');
            if (isDragging) {
                localStorage.setItem('gseb_pos', JSON.stringify({ top: trigger.offsetTop, left: trigger.offsetLeft }));
            }
        };

        // Mouse
        trigger.addEventListener('mousedown', (e) => {
            onStart(e);
            const move = (e) => onMove(e);
            const up = () => { document.removeEventListener('mousemove', move); onEnd(); };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up, { once: true });
        });

        // Click to toggle (only if not dragging)
        trigger.addEventListener('click', (e) => {
            if (!isDragging) toggle();
            isDragging = false;
        });

        // Touch
        trigger.addEventListener('touchstart', onStart, { passive: false });
        trigger.addEventListener('touchmove', onMove, { passive: false });
        trigger.addEventListener('touchend', () => {
            onEnd();
            if (!touchMoved) toggle();
            touchMoved = false;
        });

        // Outside click to close
        document.addEventListener('click', (e) => {
            if (panelOpen && !trigger.contains(e.target) && !panel.contains(e.target)) hide();
        });
    }

    function updatePos() {
        const r = trigger.getBoundingClientRect();
        panel.style.top = (r.bottom + 8) + 'px';
        panel.style.left = r.left + 'px';
    }

    function applyTime(p, v) {
        const url = new URL(location.href);
        url.searchParams.set('tbs', `qdr:${p}${v > 1 ? v : ''}`);
        location.href = url.toString();
    }

    function applyFile(type) {
        const input = document.querySelector('textarea[name="q"], input[name="q"]');
        const q = (input?.value || '').replace(/\s*filetype:\w+/gi, '').trim();
        const url = new URL(location.href);
        url.searchParams.set('q', `${q} filetype:${type}`);
        location.href = url.toString();
    }

    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();

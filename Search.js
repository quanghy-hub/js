// ==UserScript==
// @name         Search
// @namespace    qsb.search.bubble
// @version      2.1.0
// @description  Quick Search Bubble - Compact Edition
// @match        *://*/*
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

    // === CONFIG ===
    const C = {
        KEY: 'qsb.providers.v5',
        OFF: 8, SZ: 28, IMG: 16, MAX: 6, ROW_TEXT: 4, ROW_IMG: 4,
        TOAST: 1200, SEL: 150, HOVER: 120, HIDE: 220, LONG: 450
    };

    const DEF = [
        { name: 'Google', url: 'https://www.google.com/search?q={{q}}', icon: 'https://www.google.com/favicon.ico' },
        { name: 'YouTube', url: 'https://www.youtube.com/results?search_query={{q}}', icon: 'https://www.youtube.com/favicon.ico' },
        { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={{q}}', icon: 'https://duckduckgo.com/favicon.ico' },
        { name: 'Bing', url: 'https://www.bing.com/search?q={{q}}', icon: 'https://www.bing.com/favicon.ico' },
        { name: 'Ảnh Google', url: 'https://www.google.com/search?tbm=isch&q={{q}}', icon: 'https://www.google.com/favicon.ico' },
        { name: 'Perplexity', url: 'https://www.perplexity.ai/?q={{q}}', icon: 'https://www.google.com/s2/favicons?domain=perplexity.ai&sz=32' },
    ];

    // Image search providers (search by image URL)
    const IMG_SEARCH = [
        { name: 'Google Lens', url: 'https://lens.google.com/uploadbyurl?url={{img}}', icon: 'https://www.google.com/favicon.ico' },
        { name: 'Bing Visual', url: 'https://www.bing.com/images/search?view=detailv2&iss=sbi&form=SBIIDP&q=imgurl:{{img}}', icon: 'https://www.bing.com/favicon.ico' },
    ];

    // === STORAGE ===
    const get = k => { try { return JSON.parse(GM_getValue(k)); } catch { return null; } };
    const set = (k, v) => GM_setValue(k, JSON.stringify(v));
    const providers = () => { const a = get(C.KEY); return Array.isArray(a) && a.length ? a.slice(0, C.MAX) : DEF; };

    // === UTILS ===
    const enc = s => encodeURIComponent(String(s || '').trim().replace(/\s+/g, ' '));
    const esc = s => (s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

    const copy = async txt => {
        try { await navigator.clipboard.writeText(txt); return true; }
        catch { const t = Object.assign(document.createElement('textarea'), { value: txt, style: 'position:fixed;opacity:0' }); document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); return true; }
    };

    const selectAll = () => {
        const a = document.activeElement;
        if (a?.tagName === 'INPUT' || a?.tagName === 'TEXTAREA') { a.focus(); a.select(); return true; }
        const s = getSelection(); s?.removeAllRanges(); const r = document.createRange(); r.selectNodeContents(document.body); s?.addRange(r); return true;
    };

    const fname = u => { try { const n = new URL(u, location.href).pathname.split('/').pop()?.split('?')[0] || 'image'; return /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(n) ? n : n + '.jpg'; } catch { return 'image.jpg'; } };
    const getImg = t => !t?.tagName || t.closest?.('.qsb') ? null : t.tagName === 'IMG' ? t : t.closest?.('picture')?.querySelector('img');

    // === STYLES ===
    GM_addStyle(`
.qsb{position:absolute;z-index:2147483646;display:none;background:#1a1a1a;padding:6px;border-radius:8px;box-shadow:0 8px 25px rgba(0,0,0,.5)}
.qsb-g{display:grid;gap:6px}
.qsb-i{width:${C.SZ}px;height:${C.SZ}px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s}
.qsb-i:hover{background:rgba(255,255,255,.15)}
.qsb-i img{width:${C.IMG}px;height:${C.IMG}px;object-fit:contain}
.qsb-i .g{font:15px/1 system-ui;color:#eee}
.qsb-t{position:fixed;padding:6px 12px;background:#222;color:#fff;border-radius:6px;font:12px system-ui;z-index:2147483647;box-shadow:0 5px 15px rgba(0,0,0,.3)}
.qsb-m{position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:2147483647;font-family:system-ui}
.qsb-p{background:#181818;color:#eee;width:min(650px,94vw);border-radius:12px;padding:20px;box-shadow:0 15px 50px #000}
.qsb-p h3{margin:0 0 15px;font-size:16px;font-weight:600;color:#fff}
.qsb-gr{display:grid;grid-template-columns:1fr 2fr 2fr;gap:8px;margin-bottom:15px}
.qsb-h{font-size:11px;opacity:.6;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
.qsb-gr input{background:#252525;border:none;color:#fff;padding:6px 10px;border-radius:4px;width:100%;font:13px system-ui}
.qsb-gr input:focus{background:#303030;outline:none}
.qsb-a{display:flex;justify-content:space-between;align-items:center;margin-top:15px}
.qsb-b{padding:8px 16px;border:none;border-radius:6px;background:#333;color:#eee;cursor:pointer}
.qsb-b.p{background:#238636;color:#fff}
.qsb-b:hover{filter:brightness(1.1)}
.qsb-n{font-size:11px;opacity:.5;max-width:300px}`);

    // === UI ===
    let bubble, grid, ctx, hoverImg, timers = {};

    const toast = (msg, x, y) => {
        const el = Object.assign(document.createElement('div'), { className: 'qsb-t', textContent: msg });
        el.style.cssText = `left:${Math.min(x, innerWidth - 200)}px;top:${Math.max(6, y - 36)}px`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), C.TOAST);
    };

    const hide = () => { if (bubble) bubble.style.display = 'none'; ctx = null; };

    const show = (items, x, y, cols) => {
        if (!bubble) {
            bubble = Object.assign(document.createElement('div'), { className: 'qsb' });
            grid = Object.assign(document.createElement('div'), { className: 'qsb-g' });
            bubble.append(grid);
            bubble.onmouseenter = () => clearTimeout(timers.hh);
            bubble.onmouseleave = () => { if (!hoverImg?.matches(':hover')) hide(); };
            document.body.appendChild(bubble);
        }
        grid.innerHTML = '';
        items.forEach(it => {
            const b = Object.assign(document.createElement('div'), { className: 'qsb-i', title: it.t || '', innerHTML: it.h });
            b.onclick = e => { e.preventDefault(); e.stopPropagation(); it.f(); };
            grid.appendChild(b);
        });
        grid.style.gridTemplateColumns = `repeat(${cols},${C.SZ}px)`;
        bubble.style.display = 'block';
        const w = bubble.offsetWidth, h = bubble.offsetHeight;
        bubble.style.left = Math.max(6, Math.min(x, scrollX + innerWidth - w - 6)) + 'px';
        bubble.style.top = Math.max(6, Math.min(y, scrollY + innerHeight - h - 6)) + 'px';
    };

    const dl = (src, x, y) => {
        const fb = () => GM_openInTab(src, { active: true, insert: true });
        if (typeof GM_download === 'function') {
            try { GM_download({ url: src, name: fname(src), saveAs: false, onerror: fb, ontimeout: fb }); toast('Đang tải ảnh...', x, y); return; } catch { }
        }
        fb(); toast('Mở tab mới để lưu', x, y);
    };

    // === ACTIONS ===
    const open = (url, txt, img) => {
        const u = (url || '').replace('{{q}}', enc(txt || '')).replace('{{img}}', img ? encodeURIComponent(img) : '');
        if (u) GM_openInTab(u, { active: true, insert: true });
        hide();
    };

    const items = c => {
        const ps = providers(), arr = [];
        if (c.type === 'text') {
            // 8 icons: Copy, SelectAll, + 6 providers = 4x2 grid
            arr.push({ t: 'Copy', h: '<span class="g">⧉</span>', f: async () => { toast(await copy(c.text) ? 'Đã chép' : 'Lỗi', c.x, c.y); hide(); } });
            arr.push({ t: 'Select All', h: '<span class="g">⤢</span>', f: () => { selectAll(); toast('Đã chọn hết', c.x, c.y); } });
            ps.forEach(p => arr.push({ t: p.name, h: p.icon ? `<img src="${p.icon}">` : '<span class="g">🔗</span>', f: () => open(p.url, c.text) }));
        } else if (c.type === 'image') {
            // 4 icons: Download, Copy URL, Google Lens, Bing Visual = 4x1 grid
            arr.push({ t: 'Tải ảnh', h: '<span class="g">⬇</span>', f: () => { dl(c.img, c.x, c.y); hide(); } });
            arr.push({ t: 'Copy URL', h: '<span class="g">⧉</span>', f: async () => { await copy(c.img); toast('Đã chép URL', c.x, c.y); hide(); } });
            IMG_SEARCH.forEach(p => arr.push({ t: p.name, h: p.icon ? `<img src="${p.icon}">` : '<span class="g">🔗</span>', f: () => open(p.url, null, c.img) }));
        }
        return arr;
    };

    // === SETTINGS ===
    const openSettings = () => {
        const ps = providers();
        const rows = Array.from({ length: C.MAX }).map((_, i) => {
            const p = ps[i] || {};
            return `<input value="${esc(p.name || '')}" placeholder="Tên ${i + 1}"><input value="${esc(p.url || '')}" placeholder="URL..."><input value="${esc(p.icon || '')}" placeholder="Icon...">`;
        }).join('');

        const m = Object.assign(document.createElement('div'), { className: 'qsb-m' });
        m.innerHTML = `<div class="qsb-p"><h3>Cấu hình Quick Search</h3><div class="qsb-gr" id="qg"><div class="qsb-h">Tên</div><div class="qsb-h">URL ({{q}})</div><div class="qsb-h">Icon</div>${rows}</div><div class="qsb-a"><div class="qsb-n">Mẹo: Dùng {{q}} cho từ khóa tìm kiếm</div><div style="display:flex;gap:10px"><button class="qsb-b" id="qr">Mặc định</button><button class="qsb-b p" id="qs">Lưu</button></div></div></div>`;
        m.onclick = e => e.target === m && m.remove();
        m.querySelector('#qr').onclick = () => { set(C.KEY, DEF); m.remove(); alert('Đã khôi phục!'); };
        m.querySelector('#qs').onclick = () => {
            const ins = m.querySelectorAll('#qg input'), np = [];
            for (let i = 0; i < ins.length; i += 3) if (ins[i].value.trim()) np.push({ name: ins[i].value.trim(), url: ins[i + 1].value.trim(), icon: ins[i + 2].value.trim() });
            set(C.KEY, np.slice(0, C.MAX));
            m.remove(); alert('Đã lưu!');
        };
        document.body.appendChild(m);
    };

    // === EVENTS ===
    document.addEventListener('selectionchange', () => {
        clearTimeout(timers.sel);
        timers.sel = setTimeout(() => {
            const s = getSelection(), t = String(s).trim(), a = document.activeElement;
            if (!t || a?.tagName === 'INPUT' || a?.tagName === 'TEXTAREA') return;
            const r = s.getRangeAt(0).getBoundingClientRect();
            if (r.width > 0) { ctx = { type: 'text', text: t, x: r.left + scrollX, y: r.bottom + scrollY + C.OFF }; show(items(ctx), ctx.x, ctx.y, C.ROW_TEXT); }
        }, C.SEL);
    });

    document.addEventListener('contextmenu', e => {
        const img = getImg(e.target);
        if (img?.src) { ctx = { type: 'image', img: img.src, x: e.pageX + 6, y: e.pageY + 6 }; show(items(ctx), ctx.x, ctx.y, C.ROW_IMG); }
    }, { capture: true });

    document.addEventListener('pointerenter', e => {
        if (e.pointerType !== 'mouse') return;
        const img = getImg(e.target); if (!img) return;
        hoverImg = img; clearTimeout(timers.hv); clearTimeout(timers.hh);
        timers.hv = setTimeout(() => {
            const src = img.currentSrc || img.src; if (!src) return;
            ctx = { type: 'image', img: src, x: e.pageX + 6, y: e.pageY + 6 }; show(items(ctx), ctx.x, ctx.y, C.ROW_IMG);
        }, C.HOVER);
    }, { capture: true });

    document.addEventListener('pointerleave', e => {
        if (e.pointerType !== 'mouse' || getImg(e.target) !== hoverImg) return;
        clearTimeout(timers.hv);
        timers.hh = setTimeout(() => { if (!bubble?.matches(':hover')) hide(); }, C.HIDE);
    }, { capture: true });

    // Long press
    let lp = {}, lpT;
    document.addEventListener('pointerdown', e => {
        const img = getImg(e.target); if (!img) return;
        lp = { img, x: e.pageX, y: e.pageY };
        lpT = setTimeout(() => { const src = img.currentSrc || img.src; if (src) { ctx = { type: 'image', img: src, x: lp.x + 6, y: lp.y + 6 }; show(items(ctx), ctx.x, ctx.y, C.ROW_IMG); } }, C.LONG);
    }, { passive: true });
    document.addEventListener('pointermove', e => { if (lpT && (Math.abs(e.pageX - lp.x) > 5 || Math.abs(e.pageY - lp.y) > 5)) { clearTimeout(lpT); lpT = null; } }, { passive: true });
    document.addEventListener('pointerup', () => { clearTimeout(lpT); lpT = null; }, { passive: true });
    document.addEventListener('pointercancel', () => { clearTimeout(lpT); lpT = null; }, { passive: true });

    // Dismiss
    document.addEventListener('mousedown', e => { if (bubble && !bubble.contains(e.target)) hide(); });
    document.addEventListener('scroll', hide, { capture: true, passive: true });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });

    // Menu
    GM_registerMenuCommand('⚙️ Cấu hình Quick Search', openSettings);
})();

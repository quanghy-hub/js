// ==UserScript==
// @name         Translate
// @namespace    vn.inline.translate.ctrl.swipe.groups
// @version      2.6.0
// @description  Swipe/hotkey translate. Video safe zone. Optimized for mobile.
// @author       you
// @match        http://*/*
// @match        https://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      translate.googleapis.com
// @connect      generativelanguage.googleapis.com
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  /* ================= CONFIG ================= */
  const K = 'inline_t_cfg::GLOBAL';
  const def = {
    provider: 'google', geminiKey: '', geminiModel: 'gemini-1.5-flash',
    hotkey: 'shift', swipeEnabled: true, swipeDir: 'both',
    swipePx: 60, swipeSlopeMax: 0.4,
    fontScale: 0.95, mutedColor: '#00bfff', bgBlend: 'transparent',
    dedupeSeconds: 0.7
  };
  let cfg = { ...def, ...JSON.parse(GM_getValue(K) || '{}') };
  const save = () => GM_setValue(K, JSON.stringify(cfg));

  /* ================= STYLES ================= */
  const sty = document.createElement('style');
  sty.textContent = `
    :root{--ilt-fs:${cfg.fontScale}em;--ilt-fg:${cfg.mutedColor};--ilt-bg:${cfg.bgBlend}}
    .ilt-panel{position:fixed;z-index:2147483647;top:10px;right:10px;background:#1a1a1ae6;border:1px solid #444;border-radius:12px;padding:12px;color:#eee;font:13px system-ui;max-width:320px;backdrop-filter:blur(6px)}
    .ilt-row{display:flex;justify-content:space-between;margin:8px 0;gap:10px}
    .ilt-panel input,.ilt-panel select{background:#333;border:1px solid #555;color:#fff;border-radius:4px;padding:4px;max-width:140px}
    .ilt-btn{width:100%;margin-top:10px;padding:8px;background:#0079d3;border:none;border-radius:4px;color:#fff;cursor:pointer}
    .ilt-trans-container{margin:8px 0;width:100%;animation:iF .2s;border-top:1px dashed #444;padding-top:6px}
    .ilt-trans{padding:6px 12px;border-left:3px solid var(--ilt-fg);background:var(--ilt-bg);color:var(--ilt-fg);font:italic var(--ilt-fs)/1.6 system-ui;white-space:pre-wrap}
    .ilt-meta{font-size:.75em;opacity:.6}
    @keyframes iF{from{transform:translateY(-5px);opacity:0}to{transform:none;opacity:1}}
  `;
  document.head.appendChild(sty);

  /* ================= TEXT DETECTION ================= */
  const isReddit = location.hostname.includes('reddit.com');
  const R_DEEP = ['div[id$="-post-rtjson-content"]', '.md', '[data-post-click-location="text-body"] > div', '[slot="text-body"] div', '[slot="text-body"]'];
  const VALID_TAGS = /^(P|LI|H[1-6]|BLOCKQUOTE|TD|TH|PRE|FIGCAPTION|DIV|SPAN|A|ARTICLE|LABEL)$/;

  function getBlock(el) {
    if (!el || el === document.body) return null;

    // Reddit: find post/comment content
    if (isReddit) {
      const post = el.closest('shreddit-post');
      if (post) {
        const body = post.querySelector('shreddit-post-text-body');
        if (body) {
          for (const s of R_DEEP) {
            const c = body.querySelector(s);
            if (c?.innerText.trim()) return { t: c.innerText.trim(), n: c };
          }
          if (body.innerText.trim()) return { t: body.innerText.trim(), n: body };
        }
        const title = post.querySelector('[slot="title"]');
        if (title?.innerText.trim()) return { t: title.innerText.trim(), n: title };
      }
      const comment = el.closest('shreddit-comment');
      if (comment) {
        const c = comment.querySelector('.md, [slot="comment"]');
        if (c?.innerText.trim()) return { t: c.innerText.trim(), n: c };
      }
    }

    // Generic: walk up to find text block
    let cur = el;
    while (cur && cur !== document.body) {
      if (cur.style.display === 'none') { cur = cur.parentElement; continue; }
      const txt = (cur.innerText || '').trim();
      if (VALID_TAGS.test(cur.tagName) && txt.length > 0 && txt.length < 5000) {
        if (cur.tagName === 'DIV' && txt.length > 500 && cur.children.length > 5) { cur = cur.parentElement; continue; }
        return { t: txt, n: cur };
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function hit(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.closest('.ilt-trans-container')) continue;
      if (isReddit && el.tagName === 'A' && el.classList.contains('absolute')) continue;
      const b = getBlock(el);
      if (b) return b;
    }
    return null;
  }

  /* ================= TRANSLATION ================= */
  const cache = new Map();
  const JUNK = /[\s\d\p{P}\p{S}\p{M}\p{C}\u200B-\u200D\uFEFF]/gu;
  const hasMeaningful = txt => txt.replace(JUNK, '').length > 0;
  const cleanJunk = txt => txt.replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gmu, '').replace(/\n{3,}/g, '\n\n').trim();
  const parseGT = r => r[0].map(x => x[0]).join('');

  async function trans(txt, node) {
    // Toggle: remove existing translation
    if (node.nextElementSibling?.classList.contains('ilt-trans-container')) {
      node.nextElementSibling.remove();
      return;
    }
    // Skip: toàn ký tự vô nghĩa
    if (!hasMeaningful(txt)) return;
    // Dedupe
    if (Date.now() - (cache.get(txt) || 0) < cfg.dedupeSeconds * 1000) return;
    cache.set(txt, Date.now());

    const w = document.createElement('div');
    w.className = 'ilt-trans-container';
    w.innerHTML = `<div class="ilt-trans"><div class="ilt-meta">...</div></div>`;
    node.parentNode.insertBefore(w, node.nextSibling);

    try {
      let res;
      if (cfg.provider === 'gemini' && cfg.geminiKey) {
        const lang = /[àáảãạăằắẳẵặâầấẩẫậ]/.test(txt) ? 'English' : 'Vietnamese';
        res = await new Promise((ok, err) => GM_xmlhttpRequest({
          method: 'POST',
          url: `https://generativelanguage.googleapis.com/v1beta/models/${cfg.geminiModel}:generateContent?key=${cfg.geminiKey}`,
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ contents: [{ parts: [{ text: `Translate to ${lang}:\n${txt}` }] }] }),
          onload: e => { try { ok(JSON.parse(e.responseText).candidates[0].content.parts[0].text.trim()); } catch (x) { err(x); } },
          onerror: err
        }));
      } else {
        const gtUrl = tl => `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(txt)}`;
        const gtReq = tl => new Promise(ok => GM_xmlhttpRequest({ method: 'GET', url: gtUrl(tl), onload: e => ok(JSON.parse(e.responseText)) }));
        const r1 = await gtReq('vi');
        res = r1[2] === 'vi' ? parseGT(await gtReq('en')) : parseGT(r1);
      }
      const cleaned = cleanJunk(res);
      if (!cleaned) { w.remove(); return; }
      w.firstChild.innerHTML = `<div class="ilt-txt">${cleaned.replace(/[&<]/g, c => ({ '&': '&amp;', '<': '&lt;' }[c]))}</div>`;
    } catch {
      w.innerText = 'Err';
      setTimeout(() => w.remove(), 2000);
    }
  }

  function act(x, y) {
    const h = hit(x, y);
    if (h) trans(h.t, h.n);
  }

  /* ================= VIDEO SAFE ZONE ================= */
  const inRect = (x, y, el) => { const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
  const inVideoZone = (x, y) =>
    [...document.querySelectorAll('video')].some(v => v.offsetWidth && inRect(x, y, v)) ||
    [...document.querySelectorAll('iframe')].some(f => f.offsetWidth && inRect(x, y, f) && /youtube|vimeo|dailymotion|twitch|facebook.*video|tiktok/i.test(f.src)) ||
    document.elementsFromPoint(x, y).some(el => el.closest?.('video, .html5-video-player, .jwplayer, .vjs-tech, .plyr, .flowplayer'));

  /* ================= INPUT HANDLERS ================= */
  // Mouse position (desktop only)
  let lx = 0, ly = 0;
  if (!('ontouchstart' in window)) {
    document.addEventListener('mousemove', e => { lx = e.clientX; ly = e.clientY; }, { passive: true });
  }

  // Keyboard
  document.addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const k = cfg.hotkey;
    if ((k === 'shift' && e.shiftKey) || (k === 'alt' && e.altKey) || (k === 'ctrl' && e.ctrlKey)) act(lx, ly);
    if (e.shiftKey && e.altKey && e.code === 'KeyX') ui();
  });

  // Swipe (mobile)
  let sx = 0, sy = 0, t0 = 0, sVid = false;

  document.addEventListener('touchstart', e => {
    if (!cfg.swipeEnabled || e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    t0 = Date.now(); sVid = inVideoZone(sx, sy);
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!cfg.swipeEnabled || !sx || Date.now() - t0 > 500) { sx = 0; return; }
    const ex = e.changedTouches[0].clientX, ey = e.changedTouches[0].clientY;
    if (sVid || inVideoZone(ex, ey)) { sx = 0; return; }
    const dx = ex - sx, dy = ey - sy; sx = 0;
    if (Math.abs(dx) > cfg.swipePx && Math.abs(dy) < Math.abs(dx) * cfg.swipeSlopeMax &&
      (cfg.swipeDir === 'both' || (cfg.swipeDir === 'right' && dx > 0) || (cfg.swipeDir === 'left' && dx < 0)))
      act(ex - dx / 2, ey - dy / 2);
  }, { passive: true });

  /* ================= SETTINGS UI ================= */
  function ui() {
    if (document.querySelector('.ilt-panel')) return;

    const p = document.createElement('div');
    p.className = 'ilt-panel';
    p.innerHTML = `
      <h3>Cài đặt Dịch</h3>
      <div class="ilt-row"><label>Mode</label><select id="pm"><option value="google">Google</option><option value="gemini">Gemini</option></select></div>
      <div class="ilt-row"><label>Phím tắt</label><select id="ph"><option value="shift">Shift</option><option value="alt">Alt</option><option value="ctrl">Ctrl</option></select></div>
      <div class="ilt-row"><label>Vuốt</label><select id="ps"><option value="both">Cả hai</option><option value="right">Sang phải</option><option value="left">Sang trái</option><option value="none">Tắt</option></select></div>
      <div class="ilt-row"><label>Cỡ chữ</label><input id="pfs" type="number" step="0.05" min="0.5" max="2" style="width:60px"></div>
      <div class="ilt-row"><label>Màu chữ</label><input id="pc" type="color"></div>
      <div class="ilt-row"><input id="pk" type="password" placeholder="Gemini API Key" style="width:100%"></div>
      <button class="ilt-btn" id="sv">Lưu & Áp dụng</button>
    `;
    document.body.appendChild(p);

    const $ = i => p.querySelector(i);
    $('#pm').value = cfg.provider;
    $('#ph').value = cfg.hotkey;
    $('#ps').value = cfg.swipeEnabled ? cfg.swipeDir : 'none';
    $('#pk').value = cfg.geminiKey;
    $('#pfs').value = cfg.fontScale;
    $('#pc').value = cfg.mutedColor;

    $('#sv').onclick = () => {
      cfg.provider = $('#pm').value;
      cfg.hotkey = $('#ph').value;
      cfg.geminiKey = $('#pk').value;
      cfg.fontScale = parseFloat($('#pfs').value) || 0.95;
      cfg.mutedColor = $('#pc').value;

      const s = $('#ps').value;
      cfg.swipeEnabled = s !== 'none';
      if (s !== 'none') cfg.swipeDir = s;

      save();
      p.remove();
      alert('Đã lưu! Tải lại trang để cập nhật màu và cỡ chữ.');
    };

    p.onclick = e => { if (e.target === p) p.remove(); };
  }

  GM_registerMenuCommand('Settings', ui);
})();

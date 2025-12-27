// ==UserScript==
// @name         Video
// @namespace    https://your.namespace
// @version      2.6.0
// @description  Swipe seek optimized for Chrome mobile
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

/* jshint esversion: 8 */
(function () {
  'use strict';

  /* ─────────────────── UTILITIES ─────────────────── */
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  /* ─────────────────── CONFIG ─────────────────── */
  const STORE = 'VF_FINAL_V2';
  const DEF = {
    swipeLong: 0.3, swipeShort: 0.15, shortThreshold: 200,
    minSwipeDistance: 30, verticalTolerance: 80, diagonalThreshold: 1.5,
    realtimePreview: true, throttle: 15,
    forwardStep: 5, hotkeys: true,
    boost: true, boostLevel: 1, maxBoost: 5,
    noticeFontSize: 14
  };
  const cfg = {};
  Object.keys(DEF).forEach(k => cfg[k] = GM_getValue(`${STORE}:${k}`, DEF[k]));
  const save = (k, v) => { cfg[k] = v; GM_setValue(`${STORE}:${k}`, v); };

  /* ─────────────────── STYLES ─────────────────── */
  GM_addStyle(`
    .vf-notice {
      position: absolute; top: 12px; right: 12px;
      background: rgba(0,0,0,.65); color: #fff;
      padding: 6px 12px; border-radius: 6px;
      z-index: 2147483647; pointer-events: none;
      white-space: nowrap; opacity: 0; transform: scale(.95);
      transition: opacity .2s ease, transform .2s ease;
      font: 500 13px/1 sans-serif; letter-spacing: .3px;
      box-shadow: 0 2px 6px rgba(0,0,0,.25);
      backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
    }
    .vf-notice.show { opacity: 1; transform: scale(1); }
  `);

  /* ─────────────────── VIDEO DETECTION ─────────────────── */
  const getFullscreenEl = () =>
    document.fullscreenElement || document.webkitFullscreenElement || null;

  const getVideo = () => {
    const fs = getFullscreenEl();
    if (fs) {
      if (fs.tagName === 'VIDEO') return fs;
      const v = fs.querySelector('video');
      if (v) return v;
    }
    return [...document.querySelectorAll('video')]
      .find(v => v.offsetWidth && v.offsetHeight) || null;
  };

  const getVideoAtPoint = (x, y) => {
    for (const v of document.querySelectorAll('video')) {
      if (!v.offsetWidth || !v.offsetHeight) continue;
      const r = v.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return v;
    }
    return null;
  };

  /* ─────────────────── SEEK NOTICE ─────────────────── */
  let noticeEl, hideTimer;

  const showSeekNotice = (video, delta) => {
    if (!video) return;
    const fs = getFullscreenEl();
    const container = (fs && (fs === video || fs.contains(video)))
      ? fs : (video.parentElement || document.body);

    if (!noticeEl || !container.contains(noticeEl)) {
      noticeEl?.remove();
      noticeEl = document.createElement('div');
      noticeEl.className = 'vf-notice';
      noticeEl.style.fontSize = cfg.noticeFontSize + 'px';
      if (getComputedStyle(container).position === 'static')
        container.style.position = 'relative';
      container.appendChild(noticeEl);
    }

    noticeEl.textContent = `${delta >= 0 ? '▶ +' : '◀ '}${delta}s`;
    noticeEl.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => noticeEl.classList.remove('show'), 700);
  };

  /* ─────────────────── AUDIO BOOST ─────────────────── */
  let audioCtx;
  const boostMap = new WeakMap();
  const getAudioCtx = () => audioCtx || (audioCtx = new (window.AudioContext || window.webkitAudioContext)());

  const applyBoost = video => {
    if (!cfg.boost || boostMap.has(video)) return;
    try {
      const ctx = getAudioCtx();
      ctx.resume?.();
      const src = ctx.createMediaElementSource(video);
      const gain = ctx.createGain();
      gain.gain.value = clamp(cfg.boostLevel, 1, cfg.maxBoost);
      src.connect(gain).connect(ctx.destination);
      boostMap.set(video, gain);
    } catch { }
  };

  /* ─────────────────── KEYBOARD ─────────────────── */
  document.addEventListener('keydown', e => {
    if (!cfg.hotkeys || ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const v = getVideo();
    if (!v) return;

    switch (e.key) {
      case 'ArrowRight':
        v.currentTime += cfg.forwardStep;
        showSeekNotice(v, cfg.forwardStep);
        break;
      case 'ArrowLeft':
        v.currentTime -= cfg.forwardStep;
        showSeekNotice(v, -cfg.forwardStep);
        break;
      case 'b': case 'B':
        cfg.boostLevel = cfg.boostLevel >= cfg.maxBoost ? 1 : cfg.boostLevel + 1;
        save('boostLevel', cfg.boostLevel);
        applyBoost(v);
        boostMap.get(v)?.gain && (boostMap.get(v).gain.value = cfg.boostLevel);
        break;
    }
  }, true);

  /* ─────────────────── TOUCH SWIPE SEEK ─────────────────── */
  const swipe = { active: false, video: null, startX: 0, startY: 0, startTime: 0, lastUpdate: 0, cancelled: false };

  const calcDelta = (dx, duration) => {
    const effectiveDx = dx > 0 ? dx - cfg.minSwipeDistance : dx + cfg.minSwipeDistance;
    const sens = duration <= cfg.shortThreshold ? cfg.swipeShort : cfg.swipeLong;
    return Math.round(effectiveDx * sens);
  };

  const onTouchStart = e => {
    swipe.active = swipe.cancelled = false;
    swipe.video = null;
    if (e.touches.length !== 1) return;

    const t = e.touches[0];
    const video = getVideoAtPoint(t.clientX, t.clientY);
    if (!video?.duration) return;

    // Safe zone: bottom 15%
    const rect = video.getBoundingClientRect();
    if (t.clientY > rect.bottom - rect.height * 0.15) return;

    Object.assign(swipe, {
      video, active: true,
      startX: t.clientX, startY: t.clientY,
      startTime: video.currentTime, lastUpdate: performance.now()
    });
  };

  const onTouchMove = e => {
    if (!swipe.active || !swipe.video || swipe.cancelled) return;
    if (e.touches.length !== 1) { swipe.cancelled = true; return; }

    const t = e.touches[0];
    const dx = t.clientX - swipe.startX, dy = t.clientY - swipe.startY;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);

    if (absDx < 5 && absDy < 5) return;
    if (absDy > cfg.verticalTolerance || (absDx > 0 && absDx / (absDy + 1) < cfg.diagonalThreshold)) {
      swipe.cancelled = true; return;
    }
    if (absDx < cfg.minSwipeDistance) return;
    if (absDx > absDy) e.preventDefault();

    const delta = calcDelta(dx, swipe.video.duration);
    showSeekNotice(swipe.video, delta);

    if (cfg.realtimePreview) {
      const now = performance.now();
      if (now - swipe.lastUpdate > cfg.throttle) {
        swipe.lastUpdate = now;
        swipe.video.currentTime = clamp(swipe.startTime + delta, 0, swipe.video.duration);
      }
    }
  };

  const onTouchEnd = e => {
    if (!swipe.active || !swipe.video) return;

    if (!swipe.cancelled && e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      const dx = t.clientX - swipe.startX, dy = t.clientY - swipe.startY;
      const absDx = Math.abs(dx), absDy = Math.abs(dy);
      const isValid = absDx > absDy && absDx / (absDy + 1) >= cfg.diagonalThreshold
        && absDx >= cfg.minSwipeDistance && absDy <= cfg.verticalTolerance;

      if (isValid) {
        const delta = calcDelta(dx, swipe.video.duration);
        if (!cfg.realtimePreview)
          swipe.video.currentTime = clamp(swipe.startTime + delta, 0, swipe.video.duration);
        showSeekNotice(swipe.video, delta);
      }
    }
    swipe.active = swipe.cancelled = false;
    swipe.video = null;
  };

  document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
  document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: true });

  console.log('🎬 Video Controls: Swipe to Seek');
})();

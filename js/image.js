// ==UserScript==
// @name         Image Downloader
// @namespace    http://tampermonkey.net/
// @description  Extract and batch download images from websites. Supports zip download, auto-enlarge, canvas capture.
// @version      3.0
// @connect      *
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @require      https://unpkg.com/hotkeys-js@3.9.4/dist/hotkeys.min.js
// @require      https://cdn.bootcdn.net/ajax/libs/jszip/3.7.1/jszip.min.js
// @require      https://cdn.bootcdn.net/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js
// @match        *://*/*
// @run-at       document-end
// @license      GPLv3
// ==/UserScript==

(function () {
    'use strict';

    // ==================== CONFIG ====================
    const CONFIG = {
        shortcut: GM_getValue("shortcut") || "alt+W",
        minSize: { width: 0, height: 0 },
        maxSize: { width: 9999, height: 9999 }
    };

    // ==================== LANG ====================
    const LANG = {
        selectAll: "Select All", download: "Download", zipDownload: "ZIP",
        close: "✕", selected: "Selected", total: "images", extraGrab: "Extra Grab",
        moreSetting: "Settings", fold: "Fold", noSelect: "Please select at least one image"
    };

    // ==================== AUTO BIG IMAGE RULES ====================
    const BIG_IMAGE_RULES = [
        { reg: /(?<=sinaimg\.(?:cn|com)\/)([\w.]+)(?=\/)/i, rep: "large" },
        { reg: /(?<=alicdn\.(?:cn|com)\/.+\.(jpg|jpeg|gif|png|webp))_.+/i, rep: "" },
        { reg: /(.+alicdn\.(?:cn|com)\/.+)(\.\d+x\d+)(\.(jpg|jpeg|gif|png|webp)).*/i, rep: (m, p1, p2, p3) => p1 + p3 },
        { reg: /(?<=360buyimg\.(?:cn|com)\/)(\w+\/)(?=.+\.(jpg|jpeg|gif|png|webp))/i, rep: "n0/" },
        { reg: /(?<=hdslb\.(?:cn|com)\/.+\.(jpg|jpeg|gif|png|webp))@.+/i, rep: "" },
        { reg: /th(\.wallhaven\.cc\/)(?!full).+\/(\w{2}\/)([\w.]+)(\.jpg)/i, rep: (m, p1, p2, p3) => "w" + p1 + "full/" + p2 + "wallhaven-" + p3 + ".jpg" },
        { reg: /(.*\.twimg\.\w+\/.+&name=*)(.*)/i, rep: (m, p1) => p1 + "orig" },
        { reg: /(.*wordpress\.com.*)(\?w=\d+)$/i, rep: "$1" }
    ];

    // ==================== STYLES ====================
    const STYLES = `
        .imgdl-overlay{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.95);font-family:system-ui,-apple-system,sans-serif;color:#fff;display:flex;flex-direction:column}
        .imgdl-header{padding:12px 20px;background:rgba(255,255,255,.05);backdrop-filter:blur(10px);display:flex;flex-direction:column;gap:10px;border-bottom:1px solid rgba(255,255,255,.1)}
        .imgdl-header-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
        .imgdl-btn{padding:8px 16px;border:none;border-radius:6px;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;font-size:13px;transition:all .2s}
        .imgdl-btn:hover{background:rgba(255,255,255,.2)}
        .imgdl-btn.primary{background:#3b82f6}
        .imgdl-btn.primary:hover{background:#2563eb}
        .imgdl-btn.close{width:36px;height:36px;padding:0;border-radius:50%;font-size:18px;margin-left:auto}
        .imgdl-checkbox{width:18px;height:18px;accent-color:#3b82f6;cursor:pointer;flex-shrink:0}
        .imgdl-info{color:rgba(255,255,255,.6);font-size:13px;white-space:nowrap}
        .imgdl-input{padding:6px 10px;border:1px solid rgba(255,255,255,.2);border-radius:6px;background:rgba(255,255,255,.05);color:#fff;font-size:13px;width:100px}
        .imgdl-input:focus{outline:none;border-color:#3b82f6}
        .imgdl-input.pixel{width:70px;text-align:center}
        .imgdl-grid{flex:1;overflow:auto;padding:20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));grid-auto-rows:180px;gap:16px;align-content:start}
        .imgdl-item{position:relative;border-radius:8px;overflow:hidden;background:rgba(255,255,255,.05);cursor:pointer;transition:all .2s;width:100%;height:100%}
        .imgdl-item:hover{transform:scale(1.02);box-shadow:0 8px 32px rgba(0,0,0,.3)}
        .imgdl-item.selected{outline:3px solid #3b82f6;outline-offset:-3px}
        .imgdl-item img{width:100%;height:100%;object-fit:cover;display:block}
        .imgdl-item-info{position:absolute;bottom:0;left:0;right:0;padding:8px;background:linear-gradient(transparent,rgba(0,0,0,.8));font-size:11px;color:rgba(255,255,255,.8);display:flex;justify-content:space-between;align-items:center}
        .imgdl-item-actions{display:flex;gap:6px}
        .imgdl-item-btn{width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.2);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s}
        .imgdl-item-btn:hover{background:rgba(255,255,255,.4)}
        .imgdl-preview{position:fixed;inset:0;z-index:2147483648;background:rgba(0,0,0,.95);display:flex;align-items:center;justify-content:center;cursor:zoom-out}
        .imgdl-preview img{max-width:95%;max-height:95%;object-fit:contain}
        .imgdl-filters{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
        .imgdl-filter-group{display:flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(255,255,255,.05);border-radius:6px}
        .imgdl-filter-group span{white-space:nowrap}
    `;

    // ==================== STATE ====================
    let preImgSrcs = [];
    let state = { images: [], selected: new Set(), zipData: [] };

    // ==================== INIT ====================
    GM_registerMenuCommand(LANG.download + " (Alt+W)", openPanel);
    hotkeys(CONFIG.shortcut, openPanel);

    if (GM_getValue("extraGrab")) initExtraGrab();

    function initExtraGrab() {
        const origSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
            get() { return origSrc.get.call(this); },
            set(v) { if (!preImgSrcs.includes(v)) preImgSrcs.push(v); origSrc.set.call(this, v); }
        });
    }

    // ==================== EXTRACT IMAGES ====================
    function extractImages() {
        const urls = new Set();

        // From img tags - prioritize largest from srcset
        document.querySelectorAll('img').forEach(img => {
            if (img.srcset) {
                const largest = img.srcset.split(',')
                    .map(s => s.trim().split(/\s+/))
                    .sort((a, b) => parseInt(b[1] || 0) - parseInt(a[1] || 0))[0];
                if (largest) urls.add(largest[0]);
            }
            if (img.src) urls.add(img.src);
        });

        // From pre-captured srcs
        preImgSrcs.forEach(s => urls.add(s));

        // From background-image
        const bgMatches = document.body.innerHTML.match(/background-image:\s*url\(([^)]+)\)/gi) || [];
        bgMatches.forEach(m => {
            const url = m.match(/url\(["']?([^"')]+)/)?.[1];
            if (url) urls.add(url.replace(/&quot;/g, ''));
        });

        // Apply big image rules
        const result = new Set();
        urls.forEach(url => {
            if (url.includes("data:image/")) { result.add(url); return; }
            result.add(url);
            BIG_IMAGE_RULES.forEach(rule => {
                const big = url.replace(rule.reg, rule.rep);
                if (big !== url) result.add(big);
            });
        });

        return Array.from(result).filter(u => u && !u.startsWith('data:image/svg'));
    }

    // ==================== UI ====================
    function openPanel() {
        document.querySelector('.imgdl-overlay')?.remove();
        state = { images: extractImages(), selected: new Set(), zipData: [] };

        const overlay = document.createElement('div');
        overlay.className = 'imgdl-overlay';
        overlay.innerHTML = `
            <style>${STYLES}</style>
            <div class="imgdl-header">
                <div class="imgdl-header-row">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                        <input type="checkbox" class="imgdl-checkbox" id="imgdl-selectall">
                        <span>${LANG.selectAll}</span>
                    </label>
                    <button class="imgdl-btn primary" id="imgdl-download">${LANG.download}</button>
                    <button class="imgdl-btn" id="imgdl-zip">${LANG.zipDownload}</button>
                    <span class="imgdl-info" id="imgdl-count">${LANG.selected}: 0 / ${state.images.length} ${LANG.total}</span>
                    <input type="text" class="imgdl-input" id="imgdl-filename" value="${location.hostname.split('.').slice(-2, -1)[0]}_${Date.now().toString().slice(-6)}" placeholder="Filename" style="width:160px">
                    <button class="imgdl-btn close" id="imgdl-close">${LANG.close}</button>
                </div>
                <div class="imgdl-header-row">
                    <div class="imgdl-filters">
                        <div class="imgdl-filter-group">
                            <input type="checkbox" class="imgdl-checkbox" id="imgdl-wfilter">
                            <span>W:</span>
                            <input type="number" class="imgdl-input pixel" id="imgdl-wmin" value="0">
                            <span>-</span>
                            <input type="number" class="imgdl-input pixel" id="imgdl-wmax" value="9999">
                        </div>
                        <div class="imgdl-filter-group">
                            <input type="checkbox" class="imgdl-checkbox" id="imgdl-hfilter">
                            <span>H:</span>
                            <input type="number" class="imgdl-input pixel" id="imgdl-hmin" value="0">
                            <span>-</span>
                            <input type="number" class="imgdl-input pixel" id="imgdl-hmax" value="9999">
                        </div>
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                            <input type="checkbox" class="imgdl-checkbox" id="imgdl-extra" ${GM_getValue("extraGrab") ? "checked" : ""}>
                            <span>${LANG.extraGrab}</span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="imgdl-grid" id="imgdl-grid"></div>
        `;
        document.body.appendChild(overlay);

        renderImages();
        bindEvents(overlay);
        fetchBase64();
    }

    function renderImages() {
        const grid = document.getElementById('imgdl-grid');
        grid.innerHTML = state.images.map((url, i) => `
            <div class="imgdl-item" data-index="${i}">
                <img src="${url}" loading="lazy" onerror="this.parentElement.style.display='none'">
                <div class="imgdl-item-info">
                    <span class="imgdl-size"></span>
                    <div class="imgdl-item-actions">
                        <button class="imgdl-item-btn imgdl-view" title="View">🔍</button>
                        <button class="imgdl-item-btn imgdl-dl" title="Download">⬇</button>
                    </div>
                </div>
            </div>
        `).join('');

        // Get natural sizes
        grid.querySelectorAll('.imgdl-item img').forEach(img => {
            img.onload = () => {
                const size = img.closest('.imgdl-item').querySelector('.imgdl-size');
                size.textContent = `${img.naturalWidth}×${img.naturalHeight}`;
            };
        });
    }

    function bindEvents(overlay) {
        const $ = s => overlay.querySelector(s);
        const updateCount = () => $('#imgdl-count').textContent = `${LANG.selected}: ${state.selected.size} / ${state.images.length} ${LANG.total}`;

        // Close
        $('#imgdl-close').onclick = () => overlay.remove();
        overlay.addEventListener('keydown', e => {
            if (e.key === 'Escape' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) overlay.remove();
        });

        // Select all
        $('#imgdl-selectall').onchange = e => {
            state.selected = e.target.checked ? new Set(state.images.map((_, i) => i)) : new Set();
            overlay.querySelectorAll('.imgdl-item').forEach((el, i) => el.classList.toggle('selected', state.selected.has(i)));
            updateCount();
        };

        // Grid clicks
        $('#imgdl-grid').onclick = e => {
            const item = e.target.closest('.imgdl-item');
            if (!item) return;
            const i = parseInt(item.dataset.index);

            if (e.target.closest('.imgdl-view')) {
                showPreview(state.images[i]);
            } else if (e.target.closest('.imgdl-dl')) {
                saveAs(state.images[i], `${$('#imgdl-filename').value}_${i}`);
            } else {
                state.selected.has(i) ? state.selected.delete(i) : state.selected.add(i);
                item.classList.toggle('selected');
                updateCount();
            }
        };

        // Download
        $('#imgdl-download').onclick = async () => {
            if (!state.selected.size) return alert(LANG.noSelect);
            const name = $('#imgdl-filename').value || 'img';
            let idx = 0;
            for (const i of state.selected) {
                await new Promise(r => setTimeout(r, 200));
                saveAs(state.images[i], `${name}_${idx++}`);
            }
        };

        // Zip download
        $('#imgdl-zip').onclick = () => {
            if (!state.selected.size) return alert(LANG.noSelect);
            const zip = new JSZip();
            const folder = zip.folder('images');
            const name = $('#imgdl-filename').value || 'img';
            let idx = 0;
            state.selected.forEach(i => {
                const data = state.zipData[i];
                if (data?.startsWith('data:image')) {
                    const ext = data.match(/data:image\/(\w+)/)?.[1] || 'jpg';
                    folder.file(`${name}_${idx++}.${ext}`, data.split(',')[1], { base64: true });
                }
            });
            zip.generateAsync({ type: 'blob' }).then(blob => saveAs(blob, `${name}.zip`));
        };

        // Extra grab toggle
        $('#imgdl-extra').onchange = e => GM_setValue('extraGrab', e.target.checked);

        // Filters
        const applyFilters = () => {
            const wFilter = $('#imgdl-wfilter').checked;
            const hFilter = $('#imgdl-hfilter').checked;
            const wMin = +$('#imgdl-wmin').value, wMax = +$('#imgdl-wmax').value;
            const hMin = +$('#imgdl-hmin').value, hMax = +$('#imgdl-hmax').value;

            overlay.querySelectorAll('.imgdl-item').forEach(el => {
                const img = el.querySelector('img');
                const w = img.naturalWidth, h = img.naturalHeight;
                const show = (!wFilter || (w >= wMin && w <= wMax)) && (!hFilter || (h >= hMin && h <= hMax));
                el.style.display = show ? '' : 'none';
            });
        };
        ['#imgdl-wfilter', '#imgdl-hfilter', '#imgdl-wmin', '#imgdl-wmax', '#imgdl-hmin', '#imgdl-hmax'].forEach(s => {
            $(s).onchange = applyFilters;
            $(s).oninput = applyFilters;
        });
    }

    function showPreview(url) {
        const preview = document.createElement('div');
        preview.className = 'imgdl-preview';
        preview.innerHTML = `<img src="${url}">`;
        preview.onclick = () => preview.remove();
        document.body.appendChild(preview);
    }

    function fetchBase64() {
        state.images.forEach((url, i) => {
            if (url.includes('data:image')) { state.zipData[i] = url; return; }
            try {
                GM_xmlhttpRequest({
                    method: 'GET', url, responseType: 'blob',
                    headers: { referer: location.origin + '/' },
                    onload: r => {
                        const reader = new FileReader();
                        reader.onloadend = e => {
                            if (e.target.result?.startsWith('data:image')) state.zipData[i] = e.target.result;
                        };
                        reader.readAsDataURL(r.response);
                    }
                });
            } catch { }
        });
    }
})();
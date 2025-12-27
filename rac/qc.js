// ==UserScript==
// @name         Anti-Fake Ad Link Blocker
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Phát hiện và đóng tab quảng cáo giả khi click
// @author       You
// @match        *://*/*
// @grant        window.close
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // Danh sách các pattern nhận diện link quảng cáo
    const AD_PATTERNS = [
        // Domain quảng cáo phổ biến
        /doubleclick\.net/i,
        /googlesyndication\.com/i,
        /googleadservices\.com/i,
        /adclick/i,
        /adserver/i,
        /adsense/i,
        /advert/i,
        /banner/i,
        /popup/i,
        /popunder/i,
        /tracker/i,
        /track\.php/i,
        /click\.php/i,
        /out\.php/i,
        /go\.php/i,
        /redirect/i,
        /redir/i,
        /aff[_-]?id/i,
        /affiliate/i,
        /ads\./i,
        /ad\./i,
        /adserv/i,
        /click[0-9]+/i,
        /clickad/i,
        /adzone/i,
        /adrotate/i,
        /exoclick/i,
        /trafficjunky/i,
        /propellerads/i,
        /adsterra/i,
        /popcash/i,
        /popads/i,
        /juicyads/i,
        /clickadu/i,
        /admaven/i,
        /adcash/i,
        /bidvertiser/i,
        /infolinks/i,
        /revcontent/i,
        /mgid\.com/i,
        /taboola/i,
        /outbrain/i,
        /zergnet/i,
        /content\.ad/i,
        /adf\.ly/i,
        /bit\.ly.*\/ad/i,
        /shorte\.st/i,
        /bc\.vc/i,
        /ouo\.io/i,
        /linkvertise/i,
        /shrinkme/i,
        /za\.gl/i
    ];

    // Các thuộc tính đáng ngờ của link
    const SUSPICIOUS_ATTRS = [
        'onclick',
        'onmousedown',
        'data-ad',
        'data-click',
        'data-tracking'
    ];

    // Các class/id thường thấy ở quảng cáo
    const AD_SELECTORS = [
        '[class*="ad-"]',
        '[class*="-ad"]',
        '[class*="ads-"]',
        '[class*="-ads"]',
        '[class*="advert"]',
        '[class*="sponsor"]',
        '[class*="banner"]',
        '[id*="ad-"]',
        '[id*="-ad"]',
        '[id*="ads-"]',
        '[id*="banner"]',
        'ins.adsbygoogle',
        'iframe[src*="ad"]'
    ];

    // Lưu trữ thông tin click hợp lệ
    let lastValidClick = {
        time: 0,
        target: null,
        href: null
    };

    // Kiểm tra xem URL có phải là quảng cáo không
    function isAdUrl(url) {
        if (!url) return false;
        try {
            const urlObj = new URL(url, window.location.origin);
            const fullUrl = urlObj.href.toLowerCase();

            // Kiểm tra theo pattern
            for (const pattern of AD_PATTERNS) {
                if (pattern.test(fullUrl)) {
                    console.log('[AdBlocker] Phát hiện URL quảng cáo:', url);
                    return true;
                }
            }

            // Kiểm tra URL có chứa nhiều redirect
            if ((fullUrl.match(/http/g) || []).length > 1) {
                console.log('[AdBlocker] URL chứa nhiều redirect:', url);
                return true;
            }

            // Kiểm tra URL rút gọn đáng ngờ
            if (urlObj.pathname.length < 10 && /^[a-zA-Z0-9]+$/.test(urlObj.pathname.slice(1))) {
                const suspiciousDomains = ['bit.ly', 'goo.gl', 't.co', 'tinyurl', 'ow.ly', 'is.gd', 'v.gd'];
                if (suspiciousDomains.some(d => fullUrl.includes(d))) {
                    console.log('[AdBlocker] URL rút gọn đáng ngờ:', url);
                    return true;
                }
            }
        } catch (e) {
            // URL không hợp lệ
        }
        return false;
    }

    // Kiểm tra element có phải là quảng cáo không
    function isAdElement(element) {
        if (!element) return false;

        // Kiểm tra element hoặc parent có match với ad selectors
        let current = element;
        let depth = 0;
        while (current && depth < 10) {
            // Kiểm tra class/id
            const className = (current.className || '').toLowerCase();
            const id = (current.id || '').toLowerCase();

            if (/\b(ad|ads|advert|sponsor|banner|promo)\b/.test(className) ||
                /\b(ad|ads|advert|sponsor|banner|promo)\b/.test(id)) {
                console.log('[AdBlocker] Element quảng cáo được phát hiện qua class/id');
                return true;
            }

            // Kiểm tra thuộc tính đáng ngờ
            for (const attr of SUSPICIOUS_ATTRS) {
                if (current.hasAttribute && current.hasAttribute(attr)) {
                    const value = current.getAttribute(attr);
                    if (value && AD_PATTERNS.some(p => p.test(value))) {
                        console.log('[AdBlocker] Element có thuộc tính đáng ngờ:', attr);
                        return true;
                    }
                }
            }

            current = current.parentElement;
            depth++;
        }

        return false;
    }

    // Kiểm tra click có hợp lệ không
    function isValidClick(event) {
        const target = event.target;

        // Tìm link gần nhất
        let link = target.closest('a');
        if (!link) return true; // Không phải click vào link

        const href = link.href;

        // Kiểm tra URL
        if (isAdUrl(href)) {
            return false;
        }

        // Kiểm tra element
        if (isAdElement(link)) {
            return false;
        }

        // Kiểm tra target="_blank" kết hợp với các dấu hiệu đáng ngờ
        if (link.target === '_blank') {
            // Kiểm tra nếu href khác với domain hiện tại và có dấu hiệu đáng ngờ
            try {
                const linkDomain = new URL(href).hostname;
                const currentDomain = window.location.hostname;

                // Nếu khác domain và có thuộc tính đáng ngờ
                if (linkDomain !== currentDomain) {
                    for (const attr of SUSPICIOUS_ATTRS) {
                        if (link.hasAttribute(attr)) {
                            console.log('[AdBlocker] Link target="_blank" có thuộc tính đáng ngờ');
                            return false;
                        }
                    }
                }
            } catch (e) { }
        }

        // Lưu click hợp lệ
        lastValidClick = {
            time: Date.now(),
            target: target,
            href: href
        };

        return true;
    }

    // Xử lý click event
    function handleClick(event) {
        if (!isValidClick(event)) {
            console.log('[AdBlocker] Chặn click quảng cáo');
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return false;
        }
    }

    // Chặn window.open từ quảng cáo
    const originalWindowOpen = window.open;
    window.open = function (url, target, features) {
        // Kiểm tra nếu có click hợp lệ gần đây (trong 1 giây)
        const timeSinceClick = Date.now() - lastValidClick.time;

        if (timeSinceClick > 1000) {
            // Không có click gần đây, có thể là popup tự động
            console.log('[AdBlocker] Chặn popup tự động:', url);
            return null;
        }

        if (isAdUrl(url)) {
            console.log('[AdBlocker] Chặn window.open quảng cáo:', url);
            return null;
        }

        return originalWindowOpen.call(this, url, target, features);
    };

    // Theo dõi các tab mới được mở
    let openedWindows = [];

    // Ghi đè window.open để theo dõi
    const trackingWindowOpen = window.open;
    window.open = function (url, target, features) {
        const newWindow = trackingWindowOpen.call(this, url, target, features);

        if (newWindow && isAdUrl(url)) {
            // Đóng tab quảng cáo ngay lập tức
            setTimeout(() => {
                try {
                    newWindow.close();
                    console.log('[AdBlocker] Đã đóng tab quảng cáo:', url);
                } catch (e) {
                    console.log('[AdBlocker] Không thể đóng tab:', e);
                }
            }, 100);
        }

        return newWindow;
    };

    // Theo dõi navigation để đóng tab nếu là quảng cáo
    if (window.opener) {
        // Đây là tab được mở từ tab khác
        const currentUrl = window.location.href;

        if (isAdUrl(currentUrl)) {
            console.log('[AdBlocker] Tab hiện tại là quảng cáo, đang đóng...');
            window.close();

            // Nếu không thể đóng, hiển thị thông báo
            if (!window.closed) {
                document.body.innerHTML = `
                    <div style="
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: #1a1a2e;
                        color: #eee;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        font-family: Arial, sans-serif;
                        z-index: 999999;
                    ">
                        <h1 style="color: #e94560;">⚠️ Đã phát hiện quảng cáo</h1>
                        <p>Tab này đã bị chặn vì là link quảng cáo.</p>
                        <button onclick="window.close()" style="
                            padding: 10px 30px;
                            font-size: 16px;
                            background: #e94560;
                            color: white;
                            border: none;
                            border-radius: 5px;
                            cursor: pointer;
                            margin-top: 20px;
                        ">Đóng tab này</button>
                    </div>
                `;
            }
        }
    }

    // Thêm event listener
    document.addEventListener('click', handleClick, true);
    document.addEventListener('mousedown', handleClick, true);

    // Chặn các sự kiện touch trên mobile
    document.addEventListener('touchstart', handleClick, true);

    // Theo dõi các thay đổi DOM để phát hiện quảng cáo mới
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) { // Element node
                    // Kiểm tra nếu là iframe quảng cáo
                    if (node.tagName === 'IFRAME') {
                        const src = node.src || '';
                        if (isAdUrl(src)) {
                            console.log('[AdBlocker] Xóa iframe quảng cáo:', src);
                            node.remove();
                        }
                    }

                    // Kiểm tra các link quảng cáo
                    const links = node.querySelectorAll?.('a') || [];
                    for (const link of links) {
                        if (isAdUrl(link.href)) {
                            link.addEventListener('click', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('[AdBlocker] Chặn click vào link quảng cáo');
                            }, true);
                        }
                    }
                }
            }
        }
    });

    // Bắt đầu theo dõi DOM khi document sẵn sàng
    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    console.log('[AdBlocker] Script đã được kích hoạt');
})();

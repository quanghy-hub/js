// ==UserScript==
// @name         Trusted Types Policy
// @namespace    trusted-types-bypass
// @version      2.0.0
// @description  Creates default Trusted Types policy for all websites with CSP
// @match        *://*/*
// @grant        none
// @inject-into  page
// @run-at       document-start
// ==/UserScript==

(() => {
    'use strict';

    // Kiểm tra browser hỗ trợ Trusted Types
    if (typeof trustedTypes === 'undefined') return;

    // Kiểm tra đã có default policy chưa
    if (trustedTypes.defaultPolicy) return;

    try {
        trustedTypes.createPolicy('default', {
            createHTML: (input) => input,
            createScriptURL: (input) => input,
            createScript: (input) => input
        });
    } catch (e) {
        // CSP có thể chặn việc tạo policy
    }
})();

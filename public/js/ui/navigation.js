(function (global) {
    'use strict';

    function ensureCanonicalUiStyle() {
        if (document.querySelector('link[data-canonical-ui]')) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = './css/canonical-ui.css?v=20260823-phase5';
        link.dataset.canonicalUi = '1';
        document.head.appendChild(link);
    }

    function ensureAccessibleNames() {
        const email = document.getElementById('email');
        if (email && !email.getAttribute('aria-label') && !email.getAttribute('aria-labelledby')) {
            email.setAttribute('aria-label', 'E-mail');
        }

        const password = document.getElementById('password');
        if (password && !password.getAttribute('aria-label') && !password.getAttribute('aria-labelledby')) {
            password.setAttribute('aria-label', 'Senha');
        }
    }

    function ensurePerformanceLoader() {
        if (global.AppPerformanceLoader || document.querySelector('script[data-performance-loader]')) return;
        const script = document.createElement('script');
        script.src = './js/performance-loader.js';
        script.defer = true;
        script.dataset.performanceLoader = '1';
        script.onerror = () => console.warn('Não foi possível carregar o otimizador de performance.');
        document.head.appendChild(script);
    }

    function findDesktopTabButton(tabId) {
        return [...document.querySelectorAll('.nav-tabs .tab-btn')]
            .find(btn => (btn.getAttribute('onclick') || '').includes(`'${tabId}'`));
    }

    function syncMobileNav(tabId) {
        document.querySelectorAll('.mobile-nav-btn[data-tab]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
    }

    function navigateTo(tabId, options = {}) {
        const desktopBtn = options.desktopButton || findDesktopTabButton(tabId);
        if (typeof global.switchTab === 'function') {
            global.switchTab(tabId, desktopBtn || null);
        }
        syncMobileNav(tabId);
        if (typeof global.updateContextFab === 'function') global.updateContextFab(tabId);
        return !!document.getElementById(tabId);
    }

    function mobileSwitchTab(tabId) {
        return navigateTo(tabId);
    }

    global.AppNavigation = Object.freeze({
        findDesktopTabButton,
        syncMobileNav,
        navigateTo,
        mobileSwitchTab
    });

    ensureCanonicalUiStyle();
    ensureAccessibleNames();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ensureAccessibleNames();
            ensurePerformanceLoader();
        }, { once: true });
    } else {
        ensurePerformanceLoader();
    }
})(window);

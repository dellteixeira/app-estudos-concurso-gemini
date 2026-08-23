(function (global) {
    'use strict';

    function ensureRetentionMetricLayoutStyle() {
        if (!document.querySelector('link[data-retention-metrics-fix]')) {
            const retentionLink = document.createElement('link');
            retentionLink.rel = 'stylesheet';
            retentionLink.href = './css/retention-metrics-fix.css?v=20260823-final3';
            retentionLink.dataset.retentionMetricsFix = '1';
            document.head.appendChild(retentionLink);
        }

        if (!document.querySelector('link[data-ui-text-safety]')) {
            const safetyLink = document.createElement('link');
            safetyLink.rel = 'stylesheet';
            safetyLink.href = './css/ui-text-safety.css?v=20260823-final3';
            safetyLink.dataset.uiTextSafety = '1';
            document.head.appendChild(safetyLink);
        }

        if (!document.querySelector('link[data-accessibility-baseline]')) {
            const accessibilityLink = document.createElement('link');
            accessibilityLink.rel = 'stylesheet';
            accessibilityLink.href = './css/accessibility-baseline.css?v=20260823-phase4';
            accessibilityLink.dataset.accessibilityBaseline = '1';
            document.head.appendChild(accessibilityLink);
        }
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

    ensureRetentionMetricLayoutStyle();
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

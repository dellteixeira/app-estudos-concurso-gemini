(function (global) {
    'use strict';

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

    // Compatibility API used by existing inline handlers and legacy modules.
    global.findDesktopTabButton = findDesktopTabButton;
    global.mobileSwitchTab = mobileSwitchTab;
})(window);

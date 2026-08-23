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

    function callGlobal(name, ...args) {
        const fn = global[name];
        if (typeof fn !== 'function') {
            console.warn(`Ação indisponível: ${name}`);
            return undefined;
        }
        return fn(...args);
    }

    function findDesktopTabButton(tabId) {
        return [...document.querySelectorAll('.nav-tabs .tab-btn[data-tab]')]
            .find(btn => btn.dataset.tab === tabId) || null;
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

    const actionHandlers = Object.freeze({
        'pwa-update': () => callGlobal('applyPwaUpdate'),
        'pwa-install': () => callGlobal('installPwaApp'),
        'pwa-dismiss': () => callGlobal('dismissPwaBanner'),
        'auth-login': () => callGlobal('handleLogin'),
        'auth-signup': () => callGlobal('handleSignUp'),
        'toggle-modern-tools': () => callGlobal('toggleModernTools'),
        'new-concurso': () => callGlobal('openModalNovoConcurso'),
        'rename-concurso': () => callGlobal('renomearConcursoAtual'),
        'delete-concurso': element => callGlobal('removerConcursoAtual', element),
        'open-account': () => callGlobal('openAccountModal'),
        'toggle-theme': () => callGlobal('toggleDarkMode'),
        'logout': () => callGlobal('handleLogout'),
        'global-search': () => callGlobal('openGlobalSearchModal'),
        'switch-tab': element => navigateTo(element.dataset.tab, { desktopButton: element }),
        'opportunity-study': () => callGlobal('openOpportunityStudyModal'),
        'edit-exam-date': () => callGlobal('editarDataProva'),
        'retention-details': element => callGlobal('openRetentionMetricDetails', element.dataset.metric),
        'retention-more': () => callGlobal('openRetentionMoreModal')
    });

    function installDelegatedActions() {
        if (document.documentElement.dataset.inlineActionDelegation === '1') return;
        document.documentElement.dataset.inlineActionDelegation = '1';

        document.addEventListener('click', event => {
            const element = event.target.closest('[data-action]');
            if (!element) return;
            const handler = actionHandlers[element.dataset.action];
            if (!handler) return;
            handler(element, event);
        });

        document.addEventListener('change', event => {
            const element = event.target.closest('[data-change-action]');
            if (!element) return;
            if (element.dataset.changeAction === 'change-concurso') {
                callGlobal('changeConcurso', element.value);
            }
        });
    }

    global.AppNavigation = Object.freeze({
        findDesktopTabButton,
        syncMobileNav,
        navigateTo,
        mobileSwitchTab
    });

    ensureCanonicalUiStyle();
    ensureAccessibleNames();
    installDelegatedActions();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ensureAccessibleNames();
            ensurePerformanceLoader();
        }, { once: true });
    } else {
        ensurePerformanceLoader();
    }
})(window);

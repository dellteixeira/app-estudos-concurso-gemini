(function (global) {
    'use strict';

    const CORE_VERSION = '10.64.43';
    let coreRuntimePromise = null;

    function ensureCanonicalUiStyle() {
        if (!document.querySelector('link[data-canonical-ui]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = './css/canonical-ui.css?v=20260823-phase5';
            link.dataset.canonicalUi = '1';
            document.head.appendChild(link);
        }
        if (!document.querySelector('link[data-responsive-polish]')) {
            const polish = document.createElement('link');
            polish.rel = 'stylesheet';
            polish.href = './css/responsive-polish-v10.64.43.css?v=10.64.43';
            polish.dataset.responsivePolish = '1';
            document.head.appendChild(polish);
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

    function appendCoreScript(src, datasetKey) {
        return new Promise((resolve, reject) => {
            const existing = [...document.scripts].find(script => script.src && script.src.includes(src));
            if (existing) {
                if (datasetKey) existing.dataset[datasetKey] = '1';
                if (existing.dataset.loaded === 'true' || existing.readyState === 'complete') {
                    resolve(existing);
                    return;
                }
                existing.addEventListener('load', () => resolve(existing), { once: true });
                existing.addEventListener('error', reject, { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = `${src}?v=${CORE_VERSION}`;
            script.defer = true;
            if (datasetKey) script.dataset[datasetKey] = '1';
            script.addEventListener('load', () => {
                script.dataset.loaded = 'true';
                resolve(script);
            }, { once: true });
            script.addEventListener('error', () => reject(new Error(`Falha ao carregar ${src}`)), { once: true });
            document.head.appendChild(script);
        });
    }

    function ensureCoreRuntime() {
        if (coreRuntimePromise) return coreRuntimePromise;
        coreRuntimePromise = (async () => {
            if (!global.AppAssetLoader) {
                await appendCoreScript('./js/core/asset-loader.js', 'assetLoader');
            }

            const loader = global.AppAssetLoader;
            if (!loader) throw new Error('AppAssetLoader indisponível após bootstrap.');

            if (!global.AppCognitiveProfile) {
                await loader.loadScript('./js/core/cognitive-profile.js', { async: false });
            }
            if (!global.AppCognitiveDataSource) {
                await loader.loadScript('./js/core/cognitive-profile-source.js', { async: false });
            }
            if (!global.AppInterventionEffectiveness) {
                await loader.loadScript('./js/core/intervention-effectiveness.js', { async: false });
            }
            if (!global.AppErrorIntelligence) {
                await loader.loadScript('./js/core/error-intelligence.js', { async: false });
            }
            if (!global.AppExamBoardIntelligence) {
                await loader.loadScript('./js/core/exam-board-intelligence.js', { async: false });
            }
            if (!global.AppNextBestStudyAction) {
                await loader.loadScript('./js/core/next-best-study-action.js', { async: false });
            }
            if (!global.AppContextualAiTutor) {
                await loader.loadScript('./js/core/contextual-ai-tutor.js', { async: false });
            }
            if (!global.AppStudyNowCommandCenter) {
                await loader.loadScript('./js/core/study-now-command-center.js', { async: false });
            }
            if (!global.AppCognitiveProfileRuntime) {
                await loader.loadScript('./js/core/cognitive-profile-runtime.js', { async: false });
            }
            if (!global.AppStudyUxPhase) {
                await loader.loadScript('./js/ui/study-ux-phase.js', { async: false });
            }
            if (!global.AppTodayBestAction) {
                await loader.loadScript('./js/ui/today-best-action.js', { async: false });
            }
            return loader;
        })().catch(error => {
            coreRuntimePromise = null;
            console.warn('Não foi possível carregar o runtime modular.', error);
            return null;
        });
        return coreRuntimePromise;
    }

    function ensurePerformanceLoader() {
        if (global.AppPerformanceLoader || document.querySelector('script[data-performance-loader]')) return Promise.resolve(global.AppPerformanceLoader || null);
        return ensureCoreRuntime().then(loader => {
            if (global.AppPerformanceLoader) return global.AppPerformanceLoader;
            if (loader) {
                return loader.loadScript('./js/performance-loader.js', { async: false })
                    .then(script => {
                        script.dataset.performanceLoader = '1';
                        return global.AppPerformanceLoader || null;
                    });
            }
            return appendCoreScript('./js/performance-loader.js', 'performanceLoader')
                .then(() => global.AppPerformanceLoader || null);
        }).catch(error => {
            console.warn('Não foi possível carregar o otimizador de performance.', error);
            return null;
        });
    }

    function resolveCallable(path) {
        const parts = String(path || '').split('.').filter(Boolean);
        if (!parts.length) return null;
        let owner = global;
        let value = global;
        for (const part of parts) {
            owner = value;
            value = value?.[part];
            if (value == null) return null;
        }
        return typeof value === 'function' ? { fn: value, owner } : null;
    }

    function callPath(path, ...args) {
        const callable = resolveCallable(path);
        if (!callable) {
            console.warn(`Ação indisponível: ${path}`);
            return undefined;
        }
        return callable.fn.apply(callable.owner, args);
    }

    function callGlobal(name, ...args) {
        return callPath(name, ...args);
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
        'call': element => callPath(element.dataset.call),
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

        document.addEventListener('dblclick', event => {
            const element = event.target.closest('[data-dblclick-call]');
            if (element) callPath(element.dataset.dblclickCall);
        });

        document.addEventListener('change', event => {
            const element = event.target.closest('[data-change-action], [data-change-call]');
            if (!element) return;
            if (element.dataset.changeAction === 'change-concurso') {
                callGlobal('changeConcurso', element.value);
                return;
            }
            if (element.dataset.changeCall) callPath(element.dataset.changeCall);
        });

        document.addEventListener('input', event => {
            const element = event.target.closest('[data-input-call]');
            if (element) callPath(element.dataset.inputCall);
        });

        document.addEventListener('focusin', event => {
            const element = event.target.closest('[data-focus-call]');
            if (element) callPath(element.dataset.focusCall);
        });
    }

    global.AppNavigation = Object.freeze({
        findDesktopTabButton,
        syncMobileNav,
        navigateTo,
        mobileSwitchTab,
        callPath,
        ensureCoreRuntime
    });

    ensureCanonicalUiStyle();
    ensureAccessibleNames();
    installDelegatedActions();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ensureAccessibleNames();
            ensureCoreRuntime().then(() => ensurePerformanceLoader());
        }, { once: true });
    } else {
        ensureCoreRuntime().then(() => ensurePerformanceLoader());
    }
})(window);
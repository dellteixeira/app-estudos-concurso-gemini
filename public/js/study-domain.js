(function (root, factory) {
    // Compatibilidade de performance: alguns navegadores (ex.: Firefox) expõem
    // PerformanceObserver, mas não suportam a entrada "longtask". O app-core
    // registra essa telemetria apenas como diagnóstico local; nesses navegadores
    // a observação já não produz dados. Evitamos somente a chamada não suportada
    // para não gerar warning no console, sem afetar navegadores compatíveis.
    const NativePerformanceObserver = root?.PerformanceObserver;
    const supportedEntryTypes = Array.isArray(NativePerformanceObserver?.supportedEntryTypes)
        ? NativePerformanceObserver.supportedEntryTypes
        : null;

    if (NativePerformanceObserver && supportedEntryTypes && !supportedEntryTypes.includes('longtask')) {
        const originalObserve = NativePerformanceObserver.prototype.observe;
        if (typeof originalObserve === 'function' && !NativePerformanceObserver.prototype.__estudoAdaptativoLongTaskGuard) {
            Object.defineProperty(NativePerformanceObserver.prototype, '__estudoAdaptativoLongTaskGuard', {
                value: true,
                configurable: false,
                enumerable: false,
                writable: false
            });
            NativePerformanceObserver.prototype.observe = function (options) {
                if (options?.type === 'longtask') return;

                if (Array.isArray(options?.entryTypes) && options.entryTypes.includes('longtask')) {
                    const entryTypes = options.entryTypes.filter(type => supportedEntryTypes.includes(type));
                    if (!entryTypes.length) return;
                    return originalObserve.call(this, { ...options, entryTypes });
                }

                return originalObserve.call(this, options);
            };
        }
    }

    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.StudyDomain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function getSessionMinutes(session) {
        const candidates = [session?.minutes, session?.durationMinutes, session?.focusMinutes, session?.elapsedMinutes];
        for (const value of candidates) {
            const numeric = Number(value);
            if (Number.isFinite(numeric) && numeric > 0) return Math.max(0, Math.round(numeric));
        }
        return 0;
    }

    function getStudySessionIdentity(session) {
        if (session?.id != null && String(session.id).trim()) return `id:${String(session.id).trim()}`;
        return `fp:${[session?.createdAt,session?.dateKey,session?.materia,session?.assunto,session?.activityType,getSessionMinutes(session)].map(v=>String(v??'')).join('|')}`;
    }

    function mergeStudySessions(primarySessions, secondarySessions) {
        const merged = new Map();
        [...(Array.isArray(secondarySessions) ? secondarySessions : []), ...(Array.isArray(primarySessions) ? primarySessions : [])].forEach(session => {
            if (!session || typeof session !== 'object') return;
            const key = getStudySessionIdentity(session);
            const previous = merged.get(key) || {};
            merged.set(key, { ...previous, ...session, minutes:getSessionMinutes(session) || getSessionMinutes(previous) });
        });
        return [...merged.values()].sort((a,b) => String(a?.createdAt || a?.dateKey || '').localeCompare(String(b?.createdAt || b?.dateKey || '')));
    }

    function totalStudyMinutes(sessions) {
        return (Array.isArray(sessions) ? sessions : []).reduce((total, session) => total + getSessionMinutes(session), 0);
    }

    function sortNamesByCanonicalOrder(names, canonicalNames) {
        const canonical = Array.isArray(canonicalNames) ? canonicalNames : [];
        const rank = new Map(canonical.map((name,index) => [name,index]));
        return [...new Set((Array.isArray(names) ? names : []).filter(Boolean))].sort((a,b) => {
            const ar = rank.has(a) ? rank.get(a) : Number.MAX_SAFE_INTEGER;
            const br = rank.has(b) ? rank.get(b) : Number.MAX_SAFE_INTEGER;
            if (ar !== br) return ar - br;
            return String(a).localeCompare(String(b), 'pt-BR', { sensitivity:'base' });
        });
    }

    function getTopicItemsForDeletion(items, materia, assunto) {
        return (Array.isArray(items) ? items : []).filter(item =>
            String(item?.materia || '').trim() === String(materia || '').trim() &&
            String(item?.assunto || '').trim() === String(assunto || '').trim()
        );
    }

    function questionProgressFraction({ total=0, accuracy=null, legacyChecked=false } = {}) {
        total = Math.max(0, Number(total) || 0);
        accuracy = Number.isFinite(Number(accuracy)) ? Number(accuracy) : null;
        const confidence = total > 0 ? Math.max(0.08, Math.min(1, 1 - Math.exp(-total / 12))) : 0;
        let volumeFraction = 0;
        if (total >= 20) volumeFraction = 0.80;
        else if (total >= 10) volumeFraction = 0.50;
        else if (total >= 5) volumeFraction = 0.30;
        else if (total >= 1) volumeFraction = 0.10;
        else if (legacyChecked) volumeFraction = 0.10;
        let performanceBonus = 0;
        if (total >= 5 && accuracy != null && accuracy >= 75) {
            const accuracyScale = Math.max(0, Math.min(1, (accuracy - 75) / 25));
            const bonusBase = 0.10 + (accuracyScale * 0.10);
            const confidenceFactor = 0.75 + (confidence * 0.25);
            performanceBonus = bonusBase * confidenceFactor;
        }
        return Math.max(0, Math.min(1, volumeFraction + performanceBonus));
    }

    function hasRetentionMasteryEvidence(state) {
        const stats = state?.questionStats || {};
        const qTotal = Math.max(0, Number(stats.total) || 0);
        const qAccuracy = Number.isFinite(Number(stats.averageAccuracy))
            ? Number(stats.averageAccuracy)
            : (Number.isFinite(Number(stats.lastAccuracy)) ? Number(stats.lastAccuracy) : null);
        const qConfidence = qTotal > 0 ? Math.max(0.08, Math.min(1, 1 - Math.exp(-qTotal / 12))) : 0;
        const objectiveEvidence = qTotal >= 10 && qAccuracy != null && qAccuracy >= 75 && qConfidence >= 0.50;
        const ratings = state?.ratingCounts || {};
        const positiveRecallRatings = Math.max(0, Number(ratings.good) || 0) + Math.max(0, Number(ratings.easy) || 0);
        const subjectiveEvidence = positiveRecallRatings >= 2;
        return objectiveEvidence || subjectiveEvidence;
    }

    function filterActiveRetentionStates(states, activeTopicKeys) {
        const keys = activeTopicKeys instanceof Set ? activeTopicKeys : new Set(activeTopicKeys || []);
        return (Array.isArray(states) ? states : []).filter(state => state?.lastStudyAt && state?.key && keys.has(state.key));
    }

    function validateStrongPassword(password) {
        const value = String(password || '');
        const checks = {
            minLength: value.length >= 8,
            uppercase: /[A-Z]/.test(value),
            lowercase: /[a-z]/.test(value),
            number: /[0-9]/.test(value),
            special: /[^A-Za-z0-9\s]/.test(value)
        };
        const labels = {
            minLength:'mínimo de 8 caracteres',
            uppercase:'uma letra maiúscula',
            lowercase:'uma letra minúscula',
            number:'um número',
            special:'um caractere especial'
        };
        const missing = Object.entries(checks).filter(([,ok]) => !ok).map(([key]) => labels[key]);
        return { valid:missing.length === 0, checks, missing };
    }

    return {
        getSessionMinutes,
        getStudySessionIdentity,
        mergeStudySessions,
        totalStudyMinutes,
        sortNamesByCanonicalOrder,
        getTopicItemsForDeletion,
        questionProgressFraction,
        hasRetentionMasteryEvidence,
        filterActiveRetentionStates,
        validateStrongPassword
    };
});

(function installStrongSignupPasswordPolicy(root) {
    'use strict';
    if (!root?.document || root.__strongSignupPasswordPolicyInstalled) return;
    root.__strongSignupPasswordPolicyInstalled = true;

    const POLICY_HELP = 'Para cadastrar: mínimo 8 caracteres, com maiúscula, minúscula, número e caractere especial.';
    const POLICY_PLACEHOLDER = 'Senha (mín. 8: A-Z, a-z, 0-9 e especial)';

    function showPolicyMessage(message, kind = 'error') {
        const box = root.document.getElementById('authStatusMessage');
        if (!box) return;
        if (typeof root.setVisualState === 'function') root.setVisualState(box, true);
        else { box.hidden = false; box.setAttribute('aria-hidden', 'false'); }
        box.textContent = message;
        box.classList.toggle('is-error', kind === 'error');
    }

    function enhancePasswordField() {
        const input = root.document.getElementById('password');
        if (!input) return false;
        input.placeholder = POLICY_PLACEHOLDER;
        input.minLength = 8;
        input.setAttribute('aria-describedby', 'passwordPolicyHint');
        input.setAttribute('title', POLICY_HELP);

        let hint = root.document.getElementById('passwordPolicyHint');
        if (!hint) {
            hint = root.document.createElement('div');
            hint.id = 'passwordPolicyHint';
            hint.textContent = POLICY_HELP;
            hint.style.cssText = 'margin-top:6px;font-size:.74rem;line-height:1.35;color:#9fb2c6;';
            input.insertAdjacentElement('afterend', hint);
        }

        if (!input.dataset.strongPolicyBound) {
            input.dataset.strongPolicyBound = '1';
            input.addEventListener('input', () => {
                if (!input.value) {
                    hint.textContent = POLICY_HELP;
                    hint.style.color = '#9fb2c6';
                    return;
                }
                const result = root.StudyDomain?.validateStrongPassword?.(input.value);
                if (result?.valid) {
                    hint.textContent = 'Senha atende aos requisitos para cadastro.';
                    hint.style.color = '#86efac';
                } else {
                    hint.textContent = `Falta: ${(result?.missing || []).join(', ')}.`;
                    hint.style.color = '#fca5a5';
                }
            });
        }
        return true;
    }

    function wrapSignUp() {
        const original = root.handleSignUp;
        if (typeof original !== 'function') return false;
        if (original.__strongPasswordPolicyWrapped) return true;

        const wrapped = async function (...args) {
            const input = root.document.getElementById('password');
            const result = root.StudyDomain?.validateStrongPassword?.(input?.value || '');
            if (!result?.valid) {
                showPolicyMessage(`A senha para cadastro precisa ter ${result?.missing?.join(', ') || POLICY_HELP}.`);
                input?.focus();
                return;
            }
            return original.apply(this, args);
        };
        Object.defineProperty(wrapped, '__strongPasswordPolicyWrapped', { value:true });
        root.handleSignUp = wrapped;
        return true;
    }

    function boot() {
        enhancePasswordField();
        let attempts = 0;
        const install = () => {
            enhancePasswordField();
            if (wrapSignUp() || attempts++ >= 40) return;
            root.setTimeout(install, 100);
        };
        install();
    }

    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot, { once:true });
    else root.setTimeout(boot, 0);
})(typeof window !== 'undefined' ? window : globalThis);

(function centerAuthButtonLabels(root) {
    'use strict';
    if (!root?.document || root.__authButtonLabelsCentered) return;
    root.__authButtonLabelsCentered = true;

    function apply() {
        const screen = root.document.getElementById('auth-screen');
        if (!screen) return false;
        const buttons = screen.querySelectorAll('.auth-card .btn');
        buttons.forEach(button => {
            button.style.justifyContent = 'center';
            button.style.textAlign = 'center';
        });
        return buttons.length > 0;
    }

    if (root.document.readyState === 'loading') {
        root.document.addEventListener('DOMContentLoaded', apply, { once:true });
    } else {
        apply();
    }
})(typeof window !== 'undefined' ? window : globalThis);

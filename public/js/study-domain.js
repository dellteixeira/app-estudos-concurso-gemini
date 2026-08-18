(function (root, factory) {
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

    return {
        getSessionMinutes,
        getStudySessionIdentity,
        mergeStudySessions,
        totalStudyMinutes,
        sortNamesByCanonicalOrder,
        getTopicItemsForDeletion,
        questionProgressFraction,
        hasRetentionMasteryEvidence,
        filterActiveRetentionStates
    };
});

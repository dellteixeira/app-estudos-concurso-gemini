(function (global) {
'use strict';

const DAY_MS = 86400000;
const todayKey = () => getLocalDateKey(new Date());
const topicKeyFromItem = item => getStudyTopicKey(item?.materia, item?.assunto);
const topicKeyFromText = text => {
    const normalized = normalizeScheduledTopicForStudy(String(text || ''));
    const item = editalItems.find(entry => `${entry.materia} - ${entry.assunto}` === normalized);
    return item ? topicKeyFromItem(item) : '';
};

function actualSessionDate(session) {
    const raw = session?.createdAt || session?.dateKey || session?.startedAt || session?.completedAt || null;
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isFinite(date.getTime()) ? date : null;
}

function isMeaningfulStudySession(session) {
    return !!getStudySessionTopicKey(session) && Math.max(0, Number(StudyDomain?.getSessionMinutes?.(session) || session?.minutes || 0)) > 0;
}

function getCycleAnchor(contest) {
    const startDate = String(contest?.scheduleConfig?.startDate || contest?.adaptiveScheduleAnchor?.plannedStartDate || '').trim();
    const sessions = (Array.isArray(contest?.studySessions) ? contest.studySessions : [])
        .filter(isMeaningfulStudySession)
        .map(session => ({ session, date: actualSessionDate(session) }))
        .filter(entry => entry.date && (!startDate || getLocalDateKey(entry.date) >= startDate))
        .sort((a, b) => a.date - b.date);
    return { startDate, firstStudyAt: sessions[0]?.date || null };
}

function getTopicScheduleContext(contest, state, item, now = new Date()) {
    const schedule = contest?.dateSchedule || {};
    const key = state?.key || topicKeyFromItem(item);
    const lookup = new Map(editalItems.map(entry => [`${entry.materia} - ${entry.assunto}`, entry]));
    let firstPendingDate = null;
    let firstPendingText = '';

    Object.keys(schedule).sort().some(dateKey => {
        const items = Array.isArray(schedule[dateKey]) ? schedule[dateKey] : [];
        for (const text of items) {
            if (topicKeyFromText(text) !== key) continue;
            const status = getScheduledItemStudyState(text, lookup, dateKey);
            if (status.done) continue;
            firstPendingDate = new Date(`${dateKey}T23:59:59`);
            firstPendingText = String(text || '');
            return true;
        }
        return false;
    });

    const originalNext = state?.nextReviewAt ? new Date(state.nextReviewAt) : null;
    const originalValid = originalNext && Number.isFinite(originalNext.getTime()) ? originalNext : null;
    const pendingValid = firstPendingDate && Number.isFinite(firstPendingDate.getTime()) ? firstPendingDate : null;
    const pendingIsFutureOrToday = !!(pendingValid && pendingValid >= new Date(`${todayKey()}T00:00:00`));
    const cycle = getCycleAnchor(contest);
    const acquired = !!(item && (isContentAcquired(item) || item.questoes || hasAnyAdaptiveRevisionCompletion(item, contest)));
    const pendingBase = !!firstPendingText && !isRevisionScheduleText(firstPendingText);
    const notStartedInCurrentCycle = !!(cycle.startDate && !cycle.firstStudyAt);
    const dormantPending = pendingIsFutureOrToday && pendingBase && !acquired && notStartedInCurrentCycle;

    let effectiveNext = originalValid;
    if (pendingIsFutureOrToday && (!effectiveNext || effectiveNext < pendingValid)) effectiveNext = pendingValid;

    return {
        cycle,
        acquired,
        pendingBase,
        pendingDate: pendingValid,
        dormantPending,
        effectiveNext,
        overdue: !!(effectiveNext && effectiveNext < now),
        overdueDays: effectiveNext && effectiveNext < now ? Math.max(0, Math.floor((now - effectiveNext) / DAY_MS)) : 0
    };
}

function cloneStateForSchedule(state, ctx) {
    if (!state) return state;
    if (ctx.dormantPending) {
        return {
            ...state,
            lastStudyAt: null,
            lastReviewAt: null,
            nextReviewAt: ctx.pendingDate ? ctx.pendingDate.toISOString() : null,
            retention: 100
        };
    }
    if (ctx.effectiveNext && state.nextReviewAt !== ctx.effectiveNext.toISOString()) {
        return { ...state, nextReviewAt: ctx.effectiveNext.toISOString() };
    }
    return state;
}

const originalSchedulerScore = typeof computeRetentionSchedulerScore === 'function' ? computeRetentionSchedulerScore : null;
if (originalSchedulerScore) {
    global.computeRetentionSchedulerScore = function reconciledRetentionSchedulerScore(item, options = {}) {
        const contest = options.contest || getConcursosMetadata()[currentConcurso] || {};
        const originalState = options.state || getRetentionTopicState(contest, item?.materia, item?.assunto, false);
        const ctx = getTopicScheduleContext(contest, originalState, item, options.now instanceof Date ? options.now : new Date());
        return originalSchedulerScore(item, { ...options, contest, state: cloneStateForSchedule(originalState, ctx) });
    };
}

function buildReconciledRetentionDiagnostics() {
    const contest = getConcursosMetadata()[currentConcurso] || {};
    const engine = getRetentionEngine(contest, false);
    const now = new Date();
    const activeTopicKeys = new Set((editalItems || []).map(item => topicKeyFromItem(item)));
    const states = StudyDomain.filterActiveRetentionStates(Object.values(engine?.topics || {}), activeTopicKeys);
    const rows = states.map(state => {
        const item = editalItems.find(i => topicKeyFromItem(i) === state.key);
        if (!item) return null;
        const ctx = getTopicScheduleContext(contest, state, item, now);
        if (ctx.dormantPending) return null;
        const retention = Math.max(0, Math.min(100, calculateRetentionFromState(state, now)));
        const questionAccuracy = Number.isFinite(Number(state?.questionStats?.lastAccuracy)) ? Number(state.questionStats.lastAccuracy) : null;
        const effectiveState = cloneStateForSchedule(state, ctx);
        const schedulerScore = global.computeRetentionSchedulerScore
            ? global.computeRetentionSchedulerScore(item,{contest,now,state:effectiveState,isRevision:true,activityType:'revisao_ativa',availableMinutes:20,suggestedMinutes:15}).total
            : 0;
        const prioritySignal = Math.max(0,Math.min(50,schedulerScore/25));
        const riskScore = (100-retention) + (ctx.overdue ? 28 + Math.min(30,ctx.overdueDays*3) : 0) + (questionAccuracy!=null && questionAccuracy<60 ? (60-questionAccuracy)*.7 : 0) + prioritySignal;
        return { state, retention, nextAt:ctx.effectiveNext, overdue:ctx.overdue, overdueDays:ctx.overdueDays, questionAccuracy, riskScore, schedulerScore, scheduleReconciled:true };
    }).filter(Boolean);

    const avg = rows.length ? rows.reduce((sum,row)=>sum+row.retention,0)/rows.length : null;
    const risk = rows.filter(row => row.retention < 70 || row.overdue || (row.questionAccuracy!=null && row.questionAccuracy<60));
    const overdue = rows.filter(row => row.overdue);
    const mastered = rows.filter(row => row.retention >= 85 && !row.overdue && hasRetentionMasteryEvidence(row.state));
    risk.sort((a,b)=>b.riskScore-a.riskScore || a.retention-b.retention);
    return { rows, avg, risk, overdue, mastered };
}

global.buildRetentionDiagnostics = buildReconciledRetentionDiagnostics;

function compactPastRedistributedPending(contest) {
    const schedule = contest?.dateSchedule || {};
    const startDate = String(contest?.scheduleConfig?.startDate || '').trim();
    if (!startDate) return false;
    const lookup = new Map(editalItems.map(item => [`${item.materia} - ${item.assunto}`, item]));
    const futureTopics = new Set();

    Object.entries(schedule).forEach(([dateKey, items]) => {
        if (dateKey < startDate || !Array.isArray(items)) return;
        items.forEach(text => {
            const state = getScheduledItemStudyState(text, lookup, dateKey);
            if (!state.done && state.cleanTop) futureTopics.add(state.cleanTop);
        });
    });

    let changed = false;
    Object.keys(schedule).forEach(dateKey => {
        if (dateKey >= startDate || !Array.isArray(schedule[dateKey])) return;
        const kept = schedule[dateKey].filter(text => {
            const state = getScheduledItemStudyState(text, lookup, dateKey);
            if (state.done) return true;
            if (futureTopics.has(state.cleanTop)) { changed = true; return false; }
            return true;
        });
        if (kept.length) schedule[dateKey] = kept;
        else if (schedule[dateKey].length) { delete schedule[dateKey]; changed = true; }
    });
    return changed;
}

async function reconcileAfterScheduleGeneration(source) {
    const metadata = getConcursosMetadata();
    const contest = metadata[currentConcurso] || (metadata[currentConcurso] = {});
    const startDate = String(contest?.scheduleConfig?.startDate || todayKey());
    const cycle = getCycleAnchor(contest);
    compactPastRedistributedPending(contest);
    contest.adaptiveScheduleAnchor = {
        version: 1,
        source,
        plannedStartDate: startDate,
        generatedAt: new Date().toISOString(),
        firstStudyAt: cycle.firstStudyAt ? cycle.firstStudyAt.toISOString() : null
    };
    await saveConcursosMetadata(metadata);
    renderMonthCalendar();
    renderDelayedPanel();
    renderRetentionDiagnostics();
    updateModernOverview();
}

function wrapScheduleGenerator(name) {
    const original = global[name];
    if (typeof original !== 'function' || original.__adaptiveReconciled) return;
    const wrapped = async function (...args) {
        const result = await original.apply(this, args);
        await reconcileAfterScheduleGeneration(name);
        return result;
    };
    wrapped.__adaptiveReconciled = true;
    global[name] = wrapped;
}

['gerarCronogramaInteligente','gerarCronogramaMetodo2','reorganizarMateriasCronograma'].forEach(wrapScheduleGenerator);

const originalRebuild = typeof rebuildRetentionEngineForContest === 'function' ? rebuildRetentionEngineForContest : null;
if (originalRebuild) {
    global.rebuildRetentionEngineForContest = function reconciledRetentionRebuild(contest) {
        const result = originalRebuild(contest);
        if (contest?.adaptiveScheduleAnchor) {
            const cycle = getCycleAnchor(contest);
            contest.adaptiveScheduleAnchor.firstStudyAt = cycle.firstStudyAt ? cycle.firstStudyAt.toISOString() : null;
        }
        return result;
    };
}

global.AdaptiveScheduleReconciliation = Object.freeze({
    getCycleAnchor,
    getTopicScheduleContext,
    compactPastRedistributedPending,
    reconcileAfterScheduleGeneration
});

})(window);

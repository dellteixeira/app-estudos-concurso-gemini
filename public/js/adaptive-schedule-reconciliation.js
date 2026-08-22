(function (global) {
'use strict';

const DAY_MS = 86400000;
let installed = false;
let originalSchedulerScore = null;
let originalRebuild = null;

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
    return !!getStudySessionTopicKey(session) && Math.max(0, Number(StudyDomain.getSessionMinutes(session) || session?.minutes || 0)) > 0;
}

function getCycleAnchor(contest) {
    const startDate = String(contest?.scheduleConfig?.startDate || contest?.adaptiveScheduleAnchor?.plannedStartDate || '').trim();
    const first = (Array.isArray(contest?.studySessions) ? contest.studySessions : [])
        .filter(isMeaningfulStudySession)
        .map(session => actualSessionDate(session))
        .filter(date => date && (!startDate || getLocalDateKey(date) >= startDate))
        .sort((a,b) => a-b)[0] || null;
    return { startDate, firstStudyAt:first };
}

function getTopicScheduleContext(contest, state, item, now = new Date()) {
    const schedule = contest?.dateSchedule || {};
    const key = state?.key || topicKeyFromItem(item);
    const lookup = new Map(editalItems.map(entry => [`${entry.materia} - ${entry.assunto}`, entry]));
    let pendingDate = null;
    let pendingText = '';
    Object.keys(schedule).sort().some(dateKey => {
        for (const text of (Array.isArray(schedule[dateKey]) ? schedule[dateKey] : [])) {
            if (topicKeyFromText(text) !== key) continue;
            const status = getScheduledItemStudyState(text, lookup, dateKey);
            if (status.done) continue;
            pendingDate = new Date(`${dateKey}T23:59:59`);
            pendingText = String(text || '');
            return true;
        }
        return false;
    });

    const next = state?.nextReviewAt ? new Date(state.nextReviewAt) : null;
    const originalNext = next && Number.isFinite(next.getTime()) ? next : null;
    const validPending = pendingDate && Number.isFinite(pendingDate.getTime()) ? pendingDate : null;
    const pendingFuture = !!(validPending && validPending >= new Date(`${todayKey()}T00:00:00`));
    const cycle = getCycleAnchor(contest);
    const acquired = !!(item && (isContentAcquired(item) || item.questoes || hasAnyAdaptiveRevisionCompletion(item, contest)));
    const pendingBase = !!pendingText && !isRevisionScheduleText(pendingText);
    const dormantPending = pendingFuture && pendingBase && !acquired && !!cycle.startDate && !cycle.firstStudyAt;
    let effectiveNext = originalNext;
    if (pendingFuture && (!effectiveNext || effectiveNext < validPending)) effectiveNext = validPending;
    const overdue = !!(effectiveNext && effectiveNext < now);
    return {
        cycle, acquired, pendingBase, pendingDate:validPending, dormantPending, effectiveNext, overdue,
        overdueDays: overdue ? Math.max(0, Math.floor((now-effectiveNext)/DAY_MS)) : 0
    };
}

function cloneStateForSchedule(state, ctx) {
    if (!state) return state;
    if (ctx.dormantPending) return {...state,lastStudyAt:null,lastReviewAt:null,nextReviewAt:ctx.pendingDate?.toISOString()||null,retention:100};
    if (ctx.effectiveNext) return {...state,nextReviewAt:ctx.effectiveNext.toISOString()};
    return state;
}

function reconciledSchedulerScore(item, options = {}) {
    const contest = options.contest || getConcursosMetadata()[currentConcurso] || {};
    const state = options.state || getRetentionTopicState(contest,item?.materia,item?.assunto,false);
    const ctx = getTopicScheduleContext(contest,state,item,options.now instanceof Date?options.now:new Date());
    return originalSchedulerScore(item,{...options,contest,state:cloneStateForSchedule(state,ctx)});
}

function buildReconciledRetentionDiagnostics() {
    const contest = getConcursosMetadata()[currentConcurso] || {};
    const engine = getRetentionEngine(contest,false);
    const now = new Date();
    const active = new Set((editalItems||[]).map(topicKeyFromItem));
    const states = StudyDomain.filterActiveRetentionStates(Object.values(engine?.topics||{}),active);
    const rows = states.map(state => {
        const item = editalItems.find(entry => topicKeyFromItem(entry)===state.key);
        if(!item)return null;
        const ctx=getTopicScheduleContext(contest,state,item,now);
        if(ctx.dormantPending)return null;
        const retention=Math.max(0,Math.min(100,calculateRetentionFromState(state,now)));
        const questionAccuracy=Number.isFinite(Number(state?.questionStats?.lastAccuracy))?Number(state.questionStats.lastAccuracy):null;
        const schedulerScore=reconciledSchedulerScore(item,{contest,now,state,isRevision:true,activityType:'revisao_ativa',availableMinutes:20,suggestedMinutes:15}).total;
        const prioritySignal=Math.max(0,Math.min(50,schedulerScore/25));
        const riskScore=(100-retention)+(ctx.overdue?28+Math.min(30,ctx.overdueDays*3):0)+(questionAccuracy!=null&&questionAccuracy<60?(60-questionAccuracy)*.7:0)+prioritySignal;
        return {state,retention,nextAt:ctx.effectiveNext,overdue:ctx.overdue,overdueDays:ctx.overdueDays,questionAccuracy,riskScore,schedulerScore,scheduleReconciled:true};
    }).filter(Boolean);
    const avg=rows.length?rows.reduce((sum,row)=>sum+row.retention,0)/rows.length:null;
    const risk=rows.filter(row=>row.retention<70||row.overdue||(row.questionAccuracy!=null&&row.questionAccuracy<60));
    const overdue=rows.filter(row=>row.overdue);
    const mastered=rows.filter(row=>row.retention>=85&&!row.overdue&&hasRetentionMasteryEvidence(row.state));
    risk.sort((a,b)=>b.riskScore-a.riskScore||a.retention-b.retention);
    return {rows,avg,risk,overdue,mastered};
}

function compactPastRedistributedPending(contest) {
    const schedule=contest?.dateSchedule||{};
    const startDate=String(contest?.scheduleConfig?.startDate||'').trim();
    if(!startDate)return false;
    const lookup=new Map(editalItems.map(item=>[`${item.materia} - ${item.assunto}`,item]));
    const futureTopics=new Set();
    Object.entries(schedule).forEach(([dateKey,items])=>{
        if(dateKey<startDate||!Array.isArray(items))return;
        items.forEach(text=>{const s=getScheduledItemStudyState(text,lookup,dateKey);if(!s.done&&s.cleanTop)futureTopics.add(s.cleanTop);});
    });
    let changed=false;
    Object.keys(schedule).forEach(dateKey=>{
        if(dateKey>=startDate||!Array.isArray(schedule[dateKey]))return;
        const kept=schedule[dateKey].filter(text=>{const s=getScheduledItemStudyState(text,lookup,dateKey);if(s.done)return true;if(futureTopics.has(s.cleanTop)){changed=true;return false;}return true;});
        if(kept.length)schedule[dateKey]=kept;else if(schedule[dateKey].length){delete schedule[dateKey];changed=true;}
    });
    return changed;
}

async function reconcileAfterScheduleGeneration(source) {
    const metadata=getConcursosMetadata();
    const contest=metadata[currentConcurso]||(metadata[currentConcurso]={});
    compactPastRedistributedPending(contest);
    const cycle=getCycleAnchor(contest);
    contest.adaptiveScheduleAnchor={version:1,source,plannedStartDate:String(contest?.scheduleConfig?.startDate||todayKey()),generatedAt:new Date().toISOString(),firstStudyAt:cycle.firstStudyAt?.toISOString()||null};
    await saveConcursosMetadata(metadata);
    renderMonthCalendar();renderDelayedPanel();renderRetentionDiagnostics();updateModernOverview();
}

function wrapScheduleGenerator(name) {
    const original=global[name];
    if(typeof original!=='function'||original.__adaptiveReconciled)return;
    const wrapped=async function(...args){const result=await original.apply(this,args);await reconcileAfterScheduleGeneration(name);return result;};
    wrapped.__adaptiveReconciled=true;
    global[name]=wrapped;
}

function reconciledRebuild(contest){
    const result=originalRebuild(contest);
    if(contest?.adaptiveScheduleAnchor){const cycle=getCycleAnchor(contest);contest.adaptiveScheduleAnchor.firstStudyAt=cycle.firstStudyAt?.toISOString()||null;}
    return result;
}

function install(){
    if(installed)return;
    if(typeof computeRetentionSchedulerScore!=='function'||typeof rebuildRetentionEngineForContest!=='function'||typeof renderRetentionDiagnostics!=='function')return setTimeout(install,50);
    installed=true;
    originalSchedulerScore=computeRetentionSchedulerScore;
    originalRebuild=rebuildRetentionEngineForContest;
    global.computeRetentionSchedulerScore=reconciledSchedulerScore;
    global.buildRetentionDiagnostics=buildReconciledRetentionDiagnostics;
    global.rebuildRetentionEngineForContest=reconciledRebuild;
    ['gerarCronogramaInteligente','gerarCronogramaMetodo2','reorganizarMateriasCronograma'].forEach(wrapScheduleGenerator);
    global.AdaptiveScheduleReconciliation=Object.freeze({getCycleAnchor,getTopicScheduleContext,compactPastRedistributedPending,reconcileAfterScheduleGeneration});
    try{renderRetentionDiagnostics();}catch(_){}
}

if(document.readyState==='complete')setTimeout(install,0);else global.addEventListener('load',()=>setTimeout(install,0),{once:true});

})(window);

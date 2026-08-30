(function installAdaptiveFeedbackLoop(global){
'use strict';
if(global.AppAdaptiveFeedbackLoop)return;

const STORAGE_KEY='adaptive_feedback_loop_v1';
const HISTORY_LIMIT=60;
const EVALUATION_DELAY_MS=2*60*1000;
const EXECUTION_STATUS=new Set(['completed','interrupted','abandoned']);

function safe(value,max=180){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0))}
function read(){try{const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return parsed&&typeof parsed==='object'?parsed:{}}catch(_){return{}}}
function write(value){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(value));return true}catch(_){return false}}
function nowIso(){return new Date().toISOString()}
function attributedHistory(){return (Array.isArray(read().history)?read().history:[]).filter(item=>item?.attributed===true)}
function durationBucket(minutes){const value=Math.max(5,Math.min(90,Number(minutes)||0));return Math.max(5,Math.min(90,Math.round(value/5)*5))}

function snapshot(candidate){
  const m=candidate?.metrics||{};
  return {retention:clamp(m.retention,0,100),accuracy:m.accuracy==null?null:clamp(m.accuracy,0,100),reviewCount:clamp(m.reviewCount,0,999),sessionCount:clamp(m.sessionCount,0,999),lapseCount:clamp(m.lapseCount,0,999)};
}
function recommendationKey(plan){return safe(plan?.candidate?.topicId,600)}
function recordStart(plan){
  const topicId=recommendationKey(plan);if(!topicId)return null;
  const data=read();const pending=Array.isArray(data.pending)?data.pending:[];
  const entry={topicId,action:safe(plan?.intervention?.recommendedAction,40),suggestedMinutes:Math.round(clamp(plan?.intervention?.suggestedMinutes,5,90)),source:plan?.source==='ai'?'ai':'learning-advisor',startedAt:nowIso(),executionStatus:'pending',baseline:snapshot(plan.candidate)};
  data.pending=[...pending.filter(item=>item?.topicId!==topicId),entry].slice(-20);data.history=Array.isArray(data.history)?data.history:[];write(data);return entry;
}
function recordExecutionOutcome(detail={}){
  const topicId=safe(detail.topicId,600);const status=EXECUTION_STATUS.has(detail.status)?detail.status:'interrupted';if(!topicId)return false;
  const data=read();const pending=Array.isArray(data.pending)?data.pending:[];let matched=false;
  data.pending=pending.map(entry=>{if(entry?.topicId!==topicId)return entry;matched=true;return {...entry,executionStatus:status,executedMinutes:Number(clamp(detail.elapsedMinutes,0,180).toFixed(1)),completionRatio:Number(clamp(detail.completionRatio,0,1).toFixed(2)),executionFinishedAt:safe(detail.finishedAt,40)||nowIso()};});
  if(matched)write(data);return matched;
}
function changedEnough(before,after){return after.reviewCount>before.reviewCount||after.sessionCount>before.sessionCount||after.lapseCount!==before.lapseCount||after.accuracy!==before.accuracy||Math.abs(after.retention-before.retention)>=1}
function scoreOutcome(before,after){
  const retentionDelta=after.retention-before.retention;const accuracyDelta=(after.accuracy==null||before.accuracy==null)?0:after.accuracy-before.accuracy;const lapseDelta=after.lapseCount-before.lapseCount;const weighted=retentionDelta*.55+accuracyDelta*.35-lapseDelta*8;
  return {outcome:weighted>=5?'positive':weighted<=-5?'negative':'neutral',score:Number(weighted.toFixed(2)),retentionDelta:Number(retentionDelta.toFixed(2)),accuracyDelta:Number(accuracyDelta.toFixed(2)),lapseDelta:Number(lapseDelta.toFixed(2))};
}
function evaluatePending(){
  const advisor=global.AppLearningAdvisor;if(!advisor?.collectCandidates)return [];
  const candidates=advisor.collectCandidates?.(5)||[];const byId=new Map(candidates.map(candidate=>[candidate.topicId,candidate]));const data=read();const pending=Array.isArray(data.pending)?data.pending:[];const history=Array.isArray(data.history)?data.history:[];const keep=[];const completed=[];const now=Date.now();
  pending.forEach(entry=>{
    if(entry?.executionStatus==='interrupted'||entry?.executionStatus==='abandoned')return;
    if(entry?.executionStatus!=='completed'){keep.push(entry);return;}
    const finished=Date.parse(entry?.executionFinishedAt||entry?.startedAt||0);if(Number.isFinite(finished)&&now-finished<EVALUATION_DELAY_MS){keep.push(entry);return;}
    const candidate=byId.get(entry?.topicId);if(!candidate){keep.push(entry);return;}
    const after=snapshot(candidate);const before=entry?.baseline||snapshot({});if(!changedEnough(before,after)){keep.push(entry);return;}
    completed.push({topicId:entry.topicId,action:entry.action,source:entry.source,suggestedMinutes:entry.suggestedMinutes,executedMinutes:Number(entry.executedMinutes)||0,completionRatio:Number(entry.completionRatio)||0,startedAt:entry.startedAt,executionFinishedAt:entry.executionFinishedAt,evaluatedAt:nowIso(),attributed:true,...scoreOutcome(before,after)});
  });
  if(completed.length||keep.length!==pending.length){data.pending=keep;data.history=[...history,...completed].slice(-HISTORY_LIMIT);write(data);}
  if(completed.length)global.dispatchEvent(new CustomEvent('adaptive-feedback-evaluated',{detail:{count:completed.length,attributed:true}}));
  return completed;
}
function getActionStats(){
  const map={};
  attributedHistory().forEach(item=>{const action=safe(item?.action,40)||'unknown';const bucket=map[action]||(map[action]={action,count:0,positive:0,neutral:0,negative:0,averageScore:0});bucket.count+=1;bucket[item?.outcome]=(bucket[item?.outcome]||0)+1;bucket.averageScore+=Number(item?.score)||0;});
  return Object.values(map).map(item=>({...item,averageScore:item.count?Number((item.averageScore/item.count).toFixed(2)):0}));
}
function getDurationStats(action){
  const selected=safe(action,40);const buckets={};
  attributedHistory().forEach(item=>{
    if(selected&&safe(item?.action,40)!==selected)return;
    const executed=Number(item?.executedMinutes)||0;if(executed<5)return;
    const minutes=durationBucket(executed);const key=`${safe(item?.action,40)||'unknown'}:${minutes}`;
    const bucket=buckets[key]||(buckets[key]={action:safe(item?.action,40)||'unknown',minutes,count:0,averageScore:0,positive:0,neutral:0,negative:0,averageCompletionRatio:0});
    bucket.count+=1;bucket.averageScore+=Number(item?.score)||0;bucket[item?.outcome]=(bucket[item?.outcome]||0)+1;bucket.averageCompletionRatio+=Number(item?.completionRatio)||0;
  });
  return Object.values(buckets).map(item=>({...item,averageScore:item.count?Number((item.averageScore/item.count).toFixed(2)):0,averageCompletionRatio:item.count?Number((item.averageCompletionRatio/item.count).toFixed(2)):0}));
}
function getPreferredAction(candidates=[]){const stats=getActionStats().filter(item=>item.count>=2);if(!stats.length)return null;const candidateActions=new Set(candidates.map(item=>item?.recommendedAction).filter(Boolean));return stats.filter(item=>!candidateActions.size||candidateActions.has(item.action)).sort((a,b)=>b.averageScore-a.averageScore||b.positive-a.positive)[0]||null}
function findItem(plan){const candidate=plan?.candidate;if(!candidate)return null;try{if(Array.isArray(global.editalItems))return global.editalItems.find(item=>item?.materia===candidate.materia&&item?.assunto===candidate.assunto)||null}catch(_){}return null}
function startCurrentPlan(){
  const plan=global.AppAdaptiveAIExperience?.getCurrentPlan?.();if(!plan?.candidate||!plan?.intervention)return false;const item=findItem(plan);recordStart(plan);const action=plan.intervention.recommendedAction;const minutes=Math.max(5,Number(plan.intervention.suggestedMinutes)||15);const base={kind:'study',materia:plan.candidate.materia,assunto:plan.candidate.assunto,itemId:item?.id,isRevision:true,minutes,source:'adaptive_feedback_loop'};
  if(action==='active_recall'&&typeof global.openActiveRecallGuide==='function'){global.openActiveRecallGuide({...base,activityType:'revisao_ativa',method:'revisao_ativa',methodLabel:'Recuperação ativa'});return true}
  if(typeof global.launchOpportunityPomodoro==='function'){const config=action==='questions'?{activityType:'questoes',method:'questoes',methodLabel:'Questões comentadas'}:action==='focused_restudy'?{activityType:'teoria',method:'reestudo',methodLabel:'Reestudo focalizado'}:{activityType:'teoria',method:'revisao_curta',methodLabel:'Revisão curta'};global.launchOpportunityPomodoro({...base,...config});return true}return false;
}
function ensureStartButton(){const actions=document.querySelector('#adaptiveAiExperience .adaptive-ai-actions');if(!actions||document.getElementById('adaptiveAiStart'))return;const button=document.createElement('button');button.id='adaptiveAiStart';button.type='button';button.className='btn btn-success btn-sm';button.textContent='Iniciar plano';button.addEventListener('click',startCurrentPlan);actions.prepend(button)}
function init(){ensureStartButton();evaluatePending();const observer=new MutationObserver(()=>ensureStartButton());observer.observe(document.documentElement,{childList:true,subtree:true});global.addEventListener('adaptive-session-execution-finished',event=>{recordExecutionOutcome(event?.detail||{});setTimeout(evaluatePending,EVALUATION_DELAY_MS)});global.addEventListener('adaptive-feedback-evaluated',()=>global.AppAdaptiveAIExperience?.refresh?.({refine:false}));setInterval(evaluatePending,60*1000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0),{once:true});else setTimeout(init,0);
global.AppAdaptiveFeedbackLoop=Object.freeze({recordStart,recordExecutionOutcome,evaluatePending,getActionStats,getDurationStats,getPreferredAction,startCurrentPlan});
})(window);

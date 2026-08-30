(function installDailyWorkloadAdapter(global){
'use strict';
if(global.AppDailyWorkloadAdapter)return;

const PRESETS=[60,120,180];
const MIN_ATTEMPTS=2;
const MIN_TREND_DAYS=3;
const LOOKBACK_DAYS=7;
const HEALTHY_THRESHOLD=75;
const INTERRUPTION_THRESHOLD=.34;
let installed=false;
let lastDecision=null;

function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0))}
function localDayKey(value=new Date()){
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))return'';
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function dayStart(value){const date=value instanceof Date?new Date(value):new Date(value);if(Number.isNaN(date.getTime()))return null;date.setHours(0,0,0,0);return date}
function ageDays(value){const start=dayStart(value);const today=dayStart(new Date());if(!start||!today)return Infinity;return Math.round((today-start)/86400000)}
function safePreset(value){const numeric=Number(value);return PRESETS.includes(numeric)?numeric:120}
function executionHistory(){return global.AppAdaptiveSessionCompletion?.getHistory?.()||[]}
function weightForAge(age){return Math.max(1,LOOKBACK_DAYS-Math.max(1,Number(age)||1)+1)}

function groupedPriorEvidence(){
  const today=localDayKey();const groups=new Map();
  executionHistory().forEach(item=>{
    if(item?.owner!=='daily-plan')return;
    const stamp=item?.finishedAt||item?.startedAt;const key=localDayKey(stamp);const age=ageDays(stamp);
    if(!key||key===today||age<1||age>LOOKBACK_DAYS)return;
    const bucket=groups.get(key)||{day:key,age,records:[],latest:0};bucket.records.push(item);bucket.latest=Math.max(bucket.latest,Date.parse(stamp)||0);groups.set(key,bucket);
  });
  return [...groups.values()].sort((a,b)=>a.age-b.age||b.latest-a.latest);
}
function summarizeDay(group){
  if(!group?.records?.length)return null;
  const records=group.records;const attempts=records.length;const completed=records.filter(item=>item?.status==='completed').length;const interruptions=records.filter(item=>item?.status==='interrupted'||item?.status==='abandoned').length;
  const plannedMinutes=records.reduce((sum,item)=>sum+(Number(item?.plannedMinutes)||0),0);const realizedMinutes=records.reduce((sum,item)=>sum+(Number(item?.elapsedMinutes)||0),0);
  const averageCompletionRatio=attempts?records.reduce((sum,item)=>sum+clamp(item?.completionRatio,0,1),0)/attempts:0;const interruptionRate=attempts?interruptions/attempts:0;
  const completionRate=attempts?Math.round(completed/attempts*100):0;const executionAdherence=plannedMinutes?Math.min(100,Math.round(realizedMinutes/plannedMinutes*100)):0;
  const stressed=completionRate<HEALTHY_THRESHOLD||averageCompletionRatio<HEALTHY_THRESHOLD/100||executionAdherence<HEALTHY_THRESHOLD||interruptionRate>=INTERRUPTION_THRESHOLD;
  return Object.freeze({day:group.day,age:group.age,weight:weightForAge(group.age),attempts,completed,interruptions,interruptionRate:Number(interruptionRate.toFixed(2)),completionRate,executionAdherence,averageCompletionRatio:Number(averageCompletionRatio.toFixed(2)),plannedMinutes:Number(plannedMinutes.toFixed(1)),realizedMinutes:Number(realizedMinutes.toFixed(1)),stressed,authority:'execution-evidence-only'});
}
function priorDaySummaries(){return groupedPriorEvidence().map(summarizeDay).filter(Boolean)}
function latestPriorDayEvidence(){return priorDaySummaries()[0]||null}
function weightedAverage(days,key,scale=1){
  const totalWeight=days.reduce((sum,day)=>sum+Number(day.weight||0),0);if(!totalWeight)return 0;
  return days.reduce((sum,day)=>sum+(Number(day[key])||0)*Number(day.weight||0),0)/totalWeight*scale;
}
function trendEvidence(){
  const days=priorDaySummaries();const dayCount=days.length;const attempts=days.reduce((sum,day)=>sum+day.attempts,0);const completed=days.reduce((sum,day)=>sum+day.completed,0);const interruptions=days.reduce((sum,day)=>sum+day.interruptions,0);
  const stressedDays=days.filter(day=>day.stressed).length;const requiredStressedDays=Math.max(2,Math.ceil(dayCount/2));
  const weightedCompletionRate=Number(weightedAverage(days,'completionRate').toFixed(1));const weightedExecutionAdherence=Number(weightedAverage(days,'executionAdherence').toFixed(1));const weightedCompletionRatio=Number(weightedAverage(days,'averageCompletionRatio').toFixed(2));const weightedInterruptionRate=Number(weightedAverage(days,'interruptionRate').toFixed(2));
  const enoughEvidence=dayCount>=MIN_TREND_DAYS&&attempts>=Math.max(MIN_ATTEMPTS,MIN_TREND_DAYS);
  const weightedLow=weightedCompletionRate<HEALTHY_THRESHOLD||weightedCompletionRatio<HEALTHY_THRESHOLD/100||weightedExecutionAdherence<HEALTHY_THRESHOLD||weightedInterruptionRate>=INTERRUPTION_THRESHOLD;
  const overloadProbable=enoughEvidence&&stressedDays>=requiredStressedDays&&weightedLow;
  const classification=!enoughEvidence?'insufficient':overloadProbable?'overload-probable':'stable';
  return Object.freeze({days:Object.freeze(days),dayCount,attempts,completed,interruptions,stressedDays,requiredStressedDays,weightedCompletionRate,weightedExecutionAdherence,weightedCompletionRatio,weightedInterruptionRate,classification,enoughEvidence,overloadProbable,windowDays:LOOKBACK_DAYS,authority:'execution-evidence-only'});
}

function evaluate(requestedBudget){
  const requested=safePreset(requestedBudget);const trend=trendEvidence();const evidence=latestPriorDayEvidence();
  if(!trend.enoughEvidence)return Object.freeze({requestedBudget:requested,effectiveBudget:requested,adjusted:false,reason:'insufficient-prior-evidence',classification:'insufficient',evidence,trend,authority:'execution-load-cap-only'});
  const index=PRESETS.indexOf(requested);const effective=trend.overloadProbable&&index>0?PRESETS[index-1]:requested;
  const reason=effective<requested?'low-adherence':(trend.overloadProbable&&index===0?'minimum-load-floor':'adherence-sustained');
  return Object.freeze({requestedBudget:requested,effectiveBudget:effective,adjusted:effective<requested,reason,classification:trend.classification,evidence,trend,authority:'execution-load-cap-only'});
}

function ensureNote(){
  const summary=document.getElementById('dailyAdaptiveSummary');if(!summary)return null;
  let note=document.getElementById('dailyAdaptiveWorkloadNote');if(note)return note;
  note=document.createElement('div');note.id='dailyAdaptiveWorkloadNote';note.className='daily-adaptive-workload-note';note.setAttribute('role','status');note.setAttribute('aria-live','polite');summary.insertAdjacentElement('afterend',note);return note;
}
function trendLabel(classification){return classification==='overload-probable'?'Sobrecarga provável':classification==='stable'?'Estável':'Evidência insuficiente'}
function renderDecision(decision=lastDecision){
  const note=ensureNote();if(!note||!decision)return decision;const trend=decision.trend;note.dataset.trend=decision.classification||'insufficient';
  if(!trend?.enoughEvidence){const count=trend?.dayCount||0;note.innerHTML=`<strong>Tendência: Evidência insuficiente.</strong> ${count}/${MIN_TREND_DAYS} dias de execução disponíveis nos últimos ${LOOKBACK_DAYS} dias. Carga mantida em ${decision.effectiveBudget} min.`;return decision}
  const basis=`${trend.dayCount} dias · ${Math.round(trend.weightedCompletionRate)}% de conclusões · ${Math.round(trend.weightedCompletionRatio*100)}% de execução média · ${Math.round(trend.weightedExecutionAdherence)}% de aderência · ${trend.interruptions} interrupção${trend.interruptions===1?'':'ões'}`;
  const label=trendLabel(decision.classification);
  if(decision.adjusted)note.innerHTML=`<strong>Tendência: ${label}. Carga adaptada: ${decision.requestedBudget} → ${decision.effectiveBudget} min.</strong> Janela ponderada: ${basis}. O tempo escolhido continua sendo o teto; a agenda do Retention Engine não foi alterada.`;
  else if(decision.reason==='minimum-load-floor')note.innerHTML=`<strong>Tendência: ${label}. Carga mantida no piso de ${decision.effectiveBudget} min.</strong> Janela ponderada: ${basis}. O app não reduz abaixo do mínimo diário.`;
  else note.innerHTML=`<strong>Tendência: ${label}. Carga mantida em ${decision.effectiveBudget} min.</strong> Janela ponderada: ${basis}. Dias recentes têm peso maior e um único dia ruim não reduz a carga.`;
  return decision;
}

function applyRequestedBudget(requestedBudget){
  const planner=global.AppDailyAdaptivePlanner;if(!planner?.buildDay||!planner?.render)return null;
  const decision=evaluate(requestedBudget);lastDecision=decision;
  const plan=planner.buildDay(decision.effectiveBudget);if(!plan)return null;
  plan.requestedBudget=decision.requestedBudget;plan.workloadAdjustment=decision;planner.render(plan);renderDecision(decision);
  global.dispatchEvent(new CustomEvent('adaptive-day-workload-adjusted',{detail:{requestedBudget:decision.requestedBudget,effectiveBudget:decision.effectiveBudget,adjusted:decision.adjusted,reason:decision.reason,classification:decision.classification,trendDays:decision.trend?.dayCount||0,stressedDays:decision.trend?.stressedDays||0,authority:decision.authority}}));
  return plan;
}
function onBudgetClick(event){
  const button=event.target?.closest?.('[data-day-budget]');if(!button)return;
  const planner=document.getElementById('dailyAdaptivePlanner');if(!planner||!planner.contains(button))return;
  event.preventDefault();event.stopImmediatePropagation();applyRequestedBudget(Number(button.dataset.dayBudget));
}
function onPlanRendered(){if(lastDecision)renderDecision(lastDecision)}
function waitForPlanner(attempt=0){
  if(global.AppDailyAdaptivePlanner){install();return}
  if(attempt>=40)return;setTimeout(()=>waitForPlanner(attempt+1),100);
}
function install(){
  if(installed||!global.AppDailyAdaptivePlanner)return false;installed=true;document.addEventListener('click',onBudgetClick,true);global.addEventListener('adaptive-day-plan-rendered',onPlanRendered);return true;
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>waitForPlanner(),{once:true});else waitForPlanner();
global.AppDailyWorkloadAdapter=Object.freeze({evaluate,trendEvidence,priorDaySummaries,latestPriorDayEvidence,applyRequestedBudget,renderDecision,MIN_ATTEMPTS,MIN_TREND_DAYS,LOOKBACK_DAYS,HEALTHY_THRESHOLD,INTERRUPTION_THRESHOLD,PRESETS});
})(window);

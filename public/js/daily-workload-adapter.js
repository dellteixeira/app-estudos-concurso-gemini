(function installDailyWorkloadAdapter(global){
'use strict';
if(global.AppDailyWorkloadAdapter)return;

const PRESETS=[60,120,180];
const MIN_ATTEMPTS=2;
const LOOKBACK_DAYS=7;
let installed=false;
let lastRequestedBudget=0;
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

function latestPriorDayEvidence(){
  const today=localDayKey();const groups=new Map();
  executionHistory().forEach(item=>{
    if(item?.owner!=='daily-plan')return;
    const stamp=item?.finishedAt||item?.startedAt;const key=localDayKey(stamp);const age=ageDays(stamp);
    if(!key||key===today||age<1||age>LOOKBACK_DAYS)return;
    const bucket=groups.get(key)||{day:key,records:[],latest:0};bucket.records.push(item);bucket.latest=Math.max(bucket.latest,Date.parse(stamp)||0);groups.set(key,bucket);
  });
  const selected=[...groups.values()].sort((a,b)=>b.latest-a.latest)[0];if(!selected)return null;
  const records=selected.records;const attempts=records.length;const completed=records.filter(item=>item?.status==='completed').length;const interruptions=records.filter(item=>item?.status==='interrupted'||item?.status==='abandoned').length;
  const plannedMinutes=records.reduce((sum,item)=>sum+(Number(item?.plannedMinutes)||0),0);const realizedMinutes=records.reduce((sum,item)=>sum+(Number(item?.elapsedMinutes)||0),0);
  const averageCompletionRatio=attempts?records.reduce((sum,item)=>sum+clamp(item?.completionRatio,0,1),0)/attempts:0;
  return Object.freeze({
    day:selected.day,
    attempts,
    completed,
    interruptions,
    completionRate:attempts?Math.round(completed/attempts*100):0,
    executionAdherence:plannedMinutes?Math.min(100,Math.round(realizedMinutes/plannedMinutes*100)):0,
    averageCompletionRatio:Number(averageCompletionRatio.toFixed(2)),
    plannedMinutes:Number(plannedMinutes.toFixed(1)),
    realizedMinutes:Number(realizedMinutes.toFixed(1)),
    authority:'execution-evidence-only'
  });
}

function evaluate(requestedBudget){
  const requested=safePreset(requestedBudget);const evidence=latestPriorDayEvidence();
  if(!evidence||evidence.attempts<MIN_ATTEMPTS)return Object.freeze({requestedBudget:requested,effectiveBudget:requested,adjusted:false,reason:'insufficient-prior-evidence',evidence,authority:'execution-load-cap-only'});
  const interruptionRate=evidence.attempts?evidence.interruptions/evidence.attempts:0;
  const low=evidence.completionRate<75||evidence.averageCompletionRatio<.75||evidence.executionAdherence<75||evidence.interruptions>=2;
  const severe=evidence.completionRate<50||evidence.averageCompletionRatio<.55||evidence.executionAdherence<55||interruptionRate>=.5;
  const index=PRESETS.indexOf(requested);const effective=low&&index>0?PRESETS[index-1]:requested;
  return Object.freeze({requestedBudget:requested,effectiveBudget:effective,adjusted:effective<requested,reason:effective<requested?(severe?'low-adherence':'moderate-adherence'):'adherence-sustained',evidence,authority:'execution-load-cap-only'});
}

function ensureNote(){
  const summary=document.getElementById('dailyAdaptiveSummary');if(!summary)return null;
  let note=document.getElementById('dailyAdaptiveWorkloadNote');if(note)return note;
  note=document.createElement('div');note.id='dailyAdaptiveWorkloadNote';note.className='daily-adaptive-workload-note';note.setAttribute('role','status');note.setAttribute('aria-live','polite');summary.insertAdjacentElement('afterend',note);return note;
}
function renderDecision(decision=lastDecision){
  const note=ensureNote();if(!note||!decision)return decision;const evidence=decision.evidence;
  if(!evidence){note.textContent=`Carga mantida em ${decision.effectiveBudget} min: ainda não há um dia anterior com evidência de execução suficiente.`;return decision}
  if(evidence.attempts<MIN_ATTEMPTS){note.textContent=`Carga mantida em ${decision.effectiveBudget} min: o último dia estudado tem apenas ${evidence.attempts} execução${evidence.attempts===1?'':'ões'}; são necessárias ${MIN_ATTEMPTS} para adaptação automática.`;return decision}
  const basis=`${evidence.completionRate}% de conclusões · ${Math.round(evidence.averageCompletionRatio*100)}% de execução média · ${evidence.interruptions} interrupção${evidence.interruptions===1?'':'ões'}`;
  if(decision.adjusted)note.innerHTML=`<strong>Carga adaptada: ${decision.requestedBudget} → ${decision.effectiveBudget} min.</strong> Evidência do último dia estudado: ${basis}. O tempo escolhido continua sendo o teto; a agenda do Retention Engine não foi alterada.`;
  else note.innerHTML=`<strong>Carga mantida em ${decision.effectiveBudget} min.</strong> Evidência do último dia estudado: ${basis}.`;
  return decision;
}

function applyRequestedBudget(requestedBudget){
  const planner=global.AppDailyAdaptivePlanner;if(!planner?.buildDay||!planner?.render)return null;
  const decision=evaluate(requestedBudget);lastRequestedBudget=decision.requestedBudget;lastDecision=decision;
  const plan=planner.buildDay(decision.effectiveBudget);if(!plan)return null;
  plan.requestedBudget=decision.requestedBudget;plan.workloadAdjustment=decision;planner.render(plan);renderDecision(decision);
  global.dispatchEvent(new CustomEvent('adaptive-day-workload-adjusted',{detail:{requestedBudget:decision.requestedBudget,effectiveBudget:decision.effectiveBudget,adjusted:decision.adjusted,reason:decision.reason,evidenceDay:decision.evidence?.day||'',authority:decision.authority}}));
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
global.AppDailyWorkloadAdapter=Object.freeze({evaluate,latestPriorDayEvidence,applyRequestedBudget,renderDecision,MIN_ATTEMPTS,LOOKBACK_DAYS,PRESETS});
})(window);

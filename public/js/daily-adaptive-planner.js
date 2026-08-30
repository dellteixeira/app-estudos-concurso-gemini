(function installDailyAdaptivePlanner(global){
'use strict';
if(global.AppDailyAdaptivePlanner)return;

const DAY_BUDGETS=[60,120,180];
const SESSION_SLICE=60;
const MIN_BLOCK_MINUTES=5;
const MIN_COMPLETION_RATIO=.7;
const STORAGE_KEY='adaptive_daily_plan_execution_v1';
let currentPlan=null;
let activeBlockId='';

function safe(value,max=160){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function todayKey(){const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`}
function localDayKey(value){const date=new Date(value);if(Number.isNaN(date.getTime()))return'';return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function readState(){try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return value&&typeof value==='object'&&value.day===todayKey()?value:{day:todayKey(),completed:[],activeBlockId:''}}catch(_){return{day:todayKey(),completed:[],activeBlockId:''}}}
function writeState(value){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({...value,day:todayKey(),updatedAt:new Date().toISOString()}));return true}catch(_){return false}}
function blockId(block){return safe(`${block?.candidate?.topicId||''}::${Number(block?.segmentIndex)||0}::${Number(block?.priorityIndex)||0}`,700)}
function calibrate(intervention){return global.AppMethodCalibration?.calibrate?.(intervention)||intervention}
function adaptToExam(intervention){return global.AppExamProximityStrategy?.adapt?.(intervention)||intervention}
function ensureExamStrategy(){
  if(global.AppExamProximityStrategy||document.querySelector('script[data-exam-proximity-strategy]'))return;
  const script=document.createElement('script');script.src='./js/exam-proximity-strategy.js?v=20260830';script.defer=true;script.dataset.examProximityStrategy='1';script.onerror=()=>console.warn('Não foi possível carregar a estratégia de proximidade da prova.');document.head.appendChild(script);
}
function ensureCandidateProvider(){
  if(global.AppDiagnosticCandidateProvider||document.querySelector('script[data-diagnostic-candidate-provider]'))return;
  const script=document.createElement('script');script.src='./js/diagnostic-candidate-provider.js?v=20260830';script.defer=true;script.dataset.diagnosticCandidateProvider='1';script.onerror=()=>console.warn('Não foi possível ampliar os candidatos do plano diário.');document.head.appendChild(script);
}
function ensureCompletion(){
  if(global.AppAdaptiveSessionCompletion||document.querySelector('script[data-session-completion]'))return;
  const script=document.createElement('script');script.src='./js/session-completion.js?v=20260830';script.defer=true;script.dataset.sessionCompletion='1';script.onerror=()=>console.warn('Não foi possível carregar a conclusão do plano diário.');document.head.appendChild(script);
}
function rankedCandidates(limit=40){return global.AppDiagnosticCandidateProvider?.collectByFriction?.(limit)||global.AppLearningAdvisor?.collectCandidates?.(5)||[]}

function splitDuration(totalMinutes){
  const total=Math.max(MIN_BLOCK_MINUTES,Math.round(Number(totalMinutes)||0));
  const count=Math.max(1,Math.ceil(total/SESSION_SLICE));
  const base=Math.floor(total/count);
  const extra=total-(base*count);
  return Array.from({length:count},(_,index)=>base+(index<extra?1:0)).filter(value=>value>=MIN_BLOCK_MINUTES);
}

function applyExecutionState(plan){
  if(!plan?.blocks?.length)return plan;
  const state=readState();
  const completed=new Set(Array.isArray(state.completed)?state.completed:[]);
  activeBlockId=safe(state.activeBlockId,700);
  plan.blocks.forEach(block=>{const id=blockId(block);block.executionId=id;block.completed=completed.has(id);block.active=Boolean(activeBlockId&&id===activeBlockId&&!block.completed)});
  return plan;
}
function persistPlanState(plan){
  if(!plan?.blocks?.length)return false;
  const previous=readState();
  const validIds=new Set(plan.blocks.map(blockId));
  const completed=(Array.isArray(previous.completed)?previous.completed:[]).filter(id=>validIds.has(id));
  const persistedActive=validIds.has(activeBlockId)?activeBlockId:'';
  return writeState({...previous,budget:Number(plan.budget)||120,completed,activeBlockId:persistedActive});
}
function completedMinutes(plan){return plan?.blocks?.reduce((sum,block)=>sum+(block.completed?Number(block.minutes)||0:0),0)||0}
function remainingMinutes(plan){return Math.max(0,(Number(plan?.used)||0)-completedMinutes(plan))}
function dailyExecutionHistory(){return (global.AppAdaptiveSessionCompletion?.getHistory?.()||[]).filter(item=>item?.owner==='daily-plan'&&localDayKey(item?.finishedAt||item?.startedAt)===todayKey())}
function performanceSummary(plan=currentPlan){
  const records=dailyExecutionHistory();const totalBlocks=plan?.blocks?.length||0;const completedBlocks=plan?.blocks?.filter(block=>block.completed).length||0;
  const realizedMinutes=Number(records.reduce((sum,item)=>sum+(Number(item?.elapsedMinutes)||0),0).toFixed(1));
  const interruptions=records.filter(item=>item?.status==='interrupted'||item?.status==='abandoned').length;
  const completedExecutions=records.filter(item=>item?.status==='completed').length;
  const completionRate=totalBlocks?Math.round(completedBlocks/totalBlocks*100):0;
  const adherence=plan?.used?Math.min(100,Math.round(realizedMinutes/Number(plan.used)*100)):0;
  const averageCompletionRatio=records.length?Number((records.reduce((sum,item)=>sum+(Number(item?.completionRatio)||0),0)/records.length).toFixed(2)):0;
  return Object.freeze({day:todayKey(),plannedMinutes:Number(plan?.used)||0,realizedMinutes,totalBlocks,completedBlocks,completedExecutions,interruptions,attempts:records.length,completionRate,adherence,averageCompletionRatio,authority:'execution-evidence-only'});
}

function buildDay(totalMinutes=120){
  const advisor=global.AppLearningAdvisor;
  if(!advisor?.localIntervention)return null;
  const budget=DAY_BUDGETS.includes(Number(totalMinutes))?Number(totalMinutes):120;
  const candidates=rankedCandidates(40);
  const blocks=[];let used=0;
  for(const candidate of candidates){
    const intervention=calibrate(adaptToExam(advisor.localIntervention(candidate)));if(!intervention)continue;
    const desired=Math.max(MIN_BLOCK_MINUTES,Math.round(Number(intervention.suggestedMinutes)||15));
    const remaining=budget-used;if(remaining<MIN_BLOCK_MINUTES)break;
    const planned=Math.min(desired,remaining);const slices=splitDuration(planned);
    slices.forEach((minutes,segmentIndex)=>{blocks.push({candidate,intervention:{...intervention,suggestedMinutes:minutes},minutes,priorityIndex:blocks.length,segmentIndex,segmentCount:slices.length,totalRecommendedMinutes:planned});used+=minutes});
    if(used>=budget)break;
  }
  const sessions=[];let session={index:0,minutes:0,blocks:[]};
  for(const block of blocks){if(session.blocks.length&&session.minutes+block.minutes>SESSION_SLICE){sessions.push(session);session={index:sessions.length,minutes:0,blocks:[]}}session.blocks.push(block);session.minutes+=block.minutes}
  if(session.blocks.length)sessions.push(session);
  currentPlan={budget,used,remaining:Math.max(0,budget-used),blocks,sessions,authority:'learning-advisor-friction-order',scheduleAuthority:'retention-engine',examContext:global.AppExamProximityStrategy?.getContext?.()||null};
  applyExecutionState(currentPlan);persistPlanState(currentPlan);return currentPlan;
}

function ensurePanel(){
  const host=document.getElementById('adaptiveSessionOrchestrator')||document.getElementById('adaptiveAiExperience');if(!host)return null;
  let panel=document.getElementById('dailyAdaptivePlanner');if(panel)return panel;
  panel=document.createElement('section');panel.id='dailyAdaptivePlanner';panel.className='daily-adaptive-planner';
  panel.innerHTML=`<div class="adaptive-session-head"><span class="dashboard-v2-section-label">Plano do dia</span><span class="adaptive-session-authority">ordem do Learning Advisor · agenda do Retention Engine</span></div><div class="adaptive-session-budget" role="group" aria-label="Tempo de estudo no dia">${DAY_BUDGETS.map(value=>`<button type="button" class="btn btn-secondary btn-sm" data-day-budget="${value}">${value} min</button>`).join('')}</div><div id="dailyAdaptiveSummary" class="adaptive-session-summary">Escolha o tempo disponível hoje.</div><div id="dailyAdaptiveProgress" class="daily-adaptive-progress" role="progressbar" aria-label="Progresso do plano do dia" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div><section id="dailyAdaptivePerformance" class="daily-adaptive-performance" aria-label="Resumo de desempenho do Plano do Dia"><div class="daily-performance-head"><strong>Desempenho de hoje</strong><span>evidência de execução · não altera a agenda</span></div><div class="daily-performance-grid"><div><span>Conclusão</span><strong id="dailyPerformanceCompletion">0%</strong></div><div><span>Minutos realizados</span><strong id="dailyPerformanceMinutes">0 min</strong></div><div><span>Interrupções</span><strong id="dailyPerformanceInterruptions">0</strong></div><div><span>Aderência ao plano</span><strong id="dailyPerformanceAdherence">0%</strong></div></div><p id="dailyPerformanceNote">O resumo será atualizado conforme os blocos forem executados.</p></section><div id="dailyAdaptiveSessions" class="daily-adaptive-sessions"></div><div id="dailyAdaptiveControls" class="daily-adaptive-controls"><button id="dailyAdaptiveComplete" class="btn btn-success btn-sm" type="button">Concluir bloco atual</button><button id="dailyAdaptiveNext" class="btn btn-secondary btn-sm" type="button">Iniciar próximo</button></div>`;
  host.appendChild(panel);panel.querySelectorAll('[data-day-budget]').forEach(button=>button.addEventListener('click',()=>render(buildDay(Number(button.dataset.dayBudget)))));panel.querySelector('#dailyAdaptiveComplete')?.addEventListener('click',finishActive);panel.querySelector('#dailyAdaptiveNext')?.addEventListener('click',startNext);return panel;
}
function renderPerformance(plan){
  const metrics=performanceSummary(plan);const completion=document.getElementById('dailyPerformanceCompletion');const minutes=document.getElementById('dailyPerformanceMinutes');const interruptions=document.getElementById('dailyPerformanceInterruptions');const adherence=document.getElementById('dailyPerformanceAdherence');const note=document.getElementById('dailyPerformanceNote');
  if(completion)completion.textContent=`${metrics.completionRate}%`;if(minutes)minutes.textContent=`${metrics.realizedMinutes} min`;if(interruptions)interruptions.textContent=String(metrics.interruptions);if(adherence)adherence.textContent=`${metrics.adherence}%`;
  if(note)note.textContent=metrics.attempts?`${metrics.completedBlocks}/${metrics.totalBlocks} blocos concluídos · ${metrics.attempts} execução${metrics.attempts===1?'':'ões'} registrada${metrics.attempts===1?'':'s'} · média de execução ${Math.round(metrics.averageCompletionRatio*100)}%.`:'Ainda não há execução registrada hoje.';
  global.dispatchEvent(new CustomEvent('adaptive-day-performance-updated',{detail:metrics}));return metrics;
}

function startBlock(index){
  const block=currentPlan?.blocks?.[Number(index)];if(!block||block.completed)return null;
  const completion=global.AppAdaptiveSessionCompletion;if(!completion?.begin){ensureCompletion();return null}
  const existing=completion.getActiveExecution?.();if(existing)return existing.owner==='daily-plan'&&existing.executionId===blockId(block)?existing:null;
  const id=blockId(block);const execution=completion.begin({...block,executionOwner:'daily-plan',executionId:id});if(!execution||execution.owner!=='daily-plan')return null;
  const state=readState();activeBlockId=id;writeState({...state,budget:Number(currentPlan.budget)||120,activeBlockId:id});
  const plan={candidate:block.candidate,intervention:block.intervention,source:'daily-plan'};global.AppAdaptiveAIExperience?.setCurrentPlan?.(plan);global.AppAdaptiveFeedbackLoop?.recordStart?.(plan);
  render(currentPlan);global.dispatchEvent(new CustomEvent('adaptive-day-block-started',{detail:{index:Number(index),topicId:safe(block.candidate?.topicId,600),executionId:id,minutes:block.minutes}}));return execution;
}
function startNext(){
  if(!currentPlan?.blocks?.length)return null;applyExecutionState(currentPlan);
  let index=currentPlan.blocks.findIndex(block=>block.active&&!block.completed);if(index<0)index=currentPlan.blocks.findIndex(block=>!block.completed);if(index<0)return null;return startBlock(index);
}
function completionState(){
  const execution=global.AppAdaptiveSessionCompletion?.getActiveExecution?.();
  if(!execution||execution.owner!=='daily-plan')return {eligible:false,elapsedMinutes:0,plannedMinutes:0,ratio:0};
  const elapsedMinutes=Number(global.AppAdaptivePomodoroBridge?.elapsedMinutes?.()||0);const plannedMinutes=Math.max(MIN_BLOCK_MINUTES,Number(execution.plannedMinutes)||15);const ratio=plannedMinutes?Math.max(0,Math.min(1,elapsedMinutes/plannedMinutes)):0;
  return {eligible:ratio>=MIN_COMPLETION_RATIO,elapsedMinutes,plannedMinutes,ratio};
}
function finishActive(){
  const state=completionState();if(!state.eligible){global.dispatchEvent(new CustomEvent('adaptive-day-completion-blocked',{detail:{elapsedMinutes:Number(state.elapsedMinutes.toFixed(1)),plannedMinutes:state.plannedMinutes,minRatio:MIN_COMPLETION_RATIO}}));return false}
  return global.AppAdaptiveSessionCompletion?.finish?.('completed',{elapsedMinutes:state.elapsedMinutes})||false;
}
function onExecutionFinished(event){
  const detail=event?.detail||{};if(detail.owner!=='daily-plan'||!currentPlan?.blocks?.length)return;
  const state=readState();const id=safe(detail.executionId||activeBlockId,700);const completed=new Set(Array.isArray(state.completed)?state.completed:[]);
  if(detail.status==='completed'&&id)completed.add(id);
  activeBlockId='';writeState({...state,budget:Number(currentPlan.budget)||120,completed:[...completed],activeBlockId:''});applyExecutionState(currentPlan);render(currentPlan);
  global.dispatchEvent(new CustomEvent(detail.status==='completed'?'adaptive-day-block-completed':'adaptive-day-block-interrupted',{detail:{executionId:id,topicId:safe(detail.topicId,600),status:safe(detail.status,20),completedMinutes:completedMinutes(currentPlan),budget:currentPlan.budget}}));
  if(detail.status==='completed')setTimeout(startNext,0);
}

function render(plan){
  ensurePanel();const summary=document.getElementById('dailyAdaptiveSummary');const progress=document.getElementById('dailyAdaptiveProgress');const list=document.getElementById('dailyAdaptiveSessions');if(!summary||!list)return plan;
  if(!plan?.blocks?.length){summary.textContent='Ainda não há dados suficientes para montar o plano do dia.';list.replaceChildren();if(progress){progress.setAttribute('aria-valuenow','0');progress.querySelector('span').style.width='0%'}renderPerformance(plan);return plan}
  applyExecutionState(plan);persistPlanState(plan);const done=completedMinutes(plan);const pct=plan.used?Math.round(done/plan.used*100):0;const phase=plan.examContext?.phase?` · ${plan.examContext.label}`:'';summary.textContent=`${done}/${plan.used} min concluídos · ${remainingMinutes(plan)} min restantes${phase}`;
  if(progress){progress.setAttribute('aria-valuenow',String(pct));const fill=progress.querySelector('span');if(fill)fill.style.width=`${pct}%`}
  renderPerformance(plan);
  list.innerHTML=plan.sessions.map(session=>`<article class="daily-adaptive-session"><strong>Sessão ${session.index+1} · ${session.minutes} min</strong>${session.blocks.map(block=>{const index=plan.blocks.indexOf(block);const part=block.segmentCount>1?` · parte ${block.segmentIndex+1}/${block.segmentCount}`:'';const state=block.completed?'Concluído':block.active?'Em andamento':'Iniciar';const locked=Boolean(activeBlockId&&!block.active&&!block.completed);return `<button type="button" class="daily-adaptive-block${block.completed?' is-completed':''}${block.active?' is-active':''}" data-day-block-index="${index}" ${block.completed||locked?'disabled':''}><span>${block.priorityIndex+1}. ${safe(block.candidate.materia,70)} — ${safe(block.candidate.assunto,110)}${part}</span><span>${block.minutes} min · ${state}</span></button>`}).join('')}</article>`).join('');
  list.querySelectorAll('[data-day-block-index]').forEach(button=>button.addEventListener('click',()=>startBlock(Number(button.dataset.dayBlockIndex))));
  const complete=document.getElementById('dailyAdaptiveComplete');if(complete){const execution=global.AppAdaptiveSessionCompletion?.getActiveExecution?.();complete.disabled=!activeBlockId||execution?.owner!=='daily-plan';complete.title='A conclusão exige pelo menos 70% da duração planejada registrada pelo Pomodoro.'}
  const next=document.getElementById('dailyAdaptiveNext');if(next)next.disabled=!plan.blocks.some(block=>!block.completed)||Boolean(activeBlockId)||Boolean(global.AppAdaptiveSessionCompletion?.getActiveExecution?.());
  global.dispatchEvent(new CustomEvent('adaptive-day-plan-rendered',{detail:{budget:plan.budget,count:plan.blocks.length,sessions:plan.sessions.length,maxSessionMinutes:Math.max(...plan.sessions.map(session=>session.minutes)),completedMinutes:done,remainingMinutes:remainingMinutes(plan)}}));return plan;
}

function init(){ensurePanel();ensureExamStrategy();ensureCandidateProvider();ensureCompletion();global.addEventListener('adaptive-exam-date-changed',()=>{if(currentPlan)render(buildDay(currentPlan.budget))});global.addEventListener('adaptive-session-execution-finished',onExecutionFinished)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
global.AppDailyAdaptivePlanner=Object.freeze({buildDay,render,rankedCandidates,splitDuration,startBlock,startNext,finishActive,completionState,performanceSummary,dailyExecutionHistory,getCurrentPlan:()=>currentPlan,SESSION_SLICE,MIN_BLOCK_MINUTES,MIN_COMPLETION_RATIO});
})(window);

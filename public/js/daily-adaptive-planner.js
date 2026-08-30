(function installDailyAdaptivePlanner(global){
'use strict';
if(global.AppDailyAdaptivePlanner)return;

const DAY_BUDGETS=[60,120,180];
const SESSION_SLICE=60;
const MIN_BLOCK_MINUTES=5;
let currentPlan=null;

function safe(value,max=160){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
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
function rankedCandidates(limit=40){return global.AppDiagnosticCandidateProvider?.collectByFriction?.(limit)||global.AppLearningAdvisor?.collectCandidates?.(5)||[]}

function splitDuration(totalMinutes){
  const total=Math.max(MIN_BLOCK_MINUTES,Math.round(Number(totalMinutes)||0));
  const count=Math.max(1,Math.ceil(total/SESSION_SLICE));
  const base=Math.floor(total/count);
  const extra=total-(base*count);
  return Array.from({length:count},(_,index)=>base+(index<extra?1:0)).filter(value=>value>=MIN_BLOCK_MINUTES);
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
  return currentPlan;
}

function ensurePanel(){
  const host=document.getElementById('adaptiveSessionOrchestrator')||document.getElementById('adaptiveAiExperience');if(!host)return null;
  let panel=document.getElementById('dailyAdaptivePlanner');if(panel)return panel;
  panel=document.createElement('section');panel.id='dailyAdaptivePlanner';panel.className='daily-adaptive-planner';
  panel.innerHTML=`<div class="adaptive-session-head"><span class="dashboard-v2-section-label">Plano do dia</span><span class="adaptive-session-authority">ordem do Learning Advisor · agenda do Retention Engine</span></div><div class="adaptive-session-budget" role="group" aria-label="Tempo de estudo no dia">${DAY_BUDGETS.map(value=>`<button type="button" class="btn btn-secondary btn-sm" data-day-budget="${value}">${value} min</button>`).join('')}</div><div id="dailyAdaptiveSummary" class="adaptive-session-summary">Escolha o tempo disponível hoje.</div><div id="dailyAdaptiveSessions" class="daily-adaptive-sessions"></div>`;
  host.appendChild(panel);panel.querySelectorAll('[data-day-budget]').forEach(button=>button.addEventListener('click',()=>render(buildDay(Number(button.dataset.dayBudget)))));return panel;
}

function render(plan){
  ensurePanel();const summary=document.getElementById('dailyAdaptiveSummary');const list=document.getElementById('dailyAdaptiveSessions');if(!summary||!list)return plan;
  if(!plan?.blocks?.length){summary.textContent='Ainda não há dados suficientes para montar o plano do dia.';list.replaceChildren();return plan}
  const phase=plan.examContext?.phase?` · ${plan.examContext.label}`:'';summary.textContent=`${plan.sessions.length} sessão${plan.sessions.length===1?'':'ões'} · ${plan.used}/${plan.budget} min planejados${phase}`;
  list.innerHTML=plan.sessions.map(session=>`<article class="daily-adaptive-session"><strong>Sessão ${session.index+1} · ${session.minutes} min</strong>${session.blocks.map(block=>{const part=block.segmentCount>1?` · parte ${block.segmentIndex+1}/${block.segmentCount}`:'';return `<div class="daily-adaptive-block"><span>${block.priorityIndex+1}. ${safe(block.candidate.materia,70)} — ${safe(block.candidate.assunto,110)}${part}</span><span>${block.minutes} min</span></div>`}).join('')}</article>`).join('');
  global.dispatchEvent(new CustomEvent('adaptive-day-plan-rendered',{detail:{budget:plan.budget,count:plan.blocks.length,sessions:plan.sessions.length,maxSessionMinutes:Math.max(...plan.sessions.map(session=>session.minutes))}}));return plan;
}

function init(){ensurePanel();ensureExamStrategy();ensureCandidateProvider();global.addEventListener('adaptive-exam-date-changed',()=>{if(currentPlan)render(buildDay(currentPlan.budget))})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
global.AppDailyAdaptivePlanner=Object.freeze({buildDay,render,rankedCandidates,splitDuration,getCurrentPlan:()=>currentPlan,SESSION_SLICE,MIN_BLOCK_MINUTES});
})(window);

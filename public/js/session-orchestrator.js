(function installSessionOrchestrator(global){
'use strict';
if(global.AppSessionOrchestrator)return;

const DEFAULT_BUDGET=40;
const BUDGETS=[20,40,60];
const ACTION_LABELS={active_recall:'Recuperação ativa',short_review:'Revisão curta',questions:'Questões comentadas',focused_restudy:'Reestudo focalizado'};
let currentSession=null;

function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0))}
function safe(value,max=160){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function calibrate(intervention){return global.AppMethodCalibration?.calibrate?.(intervention)||intervention}
function ensureContinuity(){
  if(global.AppSessionContinuity||document.querySelector('script[data-session-continuity]'))return;
  const script=document.createElement('script');
  script.src='./js/session-continuity.js?v=20260830';
  script.defer=true;
  script.dataset.sessionContinuity='1';
  script.onerror=()=>console.warn('Não foi possível carregar a continuidade da sessão adaptativa.');
  document.head.appendChild(script);
}

function buildQueue(minutes=DEFAULT_BUDGET){
  const advisor=global.AppLearningAdvisor;
  if(!advisor?.collectCandidates||!advisor?.localIntervention)return null;
  const budget=BUDGETS.includes(Number(minutes))?Number(minutes):DEFAULT_BUDGET;
  const candidates=advisor.collectCandidates?.(5)||[];
  const blocks=[];
  let used=0;
  for(const candidate of candidates){
    const intervention=calibrate(advisor.localIntervention(candidate));
    if(!intervention)continue;
    const desired=Math.max(5,Math.round(Number(intervention.suggestedMinutes)||15));
    const remaining=budget-used;
    if(remaining<5)break;
    const allocated=Math.min(desired,remaining);
    blocks.push({candidate,intervention:{...intervention,suggestedMinutes:allocated},minutes:allocated,priorityIndex:blocks.length});
    used+=allocated;
    if(used>=budget)break;
  }
  currentSession={budget,used,remaining:Math.max(0,budget-used),blocks,authority:'retention-engine-order'};
  return currentSession;
}

function ensurePanel(){
  const host=document.getElementById('adaptiveAiExperience');
  if(!host)return null;
  let panel=document.getElementById('adaptiveSessionOrchestrator');
  if(panel)return panel;
  panel=document.createElement('section');
  panel.id='adaptiveSessionOrchestrator';
  panel.className='adaptive-session-orchestrator';
  panel.innerHTML=`
    <div class="adaptive-session-head">
      <span class="dashboard-v2-section-label">Sessão adaptativa</span>
      <span class="adaptive-session-authority">ordem do Retention Engine</span>
    </div>
    <div class="adaptive-session-budget" role="group" aria-label="Tempo disponível">
      ${BUDGETS.map(value=>`<button type="button" class="btn btn-secondary btn-sm" data-session-budget="${value}">${value} min</button>`).join('')}
    </div>
    <div id="adaptiveSessionSummary" class="adaptive-session-summary">Escolha o tempo disponível para montar a sessão.</div>
    <div id="adaptiveSessionBlocks" class="adaptive-session-blocks"></div>`;
  host.appendChild(panel);
  panel.querySelectorAll('[data-session-budget]').forEach(button=>button.addEventListener('click',()=>render(buildQueue(Number(button.dataset.sessionBudget)))));
  return panel;
}

function render(session){
  ensurePanel();
  const summary=document.getElementById('adaptiveSessionSummary');
  const list=document.getElementById('adaptiveSessionBlocks');
  if(!summary||!list)return session;
  if(!session?.blocks?.length){
    summary.textContent='Ainda não há blocos suficientes para montar uma sessão adaptativa.';
    list.replaceChildren();
    global.dispatchEvent(new CustomEvent('adaptive-session-rendered',{detail:{budget:session?.budget||DEFAULT_BUDGET,count:0}}));
    return session;
  }
  summary.textContent=`${session.blocks.length} bloco${session.blocks.length===1?'':'s'} · ${session.used}/${session.budget} min planejados`;
  list.innerHTML=session.blocks.map((block,index)=>`
    <button type="button" class="adaptive-session-block" data-session-index="${index}">
      <span class="adaptive-session-rank">${index+1}</span>
      <span class="adaptive-session-copy">
        <strong>${safe(block.candidate.materia,80)} — ${safe(block.candidate.assunto,120)}</strong>
        <span>${ACTION_LABELS[block.intervention.recommendedAction]||'Revisão adaptativa'} · ${block.minutes} min</span>
      </span>
      <span class="adaptive-session-use">Usar</span>
    </button>`).join('');
  list.querySelectorAll('[data-session-index]').forEach(button=>button.addEventListener('click',()=>promote(Number(button.dataset.sessionIndex))));
  global.dispatchEvent(new CustomEvent('adaptive-session-rendered',{detail:{budget:session.budget,count:session.blocks.length}}));
  return session;
}

function promote(index=0){
  const block=currentSession?.blocks?.[index];
  if(!block)return null;
  const plan={candidate:block.candidate,intervention:block.intervention,source:'retention-engine'};
  global.AppAdaptiveAIExperience?.setCurrentPlan?.(plan);
  global.dispatchEvent(new CustomEvent('adaptive-session-promoted',{detail:{index,topicId:safe(block.candidate?.topicId,600)}}));
  return plan;
}

function init(){
  ensurePanel();
  ensureContinuity();
  setTimeout(()=>render(buildQueue(DEFAULT_BUDGET)),700);
  global.addEventListener('adaptive-feedback-evaluated',()=>setTimeout(()=>render(buildQueue(currentSession?.budget||DEFAULT_BUDGET)),0));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
global.AppSessionOrchestrator=Object.freeze({buildQueue,render,promote,getCurrentSession:()=>currentSession});
})(window);

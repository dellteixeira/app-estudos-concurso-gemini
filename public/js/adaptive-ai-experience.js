(function installAdaptiveAiExperience(global){
'use strict';
if(global.AppAdaptiveAIExperience)return;

const ACTION_LABELS={
  active_recall:'Recuperação ativa',
  short_review:'Revisão curta',
  questions:'Questões comentadas',
  focused_restudy:'Reestudo focalizado'
};
let currentPlan=null;
let busy=false;

function qs(id){return document.getElementById(id)}
function setText(id,value){const el=qs(id);if(el)el.textContent=value}
function safe(value,max=240){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function ensureStyle(){
  if(document.querySelector('link[data-adaptive-ai-style]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./css/adaptive-ai-experience.css?v=20260830';
  link.dataset.adaptiveAiStyle='1';
  document.head.appendChild(link);
}
function ensureFeedbackLoop(){
  if(global.AppAdaptiveFeedbackLoop||document.querySelector('script[data-adaptive-feedback-loop]'))return;
  const script=document.createElement('script');
  script.src='./js/adaptive-feedback-loop.js?v=20260830';
  script.defer=true;
  script.dataset.adaptiveFeedbackLoop='1';
  script.onerror=()=>console.warn('Não foi possível carregar o feedback loop adaptativo.');
  document.head.appendChild(script);
}

async function ensureAdvisor(){
  if(global.AppLearningAdvisor)return global.AppLearningAdvisor;
  const loader=global.AppPerformanceLoader;
  if(loader?.loadBundle){
    await loader.loadBundle('ai');
    return global.AppLearningAdvisor||null;
  }
  return null;
}

function ensurePanel(){
  const host=qs('dashboardV2NextAction')?.closest('.dashboard-v2-next');
  if(!host)return null;
  let panel=qs('adaptiveAiExperience');
  if(panel)return panel;
  panel=document.createElement('div');
  panel.id='adaptiveAiExperience';
  panel.className='adaptive-ai-experience';
  panel.innerHTML=`
    <div class="adaptive-ai-head">
      <span class="dashboard-v2-section-label">Plano adaptativo</span>
      <span id="adaptiveAiSource" class="adaptive-ai-source">Retention Engine</span>
    </div>
    <strong id="adaptiveAiTopic">Pronto para calcular</strong>
    <p id="adaptiveAiMethod">Escolha o próximo bloco e o app definirá tópico, método e duração.</p>
    <div class="adaptive-ai-meta">
      <span id="adaptiveAiAction">Método —</span>
      <span id="adaptiveAiMinutes">— min</span>
    </div>
    <div class="adaptive-ai-actions">
      <button id="adaptiveAiCalculate" class="btn btn-primary btn-sm" type="button">Calcular plano</button>
      <button id="adaptiveAiRefine" class="btn btn-secondary btn-sm" type="button" hidden>Refinar com IA</button>
    </div>`;
  host.appendChild(panel);
  qs('adaptiveAiCalculate')?.addEventListener('click',()=>refresh({refine:false}));
  qs('adaptiveAiRefine')?.addEventListener('click',()=>refresh({refine:true}));
  return panel;
}

function choosePlan(advisor){
  const candidates=advisor.collectCandidates?.(1)||[];
  const candidate=candidates[0];
  if(!candidate)return null;
  const intervention=advisor.localIntervention?.(candidate);
  if(!intervention)return null;
  return {candidate,intervention,source:'retention-engine'};
}

function renderPlan(plan){
  currentPlan=plan||null;
  if(!plan){
    setText('adaptiveAiTopic','Nenhum ponto crítico disponível');
    setText('adaptiveAiMethod','O ciclo está estável ou ainda não há dados suficientes para uma recomendação individual.');
    setText('adaptiveAiAction','Método —');
    setText('adaptiveAiMinutes','— min');
    setText('adaptiveAiSource','Retention Engine');
    const refine=qs('adaptiveAiRefine');if(refine)refine.hidden=true;
    return;
  }
  const {candidate,intervention}=plan;
  setText('adaptiveAiTopic',`${safe(candidate.materia,90)} — ${safe(candidate.assunto,140)}`);
  setText('adaptiveAiMethod',safe(intervention.method||intervention.rationale,300));
  setText('adaptiveAiAction',ACTION_LABELS[intervention.recommendedAction]||'Revisão adaptativa');
  setText('adaptiveAiMinutes',`${Math.max(5,Number(intervention.suggestedMinutes)||15)} min`);
  setText('adaptiveAiSource',plan.source==='ai'?'IA auxiliar + Retention Engine':'Retention Engine');
  const refine=qs('adaptiveAiRefine');if(refine)refine.hidden=false;
}

async function refinePlan(advisor,basePlan){
  if(!basePlan?.candidate?.topicId||typeof advisor.analyze!=='function')return basePlan;
  const result=await advisor.analyze({limit:1,topicId:basePlan.candidate.topicId});
  const intervention=result?.interventions?.find(item=>item?.topicId===basePlan.candidate.topicId)||result?.interventions?.[0];
  if(!intervention)return basePlan;
  return {candidate:basePlan.candidate,intervention,source:result?.aiUsed?'ai':'retention-engine'};
}

async function refresh(options={}){
  if(busy)return currentPlan;
  busy=true;
  ensurePanel();
  const calculate=qs('adaptiveAiCalculate');const refine=qs('adaptiveAiRefine');
  if(calculate)calculate.disabled=true;if(refine)refine.disabled=true;
  try{
    const advisor=await ensureAdvisor();
    if(!advisor){renderPlan(null);return null}
    let plan=choosePlan(advisor);
    renderPlan(plan);
    if(options.refine&&plan){
      plan=await refinePlan(advisor,plan);
      renderPlan(plan);
    }
    return plan;
  }catch(error){
    console.warn('[adaptive-ai] recommendation unavailable:',error?.message||error);
    renderPlan(currentPlan);
    return currentPlan;
  }finally{
    busy=false;
    if(calculate)calculate.disabled=false;if(refine)refine.disabled=false;
  }
}

function init(){
  ensureStyle();
  ensurePanel();
  ensureFeedbackLoop();
  setTimeout(()=>refresh({refine:false}),500);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
global.AppAdaptiveAIExperience=Object.freeze({refresh,getCurrentPlan:()=>currentPlan});
})(window);

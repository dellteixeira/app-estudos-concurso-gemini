(function installStudyOptimizationDashboard(global){
'use strict';
if(global.AppStudyOptimizationDashboard)return;

const UI_ENABLED=false;
const WINDOWS=Object.freeze([30,60,90]);
let selectedMinutes=60;
let latestPlan=null;

const clean=(value,max=420)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const esc=value=>clean(value,1000).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));

function scope(){
  let snapshot=null;
  try{snapshot=global.AppState?.getSnapshot?.('study-optimization-dashboard')||null}catch(_){}
  return {
    userId:clean(global.currentUser?.id||snapshot?.user?.id||'guest',120),
    contest:clean(global.currentConcurso||snapshot?.currentContest||'Concurso Geral',180)
  };
}

function readProfile(){
  const current=scope();
  try{return global.AppCognitiveProfile?.read?.(current.userId,current.contest)||global.AppCognitiveProfile?.refreshFromGlobals?.()||null}catch(_){return null}
}

function methodLabel(method){
  return ({
    active_recall:'Recuperação ativa',
    questions:'Questões de validação',
    focused_restudy:'Reestudo direcionado',
    short_review:'Revisão curta',
    maintenance_questions:'Questões de manutenção'
  })[method]||clean(method,100)||'Estudo dirigido';
}

function riskLabel(value){
  const risk=clamp(value,0,100);
  return risk>=65?'Risco alto':risk>=40?'Risco moderado':'Risco controlado';
}

function ensurePanel(){
  if(!UI_ENABLED)return null;
  let panel=document.getElementById('phase6bStudyOptimizationPanel');
  if(panel)return panel;
  const anchor=document.getElementById('phase6aDomainRiskPanel')||document.getElementById('retentionDiagnosticPanel');
  if(!anchor)return null;
  panel=document.createElement('section');
  panel.id='phase6bStudyOptimizationPanel';
  panel.className='study-optimization-panel';
  panel.setAttribute('aria-label','Otimização do estudo');
  panel.innerHTML=`
    <div class="study-opt-head">
      <div>
        <span class="study-opt-kicker">Fase 6B · Study Optimizer</span>
        <h4>Plano por tempo disponível</h4>
        <p>Transforma domínio, retenção prevista e risco em uma sequência temporária de estudo. A ordem importada do edital permanece intacta.</p>
      </div>
      <span class="study-opt-contract">Plano contextual</span>
    </div>
    <div class="study-opt-controls" role="group" aria-label="Tempo disponível">
      ${WINDOWS.map(minutes=>`<button type="button" class="study-opt-window${minutes===selectedMinutes?' active':''}" data-study-opt-minutes="${minutes}" aria-pressed="${minutes===selectedMinutes?'true':'false'}">${minutes} min</button>`).join('')}
      <button type="button" class="study-opt-generate" data-study-opt-action="generate">Gerar plano</button>
    </div>
    <div class="study-opt-summary" id="studyOptSummary" aria-live="polite">
      <span>Tempo</span><strong id="studyOptBudget">${selectedMinutes} min</strong>
      <span>Ganho esperado</span><strong id="studyOptExpectedGain">—</strong>
      <span>Blocos</span><strong id="studyOptBlockCount">—</strong>
    </div>
    <div id="studyOptPlan" class="study-opt-plan"><div class="study-opt-empty">Escolha o tempo disponível e gere um plano adaptativo.</div></div>`;
  if(anchor.id==='phase6aDomainRiskPanel')anchor.insertAdjacentElement('afterend',panel);
  else anchor.appendChild(panel);
  return panel;
}

function renderEmpty(message){
  const box=document.getElementById('studyOptPlan');
  if(box)box.innerHTML=`<div class="study-opt-empty">${esc(message)}</div>`;
  const gain=document.getElementById('studyOptExpectedGain');
  const count=document.getElementById('studyOptBlockCount');
  if(gain)gain.textContent='—';
  if(count)count.textContent='—';
}

function renderPlan(plan){
  latestPlan=plan||null;
  const budget=document.getElementById('studyOptBudget');
  const gain=document.getElementById('studyOptExpectedGain');
  const count=document.getElementById('studyOptBlockCount');
  const box=document.getElementById('studyOptPlan');
  if(budget)budget.textContent=`${Number(plan?.availableMinutes)||selectedMinutes} min`;
  if(!plan?.blocks?.length){renderEmpty('Ainda não há evidência cognitiva suficiente para montar um plano. Registre sessões, revisões ou questões e tente novamente.');return null}
  if(gain)gain.textContent=`+${Math.round(Number(plan.expectedGain)||0)} pts`;
  if(count)count.textContent=String(plan.blocks.length);
  if(box)box.innerHTML=plan.blocks.map((block,index)=>{
    const reasons=(Array.isArray(block.reasons)?block.reasons:[]).slice(0,2);
    const risk=Number(block.forgettingRisk)||0;
    return `<article class="study-opt-block" data-risk-band="${risk>=65?'high':risk>=40?'medium':'low'}">
      <div class="study-opt-order">${index+1}</div>
      <div class="study-opt-block-main">
        <div class="study-opt-topic"><strong>${esc(block.assunto||block.materia||'Assunto')}</strong><span>${esc(block.materia||'')}</span></div>
        <div class="study-opt-method">${esc(methodLabel(block.method))} · ${Math.round(Number(block.minutes)||0)} min</div>
        <div class="study-opt-reasons">${reasons.map(reason=>`<span>${esc(reason)}</span>`).join('')}</div>
      </div>
      <div class="study-opt-block-meta">
        <span>${esc(riskLabel(risk))}</span>
        <strong>+${Math.round(Number(block.expectedGain)||0)} pts</strong>
        <button type="button" data-study-opt-action="select-block" data-study-opt-index="${index}">Estudar agora</button>
      </div>
    </article>`;
  }).join('');
  return plan;
}

function generate(minutes=selectedMinutes){
  ensurePanel();
  selectedMinutes=WINDOWS.includes(Number(minutes))?Number(minutes):60;
  const profile=readProfile();
  if(!profile||!global.AppStudyOptimization?.buildPlan){renderEmpty('O Student Model ainda não está disponível.');return null}
  const plan=global.AppStudyOptimization.buildPlan(profile,selectedMinutes,{source:'phase6b-dashboard'});
  renderPlan(plan);
  try{global.AppStudyEvents?.emit?.('study:optimization-plan-rendered',{availableMinutes:selectedMinutes,blocks:plan?.blocks?.length||0,expectedGain:plan?.expectedGain||0},{source:'phase6b-dashboard'})}catch(_){}
  return plan;
}

function selectBlock(index){
  const block=latestPlan?.blocks?.[Number(index)];
  if(!block)return false;
  const detail={
    planId:latestPlan.id||null,
    index:Number(index),
    availableMinutes:latestPlan.availableMinutes,
    topicId:block.topicId,
    materia:block.materia,
    assunto:block.assunto,
    method:block.method,
    methodLabel:methodLabel(block.method),
    minutes:block.minutes,
    expectedGain:block.expectedGain,
    optimizationScore:block.optimizationScore,
    importedOrderMutation:false
  };
  try{global.AppStudyEvents?.emit?.('study:optimization-block-selected',detail,{source:'phase6b-dashboard'})}catch(_){}
  try{global.dispatchEvent?.(new CustomEvent('study:optimization-block-selected',{detail}))}catch(_){}
  const guidance=global.AppStudyGuidance?.guideSync?.({topicId:block.topicId,materia:block.materia,assunto:block.assunto,availableMinutes:block.minutes,surface:'phase6b-dashboard',preferredAction:block.method});
  if(guidance){
    global.dispatchEvent?.(new CustomEvent('study:optimization-guidance-ready',{detail:{block,guidance}}));
  }
  return detail;
}

function syncButtons(){
  document.querySelectorAll('[data-study-opt-minutes]').forEach(button=>{
    const active=Number(button.dataset.studyOptMinutes)===selectedMinutes;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',active?'true':'false');
  });
  const budget=document.getElementById('studyOptBudget');
  if(budget)budget.textContent=`${selectedMinutes} min`;
}

function handleClick(event){
  const minutesButton=event.target.closest?.('[data-study-opt-minutes]');
  if(minutesButton){selectedMinutes=Number(minutesButton.dataset.studyOptMinutes)||60;syncButtons();generate(selectedMinutes);return}
  const action=event.target.closest?.('[data-study-opt-action]');
  if(!action)return;
  if(action.dataset.studyOptAction==='generate')generate(selectedMinutes);
  if(action.dataset.studyOptAction==='select-block')selectBlock(action.dataset.studyOptIndex);
}

function init(){
  if(!UI_ENABLED)return false;
  if(!ensurePanel())return false;
  document.removeEventListener('click',handleClick);
  document.addEventListener('click',handleClick);
  syncButtons();
  generate(selectedMinutes);
  return true;
}

const refresh=()=>{if(document.getElementById('phase6bStudyOptimizationPanel'))generate(selectedMinutes);else init()};
global.addEventListener?.('study:cognitive-profile-updated',refresh);
global.addEventListener?.('study:domain-risk-updated',refresh);
global.addEventListener?.('study:session-completed',refresh);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0),{once:true});else setTimeout(init,0);

global.AppStudyOptimizationDashboard=Object.freeze({init,generate,renderPlan,selectBlock,methodLabel,get selectedMinutes(){return selectedMinutes},get latestPlan(){return latestPlan}});
})(window);

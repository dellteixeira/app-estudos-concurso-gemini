(function installDailyAdaptivePlanner(global){
'use strict';
if(global.AppDailyAdaptivePlanner)return;

const DAY_BUDGETS=[60,120,180];
const SESSION_SLICE=60;
let currentPlan=null;

function safe(value,max=160){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function calibrate(intervention){return global.AppMethodCalibration?.calibrate?.(intervention)||intervention}

function buildDay(totalMinutes=120){
  const advisor=global.AppLearningAdvisor;
  if(!advisor?.collectCandidates||!advisor?.localIntervention)return null;
  const budget=DAY_BUDGETS.includes(Number(totalMinutes))?Number(totalMinutes):120;
  const candidates=advisor.collectCandidates?.(12)||[];
  const blocks=[];
  let used=0;
  for(const candidate of candidates){
    const intervention=calibrate(advisor.localIntervention(candidate));
    if(!intervention)continue;
    const desired=Math.max(5,Math.round(Number(intervention.suggestedMinutes)||15));
    const remaining=budget-used;
    if(remaining<5)break;
    const minutes=Math.min(desired,remaining);
    blocks.push({candidate,intervention:{...intervention,suggestedMinutes:minutes},minutes,priorityIndex:blocks.length});
    used+=minutes;
    if(used>=budget)break;
  }
  const sessions=[];
  let session={index:0,minutes:0,blocks:[]};
  for(const block of blocks){
    if(session.blocks.length&&session.minutes+block.minutes>SESSION_SLICE){sessions.push(session);session={index:sessions.length,minutes:0,blocks:[]};}
    session.blocks.push(block);session.minutes+=block.minutes;
  }
  if(session.blocks.length)sessions.push(session);
  currentPlan={budget,used,remaining:Math.max(0,budget-used),blocks,sessions,authority:'retention-engine-order'};
  return currentPlan;
}

function ensurePanel(){
  const host=document.getElementById('adaptiveSessionOrchestrator')||document.getElementById('adaptiveAiExperience');
  if(!host)return null;
  let panel=document.getElementById('dailyAdaptivePlanner');
  if(panel)return panel;
  panel=document.createElement('section');
  panel.id='dailyAdaptivePlanner';
  panel.className='daily-adaptive-planner';
  panel.innerHTML=`<div class="adaptive-session-head"><span class="dashboard-v2-section-label">Plano do dia</span><span class="adaptive-session-authority">ordem do Retention Engine</span></div><div class="adaptive-session-budget" role="group" aria-label="Tempo de estudo no dia">${DAY_BUDGETS.map(value=>`<button type="button" class="btn btn-secondary btn-sm" data-day-budget="${value}">${value} min</button>`).join('')}</div><div id="dailyAdaptiveSummary" class="adaptive-session-summary">Escolha o tempo disponível hoje.</div><div id="dailyAdaptiveSessions" class="daily-adaptive-sessions"></div>`;
  host.appendChild(panel);
  panel.querySelectorAll('[data-day-budget]').forEach(button=>button.addEventListener('click',()=>render(buildDay(Number(button.dataset.dayBudget)))));
  return panel;
}

function render(plan){
  ensurePanel();
  const summary=document.getElementById('dailyAdaptiveSummary');
  const list=document.getElementById('dailyAdaptiveSessions');
  if(!summary||!list)return plan;
  if(!plan?.blocks?.length){summary.textContent='Ainda não há dados suficientes para montar o plano do dia.';list.replaceChildren();return plan;}
  summary.textContent=`${plan.sessions.length} sessão${plan.sessions.length===1?'':'ões'} · ${plan.used}/${plan.budget} min planejados`;
  list.innerHTML=plan.sessions.map(session=>`<article class="daily-adaptive-session"><strong>Sessão ${session.index+1} · ${session.minutes} min</strong>${session.blocks.map(block=>`<div class="daily-adaptive-block"><span>${block.priorityIndex+1}. ${safe(block.candidate.materia,70)} — ${safe(block.candidate.assunto,110)}</span><span>${block.minutes} min</span></div>`).join('')}</article>`).join('');
  global.dispatchEvent(new CustomEvent('adaptive-day-plan-rendered',{detail:{budget:plan.budget,count:plan.blocks.length,sessions:plan.sessions.length}}));
  return plan;
}

function init(){ensurePanel();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
global.AppDailyAdaptivePlanner=Object.freeze({buildDay,render,getCurrentPlan:()=>currentPlan});
})(window);

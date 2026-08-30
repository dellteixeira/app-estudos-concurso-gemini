(function installSessionContinuity(global){
'use strict';
if(global.AppSessionContinuity)return;

const STORAGE_KEY='adaptive_session_continuity_v1';
const MAX_COMPLETED=12;
const MIN_COMPLETION_RATIO=.7;
let activeTopicId='';

function safe(value,max=600){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function read(){try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return value&&typeof value==='object'?value:{}}catch(_){return{}}}
function write(value){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(value));return true}catch(_){return false}}
function blockId(block){return safe(block?.candidate?.topicId,600)}
function ensureStyle(){if(document.querySelector('link[data-session-continuity-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='./css/session-continuity.css?v=20260830';link.dataset.sessionContinuityStyle='1';document.head.appendChild(link)}
function ensureCompletion(){if(global.AppAdaptiveSessionCompletion||document.querySelector('script[data-session-completion]'))return;const script=document.createElement('script');script.src='./js/session-completion.js?v=20260830';script.defer=true;script.dataset.sessionCompletion='1';script.onerror=()=>console.warn('Não foi possível carregar a detecção de conclusão da sessão adaptativa.');document.head.appendChild(script)}

function saveSession(session){if(!session?.blocks?.length)return false;const previous=read();const validIds=new Set(session.blocks.map(blockId).filter(Boolean));const completed=(Array.isArray(previous.completed)?previous.completed:[]).filter(id=>validIds.has(id)).slice(-MAX_COMPLETED);return write({version:1,budget:Number(session.budget)||40,completed,activeTopicId:validIds.has(previous.activeTopicId)?previous.activeTopicId:'',updatedAt:new Date().toISOString()})}
function applyState(session){if(!session?.blocks?.length)return session;const data=read();const completed=new Set(Array.isArray(data.completed)?data.completed:[]);activeTopicId=safe(data.activeTopicId,600);session.blocks.forEach(block=>{block.completed=completed.has(blockId(block));block.active=blockId(block)===activeTopicId});return session}
function remainingMinutes(session){return session?.blocks?.length?session.blocks.reduce((sum,block)=>sum+(block.completed?0:Number(block.minutes)||0),0):0}
function manualCompletionState(){
  const execution=global.AppAdaptiveSessionCompletion?.getActiveExecution?.();
  if(!execution)return {eligible:false,elapsedMinutes:0,plannedMinutes:0,ratio:0};
  const elapsedMinutes=Number(global.AppAdaptivePomodoroBridge?.elapsedMinutes?.()||0);
  const plannedMinutes=Math.max(5,Number(execution.plannedMinutes)||15);
  const ratio=plannedMinutes?Math.max(0,Math.min(1,elapsedMinutes/plannedMinutes)):0;
  return {eligible:ratio>=MIN_COMPLETION_RATIO,elapsedMinutes,plannedMinutes,ratio};
}
function finishActiveExecution(){
  const completion=global.AppAdaptiveSessionCompletion;
  const state=manualCompletionState();
  if(!completion?.finish||!state.eligible){
    global.dispatchEvent(new CustomEvent('adaptive-session-completion-blocked',{detail:{elapsedMinutes:Number(state.elapsedMinutes.toFixed(1)),plannedMinutes:state.plannedMinutes,minRatio:MIN_COMPLETION_RATIO}}));
    return false;
  }
  return completion.finish('completed',{elapsedMinutes:state.elapsedMinutes});
}
function decorate(session){
  applyState(session);const panel=document.getElementById('adaptiveSessionOrchestrator');const summary=document.getElementById('adaptiveSessionSummary');const list=document.getElementById('adaptiveSessionBlocks');
  if(!panel||!summary||!list||!session?.blocks?.length)return session;
  const completedCount=session.blocks.filter(block=>block.completed).length;summary.textContent=`${completedCount}/${session.blocks.length} concluídos · ${remainingMinutes(session)} min restantes de ${session.budget}`;
  list.querySelectorAll('[data-session-index]').forEach((button,index)=>{const block=session.blocks[index];button.classList.toggle('is-completed',Boolean(block?.completed));button.classList.toggle('is-active',Boolean(block?.active));button.setAttribute('aria-pressed',block?.active?'true':'false');const use=button.querySelector('.adaptive-session-use');if(use)use.textContent=block?.completed?'Concluído':block?.active?'Em andamento':'Usar'});
  let controls=document.getElementById('adaptiveSessionContinuityControls');
  if(!controls){controls=document.createElement('div');controls.id='adaptiveSessionContinuityControls';controls.className='adaptive-session-continuity-controls';controls.innerHTML='<button id="adaptiveSessionComplete" type="button" class="btn btn-success btn-sm">Concluir bloco atual</button><button id="adaptiveSessionResume" type="button" class="btn btn-secondary btn-sm">Retomar próximo</button>';panel.appendChild(controls);document.getElementById('adaptiveSessionComplete')?.addEventListener('click',finishActiveExecution);document.getElementById('adaptiveSessionResume')?.addEventListener('click',resumeNext)}
  const completed=new Set(Array.isArray(read().completed)?read().completed:[]);const complete=document.getElementById('adaptiveSessionComplete');if(complete){complete.disabled=!activeTopicId||completed.has(activeTopicId);complete.title='A conclusão exige pelo menos 70% da duração planejada registrada pelo Pomodoro.'}const resume=document.getElementById('adaptiveSessionResume');if(resume)resume.disabled=!session.blocks.some(block=>!block.completed);return session
}
function onPromoted(event){const session=global.AppSessionOrchestrator?.getCurrentSession?.();if(!session)return;const block=session.blocks?.[Number(event?.detail?.index)];const id=blockId(block);if(!id)return;activeTopicId=id;const data=read();write({...data,version:1,budget:Number(session.budget)||40,activeTopicId:id,updatedAt:new Date().toISOString()});decorate(session)}
function completeActive(){const session=global.AppSessionOrchestrator?.getCurrentSession?.();if(!session||!activeTopicId)return false;const data=read();const completed=new Set(Array.isArray(data.completed)?data.completed:[]);completed.add(activeTopicId);write({...data,version:1,budget:Number(session.budget)||40,completed:[...completed].slice(-MAX_COMPLETED),activeTopicId:'',updatedAt:new Date().toISOString()});activeTopicId='';decorate(session);global.dispatchEvent(new CustomEvent('adaptive-session-block-completed'));return true}
function resumeNext(){const session=global.AppSessionOrchestrator?.getCurrentSession?.();if(!session?.blocks?.length)return null;applyState(session);const index=session.blocks.findIndex(block=>!block.completed);if(index<0)return null;return global.AppSessionOrchestrator?.promote?.(index)||null}
function restore(){const orchestrator=global.AppSessionOrchestrator;if(!orchestrator?.buildQueue)return null;const data=read();const budget=[20,40,60].includes(Number(data.budget))?Number(data.budget):40;const session=orchestrator.buildQueue(budget);if(!session)return null;applyState(session);orchestrator.render?.(session);decorate(session);if(activeTopicId){const index=session.blocks.findIndex(block=>blockId(block)===activeTopicId&&!block.completed);if(index>=0)orchestrator.promote?.(index)}return session}
function onRendered(){const session=global.AppSessionOrchestrator?.getCurrentSession?.();if(!session)return;saveSession(session);decorate(session)}
function init(){ensureStyle();ensureCompletion();global.addEventListener('adaptive-session-rendered',onRendered);global.addEventListener('adaptive-session-promoted',onPromoted);setTimeout(restore,900)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
global.AppSessionContinuity=Object.freeze({restore,completeActive,resumeNext,remainingMinutes,getState:read,finishActiveExecution,manualCompletionState});
})(window);

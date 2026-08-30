(function installAdaptiveSessionCompletion(global){
'use strict';
if(global.AppAdaptiveSessionCompletion)return;

const STORAGE_KEY='adaptive_session_execution_v1';
const VALID_STATUS=new Set(['completed','interrupted','abandoned']);
const HISTORY_LIMIT=40;
let activeExecution=null;

function safe(value,max=600){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0))}
function read(){try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return value&&typeof value==='object'?value:{}}catch(_){return{}}}
function write(value){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(value));return true}catch(_){return false}}
function currentBlock(){
  const session=global.AppSessionOrchestrator?.getCurrentSession?.();
  if(!session?.blocks?.length)return null;
  const state=global.AppSessionContinuity?.getState?.()||{};
  return session.blocks.find(block=>safe(block?.candidate?.topicId,600)===safe(state.activeTopicId,600))||null;
}
function begin(block=currentBlock()){
  if(!block?.candidate?.topicId)return null;
  activeExecution={
    topicId:safe(block.candidate.topicId,600),
    plannedMinutes:Math.max(5,Math.round(Number(block.minutes||block.intervention?.suggestedMinutes)||15)),
    action:safe(block.intervention?.recommendedAction,40),
    startedAt:new Date().toISOString()
  };
  global.dispatchEvent(new CustomEvent('adaptive-session-execution-started',{detail:{topicId:activeExecution.topicId,plannedMinutes:activeExecution.plannedMinutes}}));
  return activeExecution;
}
function finish(status='completed',meta={}){
  if(!VALID_STATUS.has(status))status='interrupted';
  const execution=activeExecution||begin();
  if(!execution)return null;
  const elapsedMinutes=clamp(meta.elapsedMinutes,0,180);
  const plannedMinutes=Math.max(5,Number(execution.plannedMinutes)||15);
  const completionRatio=plannedMinutes?clamp(elapsedMinutes/plannedMinutes,0,1):0;
  const effectiveStatus=status==='completed'&&completionRatio<.7?'interrupted':status;
  const record={
    topicId:execution.topicId,
    action:execution.action,
    plannedMinutes,
    elapsedMinutes:Number(elapsedMinutes.toFixed(1)),
    completionRatio:Number(completionRatio.toFixed(2)),
    status:effectiveStatus,
    startedAt:execution.startedAt,
    finishedAt:new Date().toISOString()
  };
  const data=read();
  const history=Array.isArray(data.history)?data.history:[];
  write({version:1,history:[...history,record].slice(-HISTORY_LIMIT)});
  activeExecution=null;
  if(effectiveStatus==='completed')global.AppSessionContinuity?.completeActive?.();
  global.dispatchEvent(new CustomEvent('adaptive-session-execution-finished',{detail:record}));
  return record;
}
function onPromoted(){begin()}
function onExternalExecution(event){
  const detail=event?.detail||{};
  const status=VALID_STATUS.has(detail.status)?detail.status:'interrupted';
  finish(status,{elapsedMinutes:detail.elapsedMinutes});
}
function getHistory(){return Array.isArray(read().history)?read().history:[]}
function init(){
  global.addEventListener('adaptive-session-promoted',onPromoted);
  global.addEventListener('adaptive-study-execution',onExternalExecution);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
global.AppAdaptiveSessionCompletion=Object.freeze({begin,finish,getHistory,getActiveExecution:()=>activeExecution});
})(window);

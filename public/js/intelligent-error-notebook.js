(function installIntelligentErrorNotebook(global){
'use strict';
if(global.AppIntelligentErrorNotebook)return;

const STORAGE_KEY='intelligent_error_notebook_v1';
const HISTORY_LIMIT=120;
const RESOLUTION_STREAK=3;

function safe(value,max=180){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function read(){try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return value&&typeof value==='object'?value:{}}catch(_){return{}}}
function write(value){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(value));return true}catch(_){return false}}
function nowIso(){return new Date().toISOString()}
function entries(){const data=read();return Array.isArray(data.entries)?data.entries:[]}

function upsertFromClassification(detail={}){
  const topicId=safe(detail.topicId,600);const type=safe(detail.type,40);if(!topicId||!type)return null;
  const data=read();const list=Array.isArray(data.entries)?data.entries:[];
  const existingIndex=list.findIndex(item=>item?.topicId===topicId&&item?.type===type&&item?.status!=='resolved');
  const existing=existingIndex>=0?list[existingIndex]:null;
  const next=existing?{...existing,count:(Number(existing.count)||0)+1,lastSeenAt:nowIso(),status:'active',correctStreak:0}:{topicId,type,count:1,firstSeenAt:nowIso(),lastSeenAt:nowIso(),status:'active',correctStreak:0};
  const nextList=existingIndex>=0?list.map((item,index)=>index===existingIndex?next:item):[...list,next];
  write({version:1,entries:nextList.slice(-HISTORY_LIMIT)});
  global.dispatchEvent(new CustomEvent('intelligent-error-notebook-changed',{detail:{topicId,type,status:'active'}}));
  return next;
}

function recordCorrect(detail={}){
  const topicId=safe(detail.topicId,600);if(!topicId)return [];
  const data=read();const list=Array.isArray(data.entries)?data.entries:[];const changed=[];
  const next=list.map(item=>{
    if(item?.topicId!==topicId||item?.status==='resolved')return item;
    const correctStreak=(Number(item.correctStreak)||0)+1;
    const resolved=correctStreak>=RESOLUTION_STREAK;
    const updated={...item,correctStreak,lastCorrectAt:nowIso(),status:resolved?'resolved':'active',resolvedAt:resolved?nowIso():null};
    changed.push(updated);return updated;
  });
  if(changed.length){write({version:1,entries:next.slice(-HISTORY_LIMIT)});global.dispatchEvent(new CustomEvent('intelligent-error-notebook-changed',{detail:{topicId,status:changed.every(item=>item.status==='resolved')?'resolved':'active'}}));}
  return changed;
}

function onClassified(event){upsertFromClassification(event?.detail||{})}
function onQuestionResult(event){const detail=event?.detail||{};if(detail.correct===true)recordCorrect(detail)}
function getTopicEntries(topicId){const id=safe(topicId,600);return entries().filter(item=>item?.topicId===id)}
function getActive(){return entries().filter(item=>item?.status!=='resolved')}
function getResolved(){return entries().filter(item=>item?.status==='resolved')}
function getSummary(){const all=entries();return {total:all.length,active:all.filter(item=>item?.status!=='resolved').length,resolved:all.filter(item=>item?.status==='resolved').length,authority:'diagnostic-only'}}
function init(){global.addEventListener('question-performance-classified',onClassified);global.addEventListener('adaptive-question-result',onQuestionResult)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
global.AppIntelligentErrorNotebook=Object.freeze({upsertFromClassification,recordCorrect,getTopicEntries,getActive,getResolved,getSummary,RESOLUTION_STREAK});
})(window);

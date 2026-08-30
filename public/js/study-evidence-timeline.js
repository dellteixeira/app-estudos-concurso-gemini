(function installStudyEvidenceTimeline(global){
'use strict';
if(global.AppStudyEvidenceTimeline)return;

const STORAGE_KEY='study_evidence_timeline_v1';
const HISTORY_LIMIT=160;
const EVENT_TYPES=new Set(['plan','execution_started','execution_finished','feedback','question_error','error_state','flashcard']);

function safe(value,max=180){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0))}
function read(){try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return value&&typeof value==='object'?value:{}}catch(_){return{}}}
function write(value){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(value));return true}catch(_){return false}}
function entries(){const data=read();return Array.isArray(data.entries)?data.entries:[]}
function append(type,detail={}){
  if(!EVENT_TYPES.has(type))return null;
  const topicId=safe(detail.topicId,600);
  const occurrences=Number.isFinite(Number(detail.occurrences))?Math.max(1,Math.round(clamp(detail.occurrences,1,200))):null;
  const entry={type,topicId,status:safe(detail.status,40),source:safe(detail.source,40),action:safe(detail.action,60),errorType:safe(detail.type||detail.errorType,40),occurrences,score:Number.isFinite(Number(detail.score))?Number(clamp(detail.score,-100,100).toFixed(1)):null,minutes:Number.isFinite(Number(detail.elapsedMinutes||detail.minutes))?Math.round(clamp(detail.elapsedMinutes||detail.minutes,0,240)):null,at:new Date().toISOString()};
  const next=[...entries(),entry].slice(-HISTORY_LIMIT);write({version:2,entries:next});global.dispatchEvent(new CustomEvent('study-evidence-timeline-changed',{detail:{type,topicId}}));return entry;
}
function getEntries(topicId=''){const id=safe(topicId,600);const rows=entries();return id?rows.filter(item=>item?.topicId===id):rows}
function getSummary(){
  const rows=entries();const counts={};rows.forEach(item=>{counts[item.type]=(counts[item.type]||0)+1});
  const questionErrorOccurrences=rows.filter(item=>item?.type==='question_error').reduce((sum,item)=>sum+(Number(item?.occurrences)||1),0);
  return {total:rows.length,counts,questionErrorOccurrences,authority:'observational-only'};
}
function bind(name,type,mapper){global.addEventListener(name,event=>append(type,mapper?mapper(event?.detail||{}):(event?.detail||{})))}
function onFeedback(event){
  const detail=event?.detail||{};
  const items=Array.isArray(detail.items)?detail.items:[];
  if(items.length){items.forEach(item=>append('feedback',{topicId:item?.topicId,score:item?.score,status:item?.outcome,action:item?.action,source:'attributed-feedback'}));return}
  append('feedback',{topicId:detail.topicId,score:detail.score,status:detail.outcome,action:detail.action,source:'attributed-feedback'});
}
function init(){
  bind('adaptive-plan-changed','plan');
  bind('adaptive-session-execution-started','execution_started');
  bind('adaptive-session-execution-finished','execution_finished');
  global.addEventListener('adaptive-feedback-evaluated',onFeedback);
  bind('question-performance-classified','question_error');
  bind('intelligent-error-notebook-changed','error_state');
  bind('adaptive-flashcard-launched','flashcard');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
global.AppStudyEvidenceTimeline=Object.freeze({append,getEntries,getSummary,HISTORY_LIMIT,onFeedback});
})(window);

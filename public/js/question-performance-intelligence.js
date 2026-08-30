(function installQuestionPerformanceIntelligence(global){
'use strict';
if(global.AppQuestionPerformanceIntelligence)return;

const STORAGE_KEY='question_performance_intelligence_v1';
const HISTORY_LIMIT=80;
const ERROR_TYPES=new Set(['knowledge','application','interpretation','distraction','recurrence']);

function safe(value,max=180){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0))}
function read(){try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return value&&typeof value==='object'?value:{}}catch(_){return{}}}
function write(value){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(value));return true}catch(_){return false}}
function ensureErrorNotebook(){
  if(global.AppIntelligentErrorNotebook||document.querySelector('script[data-intelligent-error-notebook]'))return;
  const script=document.createElement('script');script.src='./js/intelligent-error-notebook.js?v=20260830';script.defer=true;script.dataset.intelligentErrorNotebook='1';script.onerror=()=>console.warn('Não foi possível carregar o caderno inteligente de erros.');document.head.appendChild(script);
}
function inferType(detail={}){
  const explicit=safe(detail.errorType,40);
  if(ERROR_TYPES.has(explicit))return explicit;
  const confidence=clamp(detail.confidence,0,1);
  const responseSeconds=clamp(detail.responseSeconds,0,3600);
  const repeated=Boolean(detail.repeatedError);
  const knewConcept=Boolean(detail.knewConcept);
  const misread=Boolean(detail.misread);
  const careless=Boolean(detail.careless);
  if(repeated)return 'recurrence';
  if(misread)return 'interpretation';
  if(careless||confidence>=.8&&responseSeconds<20)return 'distraction';
  if(knewConcept)return 'application';
  return 'knowledge';
}
function record(detail={}){
  if(detail.correct===true)return null;
  const topicId=safe(detail.topicId,600);if(!topicId)return null;
  const type=inferType(detail);
  const entry={topicId,type,confidence:Number(clamp(detail.confidence,0,1).toFixed(2)),responseSeconds:Math.round(clamp(detail.responseSeconds,0,3600)),at:new Date().toISOString()};
  const data=read();const history=Array.isArray(data.history)?data.history:[];
  write({version:1,history:[...history,entry].slice(-HISTORY_LIMIT)});
  global.dispatchEvent(new CustomEvent('question-performance-classified',{detail:{topicId,type}}));
  return entry;
}
function getHistory(topicId=''){
  const history=Array.isArray(read().history)?read().history:[];
  const id=safe(topicId,600);return id?history.filter(item=>item?.topicId===id):history;
}
function getTopicProfile(topicId){
  const rows=getHistory(topicId);const counts={knowledge:0,application:0,interpretation:0,distraction:0,recurrence:0};
  rows.forEach(row=>{if(ERROR_TYPES.has(row?.type))counts[row.type]+=1});
  const dominant=Object.entries(counts).reduce((best,current)=>current[1]>best[1]?current:best,['',0]);
  return {topicId:safe(topicId,600),count:rows.length,counts,dominantType:dominant[1]?dominant[0]:null,authority:'diagnostic-only'};
}
function onResult(event){record(event?.detail||{})}
function init(){ensureErrorNotebook();global.addEventListener('adaptive-question-result',onResult)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
global.AppQuestionPerformanceIntelligence=Object.freeze({record,inferType,getHistory,getTopicProfile,ERROR_TYPES:[...ERROR_TYPES]});
})(window);

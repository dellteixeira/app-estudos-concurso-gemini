(function installQuestionPerformanceIntelligence(global){
'use strict';
if(global.AppQuestionPerformanceIntelligence)return;

const STORAGE_KEY='question_performance_intelligence_v1';
const HISTORY_LIMIT=80;
const ERROR_TYPES=new Set(['knowledge','application','interpretation','distraction','recurrence','unclassified']);
let coreContext=null;
let coreBridgeInstalled=false;

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
  if(detail.source==='core-question-performance')return 'unclassified';
  return 'knowledge';
}
function occurrencesFrom(detail={}){
  const count=Number(detail.errorCount);
  return Number.isFinite(count)&&count>0?Math.round(clamp(count,1,200)):1;
}
function record(detail={}){
  if(detail.correct===true)return null;
  const topicId=safe(detail.topicId,600);if(!topicId)return null;
  const type=inferType(detail);const occurrences=occurrencesFrom(detail);
  const entry={topicId,type,occurrences,confidence:Number(clamp(detail.confidence,0,1).toFixed(2)),responseSeconds:Math.round(clamp(detail.responseSeconds,0,3600)),at:new Date().toISOString()};
  const data=read();const history=Array.isArray(data.history)?data.history:[];
  write({version:2,history:[...history,entry].slice(-HISTORY_LIMIT)});
  global.dispatchEvent(new CustomEvent('question-performance-classified',{detail:{topicId,type,occurrences}}));
  return entry;
}
function getHistory(topicId=''){
  const history=Array.isArray(read().history)?read().history:[];
  const id=safe(topicId,600);return id?history.filter(item=>item?.topicId===id):history;
}
function getTopicProfile(topicId){
  const rows=getHistory(topicId);const counts={knowledge:0,application:0,interpretation:0,distraction:0,recurrence:0,unclassified:0};
  rows.forEach(row=>{if(ERROR_TYPES.has(row?.type))counts[row.type]+=Math.max(1,Math.round(Number(row?.occurrences)||1))});
  const dominant=Object.entries(counts).reduce((best,current)=>current[1]>best[1]?current:best,['',0]);
  const count=Object.values(counts).reduce((sum,value)=>sum+value,0);
  return {topicId:safe(topicId,600),count,eventCount:rows.length,counts,dominantType:dominant[1]?dominant[0]:null,authority:'diagnostic-only'};
}
function topicIdFromContext(options={}){
  const materia=safe(options.materia,180);const assunto=safe(options.assunto,300);
  if(!materia||!assunto)return '';
  try{if(typeof global.getStudyTopicKey==='function')return safe(global.getStudyTopicKey(materia,assunto),600)}catch(_){}
  return safe(`${materia}::${assunto}`,600);
}
function installCoreBridge(){
  if(coreBridgeInstalled)return true;
  const openOriginal=global.openQuestionPerformanceModal;
  const submitOriginal=global.submitQuestionPerformance;
  const closeOriginal=global.closeQuestionPerformanceModal;
  if(typeof openOriginal!=='function'||typeof submitOriginal!=='function')return false;
  global.openQuestionPerformanceModal=function(options={}){
    coreContext={topicId:topicIdFromContext(options)};
    return openOriginal.apply(this,arguments);
  };
  global.closeQuestionPerformanceModal=function(){
    coreContext=null;
    return typeof closeOriginal==='function'?closeOriginal.apply(this,arguments):undefined;
  };
  global.submitQuestionPerformance=async function(){
    const total=Number(document.getElementById('questionPerformanceTotal')?.value);
    const correct=Number(document.getElementById('questionPerformanceCorrect')?.value);
    const context=coreContext?{...coreContext}:null;
    const result=await submitOriginal.apply(this,arguments);
    const modal=document.getElementById('modalQuestionPerformance');
    const completed=Boolean(context?.topicId)&&Number.isFinite(total)&&total>=1&&Number.isFinite(correct)&&correct>=0&&correct<=total&&modal?.hidden===true;
    if(completed){
      global.dispatchEvent(new CustomEvent('adaptive-question-result',{detail:{topicId:context.topicId,correct:correct===total,errorCount:Math.max(0,Math.round(total-correct)),total:Math.round(total),accuracy:Math.round((correct/total)*100),source:'core-question-performance'}}));
      coreContext=null;
    }
    return result;
  };
  coreBridgeInstalled=true;
  return true;
}
function scheduleCoreBridge(){
  if(installCoreBridge())return;
  let attempts=0;
  const timer=setInterval(()=>{attempts+=1;if(installCoreBridge()||attempts>=40)clearInterval(timer)},100);
}
function onResult(event){record(event?.detail||{})}
function init(){ensureErrorNotebook();global.addEventListener('adaptive-question-result',onResult);scheduleCoreBridge()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
global.AppQuestionPerformanceIntelligence=Object.freeze({record,inferType,occurrencesFrom,getHistory,getTopicProfile,installCoreBridge,ERROR_TYPES:[...ERROR_TYPES]});
})(window);

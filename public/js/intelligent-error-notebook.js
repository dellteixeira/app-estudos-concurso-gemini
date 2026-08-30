(function installIntelligentErrorNotebook(global){
'use strict';
if(global.AppIntelligentErrorNotebook)return;

const STORAGE_KEY='intelligent_error_notebook_v1';
const HISTORY_LIMIT=120;
const RESOLUTION_STREAK=3;
const MIN_RESOLUTION_ACCURACY=90;
const MIN_RESOLUTION_TOTAL=10;
const RESOLUTION_EVIDENCE_TARGET=4;

function safe(value,max=180){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0))}
function read(){try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return value&&typeof value==='object'?value:{}}catch(_){return{}}}
function write(value){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(value));return true}catch(_){return false}}
function nowIso(){return new Date().toISOString()}
function entries(){const data=read();return Array.isArray(data.entries)?data.entries:[]}

function upsertFromClassification(detail={}){
  const topicId=safe(detail.topicId,600);const type=safe(detail.type,40);if(!topicId||!type)return null;
  const occurrences=Math.max(1,Math.round(clamp(detail.occurrences,1,200)));
  const data=read();const list=Array.isArray(data.entries)?data.entries:[];
  const existingIndex=list.findIndex(item=>item?.topicId===topicId&&item?.type===type&&item?.status!=='resolved');
  const existing=existingIndex>=0?list[existingIndex]:null;
  const next=existing?{...existing,count:(Number(existing.count)||0)+occurrences,lastSeenAt:nowIso(),status:'active',correctStreak:0,resolutionEvidence:0,perfectEvidence:0}:{topicId,type,count:occurrences,firstSeenAt:nowIso(),lastSeenAt:nowIso(),status:'active',correctStreak:0,resolutionEvidence:0,perfectEvidence:0};
  const nextList=existingIndex>=0?list.map((item,index)=>index===existingIndex?next:item):[...list,next];
  write({version:2,entries:nextList.slice(-HISTORY_LIMIT)});
  global.dispatchEvent(new CustomEvent('intelligent-error-notebook-changed',{detail:{topicId,type,status:'active',occurrences}}));
  return next;
}

function batchEvidence(detail={}){
  const total=Math.max(0,Math.round(Number(detail.total)||0));
  const errorCount=Math.max(0,Math.round(Number(detail.errorCount)||0));
  const accuracy=clamp(detail.accuracy,0,100);
  const perfect=total>=1&&errorCount===0&&accuracy>=99.5;
  const strong=total>=MIN_RESOLUTION_TOTAL&&errorCount<=1&&accuracy>=MIN_RESOLUTION_ACCURACY;
  return {total,errorCount,accuracy,perfect,strong,points:perfect?2:strong?1:0};
}

function recordBatchEvidence(detail={}){
  const topicId=safe(detail.topicId,600);if(!topicId)return [];
  const evidence=batchEvidence(detail);
  const data=read();const list=Array.isArray(data.entries)?data.entries:[];const changed=[];
  const next=list.map(item=>{
    if(item?.topicId!==topicId||item?.status==='resolved')return item;
    if(!evidence.points){
      const updated={...item,correctStreak:0,resolutionEvidence:0,perfectEvidence:0,lastEvidenceAt:nowIso()};
      changed.push(updated);return updated;
    }
    const resolutionEvidence=(Number(item.resolutionEvidence)||0)+evidence.points;
    const perfectEvidence=(Number(item.perfectEvidence)||0)+(evidence.perfect?1:0);
    const correctStreak=(Number(item.correctStreak)||0)+1;
    const resolved=resolutionEvidence>=RESOLUTION_EVIDENCE_TARGET&&perfectEvidence>=1&&correctStreak>=2;
    const updated={...item,correctStreak,resolutionEvidence,perfectEvidence,lastCorrectAt:nowIso(),lastEvidenceAt:nowIso(),lastEvidenceAccuracy:evidence.accuracy,lastEvidenceTotal:evidence.total,status:resolved?'resolved':'active',resolvedAt:resolved?nowIso():null};
    changed.push(updated);return updated;
  });
  if(changed.length){write({version:2,entries:next.slice(-HISTORY_LIMIT)});global.dispatchEvent(new CustomEvent('intelligent-error-notebook-changed',{detail:{topicId,status:changed.every(item=>item.status==='resolved')?'resolved':'active'}}));}
  return changed;
}

function recordCorrect(detail={}){
  const normalized={...detail,total:Number(detail.total)||1,errorCount:0,accuracy:Number.isFinite(Number(detail.accuracy))?Number(detail.accuracy):100};
  return recordBatchEvidence(normalized);
}

function onClassified(event){upsertFromClassification(event?.detail||{})}
function onQuestionResult(event){recordBatchEvidence(event?.detail||{})}
function getTopicEntries(topicId){const id=safe(topicId,600);return entries().filter(item=>item?.topicId===id)}
function getActive(){return entries().filter(item=>item?.status!=='resolved')}
function getResolved(){return entries().filter(item=>item?.status==='resolved')}
function getSummary(){const all=entries();return {total:all.length,active:all.filter(item=>item?.status!=='resolved').length,resolved:all.filter(item=>item?.status==='resolved').length,activeOccurrences:all.filter(item=>item?.status!=='resolved').reduce((sum,item)=>sum+(Number(item?.count)||0),0),authority:'diagnostic-only'}}
function init(){global.addEventListener('question-performance-classified',onClassified);global.addEventListener('adaptive-question-result',onQuestionResult)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
global.AppIntelligentErrorNotebook=Object.freeze({upsertFromClassification,recordCorrect,recordBatchEvidence,batchEvidence,getTopicEntries,getActive,getResolved,getSummary,RESOLUTION_STREAK,MIN_RESOLUTION_ACCURACY,MIN_RESOLUTION_TOTAL,RESOLUTION_EVIDENCE_TARGET});
})(window);

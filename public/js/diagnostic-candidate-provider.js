(function installDiagnosticCandidateProvider(global){
'use strict';
if(global.AppDiagnosticCandidateProvider)return;

const DEFAULT_LIMIT=40;
const MAX_LIMIT=80;
const MIN_FRICTION=35;

function safe(value,max=300){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0))}
function getRows(){try{return typeof retentionDiagnosticRows!=='undefined'&&Array.isArray(retentionDiagnosticRows)?retentionDiagnosticRows:[]}catch(_){return[]}}
function getItems(){try{return typeof editalItems!=='undefined'&&Array.isArray(editalItems)?editalItems:[]}catch(_){return[]}}
function topicKey(materia,assunto){try{if(typeof getStudyTopicKey==='function')return safe(getStudyTopicKey(materia,assunto),600)}catch(_){}return safe(`${materia||''}::${assunto||''}`.toLowerCase(),600)}
function findItem(row){
  const items=getItems();const key=safe(row?.state?.key,600);
  if(key)return items.find(item=>topicKey(item?.materia,item?.assunto)===key)||null;
  return items.find(item=>item?.materia===row?.materia&&item?.assunto===row?.assunto)||null;
}
function toCandidate(row,index,{enforceMinFriction=true}={}){
  const advisor=global.AppLearningAdvisor;if(typeof advisor?.computeLearningFriction!=='function')return null;
  const item=findItem(row);if(!item)return null;
  const topicId=topicKey(item.materia,item.assunto);if(!topicId)return null;
  const friction=advisor.computeLearningFriction(row,item);if(!friction)return null;
  if(enforceMinFriction&&Number(friction.score)<MIN_FRICTION)return null;
  return {
    topicId,
    rowIndex:index,
    materia:safe(item.materia,180),
    assunto:safe(item.assunto,300),
    prioridade:clamp(item.prioridade||2,1,4),
    assuntoPrioridade:clamp(item.assunto_prioridade||1,1,20),
    frictionScore:clamp(friction.score,0,100),
    metrics:friction.metrics||{},
    recommendationHistory:[],
    authority:'diagnostic-source-order'
  };
}
function collect(limit=DEFAULT_LIMIT){
  const advisor=global.AppLearningAdvisor;
  if(typeof advisor?.computeLearningFriction!=='function')return [];
  const max=Math.max(1,Math.min(MAX_LIMIT,Math.round(Number(limit)||DEFAULT_LIMIT)));
  const result=[];const rows=getRows();
  for(let index=0;index<rows.length&&result.length<max;index+=1){
    const candidate=toCandidate(rows[index],index,{enforceMinFriction:true});if(!candidate)continue;
    if(advisor.isSnoozed?.(candidate.topicId))continue;
    result.push(candidate);
  }
  return result;
}
function findByTopicId(topicId){
  const id=safe(topicId,600);if(!id)return null;
  const rows=getRows();
  for(let index=0;index<rows.length;index+=1){
    const candidate=toCandidate(rows[index],index,{enforceMinFriction:false});
    if(candidate?.topicId===id)return candidate;
  }
  return null;
}

global.AppDiagnosticCandidateProvider=Object.freeze({collect,findByTopicId,DEFAULT_LIMIT,MAX_LIMIT,authority:'diagnostic-source-order'});
global.dispatchEvent(new CustomEvent('diagnostic-candidate-provider-ready',{detail:{authority:'diagnostic-source-order'}}));
})(window);

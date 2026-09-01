(function installPredictiveAdaptiveTutor(global){
'use strict';
if(global.AppPredictiveAdaptiveTutor)return;

const SCHEMA_VERSION=1;
const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,Number(value)||0));
const finite=value=>Number.isFinite(Number(value))?Number(value):null;
const clean=(value,max=360)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);

function evidenceFactor(level){return level==='high'?1:level==='medium'?0.86:0.68}
function trendFactor(trend){return trend==='improving'?8:trend==='declining'?-10:trend==='stable'?2:0}

function predictTopic(state={}){
  const domain=state.domainRisk||{};
  const mastery=finite(domain.masteryScore)??50;
  const retention=finite(state.retention)??finite(domain.predictedRetention7d)??50;
  const predictedRetention7d=finite(domain.predictedRetention7d)??retention;
  const accuracy=finite(state.accuracy)??retention;
  const confidence=finite(state.confidence)??50;
  const forgettingRisk=finite(domain.forgettingRisk)??50;
  const evidence=evidenceFactor(domain.evidenceLevel);
  const trend=trendFactor(domain.trend);
  const applicationGap=Math.max(0,retention-accuracy);
  const lapsePenalty=Math.min(14,Math.max(0,Number(state.lapseCount)||0)*2.5);

  const expectedPerformance=clamp((
    mastery*0.30+
    predictedRetention7d*0.24+
    accuracy*0.24+
    confidence*0.08+
    (100-forgettingRisk)*0.14+
    trend-
    applicationGap*0.10-
    lapsePenalty
  )*evidence+(1-evidence)*50);

  const uncertainty=clamp((1-evidence)*45+Math.abs(retention-accuracy)*0.16+Math.min(18,Number(state.lapseCount)||0)*0.8,4,48);
  const lowerBound=clamp(expectedPerformance-uncertainty);
  const upperBound=clamp(expectedPerformance+uncertainty);

  return Object.freeze({
    expectedPerformance:Number(expectedPerformance.toFixed(1)),
    lowerBound:Number(lowerBound.toFixed(1)),
    upperBound:Number(upperBound.toFixed(1)),
    uncertainty:Number(uncertainty.toFixed(1)),
    evidenceLevel:clean(domain.evidenceLevel,32)||'low',
    trend:clean(domain.trend,48)||'insufficient_evidence',
    applicationGap:Number(applicationGap.toFixed(1)),
    forgettingRisk:Number(forgettingRisk.toFixed(1))
  });
}

function predictProfile(profile={}){
  const entries=Object.entries(profile.topicState||{}).map(([topicId,state],canonicalIndex)=>({topicId,state,canonicalIndex,prediction:predictTopic(state)}));
  if(!entries.length)return Object.freeze({expectedPerformance:0,lowerBound:0,upperBound:0,confidence:0,topics:Object.freeze([])});
  let weightTotal=0;
  let expected=0;
  let lower=0;
  let upper=0;
  entries.forEach(entry=>{
    const priority=finite(entry.state.topicPriority??entry.state.editalPriority);
    const weight=priority==null?1:Math.max(1,5-Math.min(4,Math.max(1,priority)));
    weightTotal+=weight;
    expected+=entry.prediction.expectedPerformance*weight;
    lower+=entry.prediction.lowerBound*weight;
    upper+=entry.prediction.upperBound*weight;
  });
  const expectedPerformance=expected/weightTotal;
  const lowerBound=lower/weightTotal;
  const upperBound=upper/weightTotal;
  const confidence=clamp(100-(upperBound-lowerBound));
  return Object.freeze({
    expectedPerformance:Number(expectedPerformance.toFixed(1)),
    lowerBound:Number(lowerBound.toFixed(1)),
    upperBound:Number(upperBound.toFixed(1)),
    confidence:Number(confidence.toFixed(1)),
    topics:Object.freeze(entries.map(entry=>Object.freeze({topicId:entry.topicId,canonicalIndex:entry.canonicalIndex,materia:clean(entry.state.materia,180),assunto:clean(entry.state.assunto,360),...entry.prediction})))
  });
}

function probabilityOfGoal(profile={},target=70){
  const prediction=predictProfile(profile);
  const goal=clamp(target,1,100);
  const spread=Math.max(6,(prediction.upperBound-prediction.lowerBound)/2);
  const z=(prediction.expectedPerformance-goal)/spread;
  const probability=clamp(100/(1+Math.exp(-1.35*z)));
  return Object.freeze({
    target:goal,
    probability:Number(probability.toFixed(1)),
    expectedPerformance:prediction.expectedPerformance,
    lowerBound:prediction.lowerBound,
    upperBound:prediction.upperBound,
    confidence:prediction.confidence
  });
}

function tutorDecision(state={},context={}){
  const prediction=predictTopic(state);
  const preferred=clean(context.preferredAction,80);
  const retention=finite(state.retention)??50;
  const accuracy=finite(state.accuracy)??retention;
  const mastery=finite(state.domainRisk?.masteryScore)??50;
  let action=preferred||'short_review';
  let reason='manutenção adaptativa';

  if(prediction.expectedPerformance<48||mastery<42){action='focused_restudy';reason='desempenho projetado baixo ou domínio insuficiente'}
  else if(retention>=70&&accuracy<65){action='questions';reason='retenção preservada com aplicação abaixo do esperado'}
  else if(prediction.forgettingRisk>=65||retention<55){action='active_recall';reason='alto risco de esquecimento ou retenção baixa'}
  else if(accuracy<75){action='questions';reason='necessidade de validação por questões'}

  const minutes=action==='focused_restudy'?30:action==='questions'?20:15;
  return Object.freeze({
    action,
    suggestedMinutes:Math.max(10,Math.min(Number(context.availableMinutes)||minutes,45)),
    reason,
    prediction,
    confidence:clamp(100-prediction.uncertainty),
    importedOrderMutation:false
  });
}

function readProfile(context={}){
  const userId=clean(context.userId||global.currentUser?.id||'guest',120);
  const contest=clean(context.contest||global.currentConcurso||'Concurso Geral',180);
  try{return global.AppCognitiveProfile?.read?.(userId,contest)||null}catch(_){return null}
}

function resolve(context={}){
  const profile=context.profile||readProfile(context);
  if(!profile)return null;
  const goal=probabilityOfGoal(profile,context.target||70);
  const topicId=clean(context.topicId,640).toLowerCase();
  const state=topicId?profile.topicState?.[topicId]||null:null;
  const tutor=state?tutorDecision(state,context):null;
  const result=Object.freeze({schemaVersion:SCHEMA_VERSION,goal,tutor,generatedAt:new Date().toISOString(),priorityContract:Object.freeze({importedOrderMutation:false,predictionOnly:true})});
  try{global.AppStudyEvents?.emit?.('study:prediction-resolved',{target:goal.target,probability:goal.probability,expectedPerformance:goal.expectedPerformance,topicId:topicId||null,action:tutor?.action||null},{source:'predictive-adaptive-tutor'})}catch(_){}
  return result;
}

global.AppPredictiveAdaptiveTutor=Object.freeze({schemaVersion:SCHEMA_VERSION,predictTopic,predictProfile,probabilityOfGoal,tutorDecision,resolve});
global.dispatchEvent?.(new CustomEvent('study:predictive-tutor-ready',{detail:{schemaVersion:SCHEMA_VERSION}}));
})(window);

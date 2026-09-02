(function installPredictiveAdaptiveTutor(global){
'use strict';
if(global.AppPredictiveAdaptiveTutor)return;

const SCHEMA_VERSION=1;
const topicPredictionCache=new WeakMap(),profilePredictionCache=new WeakMap();
let topicCacheHits=0,topicComputations=0,profileCacheHits=0,profileComputations=0;
const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,Number(value)||0));
const finite=value=>Number.isFinite(Number(value))?Number(value):null;
const clean=(value,max=360)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const assessment=()=>global.AppTopicAssessment||null;
function evidenceFactor(level){return level==='high'?1:level==='medium'?0.86:0.68}
function trendFactor(trend){return trend==='improving'?8:trend==='declining'?-10:trend==='stable'?2:0}
function signals(state={}){
  const shared=assessment()?.normalizeTopicState?.(state);if(shared)return shared;
  const domain=state.domainRisk||{},retention=finite(state.retention)??finite(domain.predictedRetention7d)??50,accuracy=finite(state.accuracy)??retention;
  return {mastery:finite(domain.masteryScore)??50,retention,predictedRetention7d:finite(domain.predictedRetention7d)??retention,accuracy,confidence:finite(state.confidence)??50,forgettingRisk:finite(domain.forgettingRisk)??50,evidenceLevel:clean(domain.evidenceLevel,32)||'low',trend:clean(domain.trend,48)||'insufficient_evidence',applicationGap:Math.max(0,retention-accuracy),lapseCount:Math.max(0,Number(state.lapseCount)||0),topicPriority:finite(state.topicPriority),editalPriority:finite(state.editalPriority)};
}
function predictTopic(state={}){
  if(state&&typeof state==='object'&&topicPredictionCache.has(state)){topicCacheHits+=1;return topicPredictionCache.get(state)}
  topicComputations+=1;const s=signals(state),evidence=evidenceFactor(s.evidenceLevel),trend=trendFactor(s.trend),lapsePenalty=Math.min(14,s.lapseCount*2.5);
  const expectedPerformance=clamp((s.mastery*.30+s.predictedRetention7d*.24+s.accuracy*.24+(s.confidence??50)*.08+(100-s.forgettingRisk)*.14+trend-s.applicationGap*.10-lapsePenalty)*evidence+(1-evidence)*50);
  const uncertainty=clamp((1-evidence)*45+Math.abs(s.retention-s.accuracy)*.16+Math.min(18,s.lapseCount)*.8,4,48),lowerBound=clamp(expectedPerformance-uncertainty),upperBound=clamp(expectedPerformance+uncertainty);
  const result=Object.freeze({expectedPerformance:Number(expectedPerformance.toFixed(1)),lowerBound:Number(lowerBound.toFixed(1)),upperBound:Number(upperBound.toFixed(1)),uncertainty:Number(uncertainty.toFixed(1)),evidenceLevel:s.evidenceLevel,trend:s.trend,applicationGap:Number(s.applicationGap.toFixed(1)),forgettingRisk:Number(s.forgettingRisk.toFixed(1))});
  if(state&&typeof state==='object')topicPredictionCache.set(state,result);return result;
}
function predictProfile(profile={}){
  if(profile&&typeof profile==='object'&&profilePredictionCache.has(profile)){profileCacheHits+=1;return profilePredictionCache.get(profile)}
  profileComputations+=1;const entries=Object.entries(profile.topicState||{}).map(([topicId,state],canonicalIndex)=>({topicId,state,canonicalIndex,prediction:predictTopic(state),signals:signals(state)}));
  if(!entries.length)return Object.freeze({expectedPerformance:0,lowerBound:0,upperBound:0,confidence:0,topics:Object.freeze([])});
  let weightTotal=0,expected=0,lower=0,upper=0;
  for(const entry of entries){const priority=entry.signals.topicPriority??entry.signals.editalPriority,weight=priority==null?1:Math.max(1,5-Math.min(4,Math.max(1,priority)));weightTotal+=weight;expected+=entry.prediction.expectedPerformance*weight;lower+=entry.prediction.lowerBound*weight;upper+=entry.prediction.upperBound*weight}
  const expectedPerformance=expected/weightTotal,lowerBound=lower/weightTotal,upperBound=upper/weightTotal,confidence=clamp(100-(upperBound-lowerBound));
  const result=Object.freeze({expectedPerformance:Number(expectedPerformance.toFixed(1)),lowerBound:Number(lowerBound.toFixed(1)),upperBound:Number(upperBound.toFixed(1)),confidence:Number(confidence.toFixed(1)),topics:Object.freeze(entries.map(entry=>Object.freeze({topicId:entry.topicId,canonicalIndex:entry.canonicalIndex,materia:clean(entry.state.materia,180),assunto:clean(entry.state.assunto,360),...entry.prediction})))});
  if(profile&&typeof profile==='object')profilePredictionCache.set(profile,result);return result;
}
function probabilityOfGoal(profile={},target=70){const prediction=predictProfile(profile),goal=clamp(target,1,100),spread=Math.max(6,(prediction.upperBound-prediction.lowerBound)/2),z=(prediction.expectedPerformance-goal)/spread,probability=clamp(100/(1+Math.exp(-1.35*z)));return Object.freeze({target:goal,probability:Number(probability.toFixed(1)),expectedPerformance:prediction.expectedPerformance,lowerBound:prediction.lowerBound,upperBound:prediction.upperBound,confidence:prediction.confidence})}
function tutorDecision(state={},context={}){
  const prediction=predictTopic(state),s=signals(state),preferred=clean(context.preferredAction,80);let action=preferred||'short_review',reason='manutenção adaptativa';
  if(prediction.expectedPerformance<48||s.mastery<42){action='focused_restudy';reason='desempenho projetado baixo ou domínio insuficiente'}else if(s.retention>=70&&s.accuracy<65){action='questions';reason='retenção preservada com aplicação abaixo do esperado'}else if(prediction.forgettingRisk>=65||s.retention<55){action='active_recall';reason='alto risco de esquecimento ou retenção baixa'}else if(s.accuracy<75){action='questions';reason='necessidade de validação por questões'}
  const minutes=action==='focused_restudy'?30:action==='questions'?20:15;return Object.freeze({action,suggestedMinutes:Math.max(10,Math.min(Number(context.availableMinutes)||minutes,45)),reason,prediction,confidence:clamp(100-prediction.uncertainty),importedOrderMutation:false});
}
function readProfile(context={}){const userId=clean(context.userId||global.currentUser?.id||'guest',120),contest=clean(context.contest||global.currentConcurso||'Concurso Geral',180);try{return global.AppCognitiveProfile?.peek?.(userId,contest)||global.AppCognitiveProfile?.read?.(userId,contest)||null}catch(_){return null}}
function resolve(context={}){const profile=context.profile||readProfile(context);if(!profile)return null;const goal=probabilityOfGoal(profile,context.target||70),topicId=clean(context.topicId,640).toLowerCase(),state=topicId?profile.topicState?.[topicId]||null:null,tutor=state?tutorDecision(state,context):null,result=Object.freeze({schemaVersion:SCHEMA_VERSION,goal,tutor,generatedAt:new Date().toISOString(),priorityContract:Object.freeze({importedOrderMutation:false,predictionOnly:true})});try{global.AppStudyEvents?.emit?.('study:prediction-resolved',{target:goal.target,probability:goal.probability,expectedPerformance:goal.expectedPerformance,topicId:topicId||null,action:tutor?.action||null},{source:'predictive-adaptive-tutor'})}catch(_){}return result}
function cacheDiagnostics(){return Object.freeze({topicCacheHits,topicComputations,profileCacheHits,profileComputations})}
global.AppPredictiveAdaptiveTutor=Object.freeze({schemaVersion:SCHEMA_VERSION,predictTopic,predictProfile,probabilityOfGoal,tutorDecision,resolve,cacheDiagnostics});
global.dispatchEvent?.(new CustomEvent('study:predictive-tutor-ready',{detail:{schemaVersion:SCHEMA_VERSION,topicAssessment:Boolean(assessment())}}));
})(window);

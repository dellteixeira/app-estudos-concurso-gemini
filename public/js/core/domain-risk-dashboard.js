(function installTopicAssessment(global){
'use strict';
if(global.AppTopicAssessment)return;

const SCHEMA_VERSION=1;
const MAX_ATTENTION=6;
const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,Number(value)||0));
const finite=value=>value==null||value===''?null:(Number.isFinite(Number(value))?Number(value):null);
const clean=(value,max=480)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);

function normalizeTopicState(state={}){
  const domain=state.domainRisk||{};
  const retention=finite(state.retention)??finite(domain.predictedRetention7d)??50;
  const accuracy=finite(state.accuracy)??retention;
  const mastery=finite(domain.masteryScore)??Math.round((retention+accuracy)/2);
  const predictedRetention7d=finite(domain.predictedRetention7d)??retention;
  const forgettingRisk=finite(domain.forgettingRisk)??clamp(100-predictedRetention7d);
  const confidence=finite(state.confidence);
  const lapseCount=Math.max(0,Number(state.lapseCount)||0);
  const reviewCount=Math.max(0,Number(state.reviewCount)||0);
  const difficulty=clamp(state.difficulty||5,1,10);
  const editalPriority=finite(state.editalPriority);
  const topicPriority=finite(state.topicPriority);
  const applicationGap=Math.max(0,retention-accuracy);
  return Object.freeze({
    materia:clean(state.materia||state.subject,180),
    assunto:clean(state.assunto||state.topic,400),
    retention,accuracy,mastery,predictedRetention7d,forgettingRisk,confidence,
    lapseCount,reviewCount,difficulty,applicationGap,
    evidenceLevel:clean(domain.evidenceLevel,40)||'low',
    trend:clean(domain.trend,60)||'insufficient_evidence',
    riskBand:clean(domain.riskBand,40)||'low',
    priorityWeight:Math.max(1,finite(domain.priorityWeight)??1),
    editalPriority,topicPriority,
    lastStudyAt:clean(state.lastStudyAt,80),
    lastRating:clean(state.lastRating,40),
    sessionCount:Math.max(0,Number(state.sessionCount)||0),
    totalMinutes:Math.max(0,Number(state.totalMinutes)||0)
  });
}

function prioritySignal(state={}){
  const signals=normalizeTopicState(state);
  const imported=signals.topicPriority??signals.editalPriority;
  if(imported==null)return 50;
  return clamp(100-(Math.max(1,Math.round(imported))-1)*18,28,100);
}

function optimizationScore(state={}){
  const s=normalizeTopicState(state);
  const trendBoost=s.trend==='declining'?100:s.trend==='improving'?20:50;
  return Math.round(clamp(
    s.forgettingRisk*0.30+
    (100-s.mastery)*0.24+
    (100-s.predictedRetention7d)*0.14+
    (100-s.accuracy)*0.12+
    prioritySignal(state)*0.10+
    trendBoost*0.06+
    s.applicationGap*0.04,
    0,100
  ));
}

function chooseOptimizationMethod(state={}){
  const s=normalizeTopicState(state);
  if(s.mastery<42||s.lapseCount>=4)return Object.freeze({method:'focused_restudy',label:'Reestudo direcionado'});
  if(s.retention>=70&&(s.accuracy<65||s.applicationGap>=18))return Object.freeze({method:'questions',label:'Questões de validação'});
  if(s.retention<55)return Object.freeze({method:'active_recall',label:'Recuperação ativa'});
  if(s.retention<70)return Object.freeze({method:'short_review',label:'Revisão curta'});
  if(s.accuracy<75)return Object.freeze({method:'questions',label:'Questões comentadas'});
  return Object.freeze({method:'questions',label:'Questões de manutenção'});
}

function expectedGain(state={},minutes=25){
  const s=normalizeTopicState(state);
  const evidence=s.evidenceLevel==='high'?1:s.evidenceLevel==='medium'?0.86:0.72;
  const opportunity=clamp((100-s.mastery)*0.62+s.forgettingRisk*0.38,0,100);
  const timeFactor=1-Math.exp(-Math.max(0,Number(minutes)||0)/28);
  return Number(clamp(opportunity*timeFactor*0.34*evidence,0,25).toFixed(1));
}

function assessTopic(profile={},topicId,stateOverride=null){
  const id=clean(topicId,640).toLowerCase();
  const state=stateOverride||profile?.topicState?.[id]||null;
  if(!state)return null;
  const signals=normalizeTopicState(state);
  return Object.freeze({
    schemaVersion:SCHEMA_VERSION,
    topicId:id,
    ...signals,
    optimizationScore:optimizationScore(state),
    optimizationMethod:chooseOptimizationMethod(state),
    importedOrderMutation:false
  });
}

function topicEntries(profile){
  return Object.entries(profile?.topicState||{}).map(([key,topic],index)=>({key,index,topic,domain:topic?.domainRisk||null}));
}
function weightedAverage(entries,field){
  let total=0,weighted=0;
  for(const entry of entries){
    const value=finite(entry.domain?.[field]);
    if(value==null)continue;
    const weight=Math.max(1,finite(entry.domain?.priorityWeight)??1);
    total+=weight;weighted+=value*weight;
  }
  return total?Math.round(weighted/total):null;
}
function evidenceCoverage(entries){
  if(!entries.length)return 0;
  return Math.round(entries.filter(entry=>['medium','high'].includes(entry.domain?.evidenceLevel)).length/entries.length*100);
}
function getAttentionQueue(profile,limit=MAX_ATTENTION){
  return topicEntries(profile)
    .filter(entry=>entry.domain&&entry.domain.riskBand!=='low')
    .sort((a,b)=>Number(b.domain.forgettingRisk)-Number(a.domain.forgettingRisk)||Number(a.domain.masteryScore)-Number(b.domain.masteryScore)||a.index-b.index)
    .slice(0,Math.max(1,Number(limit)||MAX_ATTENTION));
}
function buildViewModel(profile){
  const entries=topicEntries(profile);
  return Object.freeze({
    schemaVersion:SCHEMA_VERSION,
    observedTopics:entries.length,
    weightedMastery:Number(profile?.metrics?.weightedMastery)||0,
    weightedCoverage:Number(profile?.metrics?.weightedCoverage)||0,
    predictedRetention7d:weightedAverage(entries,'predictedRetention7d'),
    evidenceCoverage:evidenceCoverage(entries),
    highRiskTopics:Number(profile?.metrics?.highRiskTopics)||0,
    mediumRiskTopics:Number(profile?.metrics?.mediumRiskTopics)||0,
    atRiskTopics:Number(profile?.metrics?.atRiskTopics)||0,
    attention:getAttentionQueue(profile)
  });
}
function resolveProfile(){
  try{
    const source=global.AppCognitiveDataSource?.snapshot?.()||null;
    if(!source?.userId)return null;
    return global.AppCognitiveProfile?.peek?.(source.userId,source.contest)||global.AppCognitiveProfile?.read?.(source.userId,source.contest)||null;
  }catch(_){return null}
}
function findTopicInsight(materia,assunto,profile=resolveProfile()){
  const mat=clean(materia,180).toLowerCase();
  const topic=clean(assunto,400).toLowerCase();
  const found=topicEntries(profile).find(entry=>clean(entry.topic?.materia,180).toLowerCase()===mat&&clean(entry.topic?.assunto,400).toLowerCase()===topic);
  return found?Object.freeze({key:found.key,...found.topic,domainRisk:found.domain}):null;
}

const API=Object.freeze({schemaVersion:SCHEMA_VERSION,normalizeTopicState,prioritySignal,optimizationScore,chooseOptimizationMethod,expectedGain,assessTopic,topicEntries,getAttentionQueue,buildViewModel,resolveProfile,findTopicInsight});
global.AppTopicAssessment=API;
// Compatibilidade temporária: preserva helpers antigos sem qualquer renderização, listener ou DOM.
global.AppDomainRiskDashboard=Object.freeze({schemaVersion:SCHEMA_VERSION,buildViewModel,getAttentionQueue,findTopicInsight,resolveProfile,render:()=>null,scheduleRender:()=>null,headless:true});
global.dispatchEvent?.(new CustomEvent('study:topic-assessment-ready',{detail:{schemaVersion:SCHEMA_VERSION,headless:true}}));
})(window);

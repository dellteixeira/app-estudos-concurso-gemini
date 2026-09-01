(function installCognitiveProfile(global){
'use strict';
if(global.AppCognitiveProfile)return;

const SCHEMA_VERSION=1;
const STORAGE_PREFIX='student_cognitive_profile_v1';
const profileCache=new Map();
let cacheHits=0;
let cacheMisses=0;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const safe=(value,max=240)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const mean=values=>{
  const valid=values.map(Number).filter(Number.isFinite);
  return valid.length?valid.reduce((sum,value)=>sum+value,0)/valid.length:null;
};

function toPercent(value){
  const numeric=Number(value);
  if(!Number.isFinite(numeric))return null;
  const normalized=numeric>=0&&numeric<=1?numeric*100:numeric;
  return clamp(normalized,0,100);
}

function nullableNumber(value){
  if(value==null||value==='')return null;
  const numeric=Number(value);
  return Number.isFinite(numeric)?numeric:null;
}

function topicKey(materia,assunto){
  return `${safe(materia,180)}::${safe(assunto,400)}`.toLowerCase();
}

function scopeKey(userId,contest){
  const uid=safe(userId||'guest',120).replace(/[^a-z0-9_.-]+/gi,'_');
  const exam=safe(contest||'Concurso Geral',160).replace(/[^a-z0-9_.-]+/gi,'_');
  return `${STORAGE_PREFIX}_${uid}_${exam}`;
}

function normalizeMethodEffectiveness(value={}){
  const methods=['active_recall','short_review','questions','focused_restudy','teoria','videoaula','lei_seca'];
  return Object.fromEntries(methods.map(method=>{
    const current=value?.[method]||{};
    return [method,{
      samples:Math.max(0,Number(current.samples)||0),
      immediateGain:Number.isFinite(Number(current.immediateGain))?Number(current.immediateGain):null,
      gain24h:Number.isFinite(Number(current.gain24h))?Number(current.gain24h):null,
      gain7d:Number.isFinite(Number(current.gain7d))?Number(current.gain7d):null,
      score:Number.isFinite(Number(current.score))?clamp(current.score,0,100):null
    }];
  }));
}

function normalizeRow(row){
  const state=row?.state||{};
  const qs=state.questionStats||{};
  const retention=toPercent(row?.retention??state.retention);
  const accuracy=toPercent(row?.questionAccuracy??qs.lastAccuracy??qs.averageAccuracy);
  return {
    key:safe(state.key||topicKey(row?.materia,row?.assunto),640),
    materia:safe(row?.materia,180),
    assunto:safe(row?.assunto,400),
    retention,
    accuracy,
    confidence:clamp(qs.confidence,0,1),
    lapseCount:Math.max(0,Number(state.lapseCount)||0),
    reviewCount:Math.max(0,Number(state.reviewCount)||0),
    sessionCount:Math.max(0,Number(state.sessionCount)||0),
    totalMinutes:Math.max(0,Number(state.totalMinutes)||0),
    difficulty:clamp(state.difficulty||5,1,10),
    lastRating:safe(state.lastRating,40),
    lastStudyAt:safe(state.lastStudyAt||state.lastSessionAt||'',60),
    // Contrato Fase 0: prioridade editorial/estratégica é apenas transportada.
    // Ela não é recalculada nem sobrescrita pelo Student Model.
    editalPriority:nullableNumber(row?.editalPriority),
    topicPriority:nullableNumber(row?.topicPriority)
  };
}

function priorityWeight(row){
  const value=nullableNumber(row?.topicPriority??row?.editalPriority);
  if(value==null)return 1;
  const rounded=Math.round(value);
  return clamp(5-rounded,1,4);
}

function evidenceLevel(row){
  const samples=Math.max(0,row.sessionCount)+Math.max(0,row.reviewCount)+(row.accuracy!=null?1:0);
  if(samples>=6)return 'high';
  if(samples>=3)return 'medium';
  return 'low';
}

function topicTrend(masteryScore,previousTopic){
  const previous=Number(previousTopic?.domainRisk?.masteryScore);
  if(!Number.isFinite(previous))return 'insufficient_evidence';
  const delta=masteryScore-previous;
  if(delta>=4)return 'improving';
  if(delta<=-4)return 'declining';
  return 'stable';
}

function estimateTopicDomainRisk(row,previousTopic=null){
  const retention=row.retention??50;
  const accuracy=row.accuracy??retention;
  const confidencePct=clamp(row.confidence*100,0,100);
  const evidenceScore=clamp(row.sessionCount*16+row.reviewCount*10+(row.accuracy!=null?18:0),0,100);
  const lapsePenalty=Math.min(20,row.lapseCount*3.25);
  const difficultyPenalty=Math.max(0,row.difficulty-5)*1.6;
  const masteryScore=Math.round(clamp(
    retention*0.46+accuracy*0.38+confidencePct*0.06+evidenceScore*0.10-lapsePenalty-difficultyPenalty,
    0,100
  ));

  // Projeção conservadora de retenção em 7 dias. É uma estimativa cognitiva,
  // não uma alteração do valor de retenção armazenado nem da prioridade importada.
  const decayRate=clamp(
    0.010+row.difficulty*0.0014+row.lapseCount*0.0012-Math.min(0.006,row.reviewCount*0.0007),
    0.008,0.035
  );
  const predictedRetention7d=Math.round(clamp(retention*Math.exp(-decayRate*7),0,100));
  const uncertainty=evidenceLevel(row)==='low'?9:evidenceLevel(row)==='medium'?4:0;
  const applicationGap=Math.max(0,retention-accuracy);
  const forgettingRisk=Math.round(clamp(
    (100-predictedRetention7d)*0.56+lapsePenalty+Math.max(0,65-accuracy)*0.24+applicationGap*0.10+uncertainty,
    0,100
  ));
  const riskBand=forgettingRisk>=65?'high':forgettingRisk>=40?'medium':'low';

  return Object.freeze({
    masteryScore,
    predictedRetention7d,
    forgettingRisk,
    riskBand,
    evidenceLevel:evidenceLevel(row),
    trend:topicTrend(masteryScore,previousTopic),
    priorityWeight:priorityWeight(row)
  });
}

function aggregateDomainRisk(rows,previousTopicState={},precomputed=null){
  if(!rows.length)return {
    weightedCoverage:0,
    weightedMastery:0,
    masteredTopics:0,
    atRiskTopics:0,
    highRiskTopics:0,
    mediumRiskTopics:0
  };
  let totalWeight=0;
  let coveredWeight=0;
  let weightedMasterySum=0;
  let masteredTopics=0;
  let atRiskTopics=0;
  let highRiskTopics=0;
  let mediumRiskTopics=0;
  rows.forEach(row=>{
    const domain=precomputed?.[row.key]||estimateTopicDomainRisk(row,previousTopicState?.[row.key]);
    const weight=domain.priorityWeight;
    totalWeight+=weight;
    weightedMasterySum+=domain.masteryScore*weight;
    if(domain.masteryScore>=70){
      masteredTopics+=1;
      coveredWeight+=weight;
    }
    if(domain.riskBand!=='low')atRiskTopics+=1;
    if(domain.riskBand==='high')highRiskTopics+=1;
    if(domain.riskBand==='medium')mediumRiskTopics+=1;
  });
  return {
    weightedCoverage:Math.round(totalWeight?coveredWeight/totalWeight*100:0),
    weightedMastery:Math.round(totalWeight?weightedMasterySum/totalWeight:0),
    masteredTopics,
    atRiskTopics,
    highRiskTopics,
    mediumRiskTopics
  };
}

function aggregateSubjects(rows){
  const map=new Map();
  rows.forEach(row=>{
    const key=row.materia||'Sem matéria';
    const current=map.get(key)||{materia:key,topics:0,retention:[],accuracy:[],lapses:0,minutes:0};
    current.topics+=1;
    if(row.retention!=null)current.retention.push(row.retention);
    if(row.accuracy!=null)current.accuracy.push(row.accuracy);
    current.lapses+=row.lapseCount;
    current.minutes+=row.totalMinutes;
    map.set(key,current);
  });
  return [...map.values()].map(subject=>({
    materia:subject.materia,
    topics:subject.topics,
    avgRetention:mean(subject.retention),
    avgAccuracy:mean(subject.accuracy),
    lapseCount:subject.lapses,
    totalMinutes:subject.minutes,
    masteryScore:Math.round(clamp((mean(subject.retention)??50)*0.6+(mean(subject.accuracy)??50)*0.4-subject.lapses*1.5,0,100))
  })).sort((a,b)=>b.masteryScore-a.masteryScore);
}

function estimateFatigue(sessions=[]){
  const recent=(Array.isArray(sessions)?sessions:[]).slice(-12);
  if(!recent.length)return 0;
  const durations=recent.map(item=>Number(item?.minutes??item?.durationMinutes)).filter(Number.isFinite);
  const avg=mean(durations)||0;
  const longSessions=durations.filter(value=>value>=60).length;
  const density=Math.min(1,recent.length/8);
  return Math.round(clamp(avg/90*55+longSessions*8+density*15,0,100));
}

function estimateLearningVelocity(rows){
  if(!rows.length)return null;
  const observed=rows.filter(row=>row.sessionCount>0||row.reviewCount>0);
  if(!observed.length)return null;
  const scores=observed.map(row=>{
    const exposure=Math.max(1,row.sessionCount+row.reviewCount*0.75);
    const retention=row.retention??50;
    const accuracy=row.accuracy??retention;
    return clamp(((retention*0.58+accuracy*0.42)/exposure)*2.2,0,100);
  });
  return Math.round(mean(scores));
}

function buildProfile(input={}){
  const previous=input.previous&&typeof input.previous==='object'?input.previous:{};
  const rows=(Array.isArray(input.rows)?input.rows:[]).map(normalizeRow);
  const subjects=aggregateSubjects(rows);
  const avgRetention=mean(rows.map(row=>row.retention).filter(value=>value!=null));
  const avgAccuracy=mean(rows.map(row=>row.accuracy).filter(value=>value!=null));
  const avgConfidence=mean(rows.map(row=>row.confidence));
  const totalLapses=rows.reduce((sum,row)=>sum+row.lapseCount,0);
  const totalMinutes=rows.reduce((sum,row)=>sum+row.totalMinutes,0);
  const totalSessions=rows.reduce((sum,row)=>sum+row.sessionCount,0);
  const forgettingRisk=Math.round(clamp((100-(avgRetention??75))*0.7+Math.min(30,totalLapses*2.5),0,100));
  const strongSubjects=subjects.slice(0,3).filter(subject=>subject.masteryScore>=65);
  const weakSubjects=[...subjects].reverse().slice(0,5).filter(subject=>subject.masteryScore<70);
  const domainByKey=Object.fromEntries(rows.map(row=>[row.key,estimateTopicDomainRisk(row,previous.topicState?.[row.key])]));
  const domainAggregate=aggregateDomainRisk(rows,previous.topicState||{},domainByKey);

  return {
    schemaVersion:SCHEMA_VERSION,
    userId:safe(input.userId||previous.userId||'guest',120),
    contest:safe(input.contest||previous.contest||'Concurso Geral',180),
    createdAt:previous.createdAt||new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    priorityContract:Object.freeze({
      editalPriority:'immutable-imported-order',
      topicPriority:'immutable-imported-order',
      learnerUrgency:'dynamic-cognitive-signal',
      recommendationScore:'contextual-recommendation-only'
    }),
    metrics:{
      learningVelocity:estimateLearningVelocity(rows),
      avgRetention:avgRetention==null?null:Math.round(avgRetention),
      forgettingRisk,
      avgAccuracy:avgAccuracy==null?null:Math.round(avgAccuracy),
      avgConfidence:avgConfidence==null?null:Number(avgConfidence.toFixed(2)),
      fatigueIndex:estimateFatigue(input.sessions),
      avgSessionMinutes:totalSessions?Math.round(totalMinutes/totalSessions):null,
      totalObservedTopics:rows.length,
      totalStudyMinutes:Math.round(totalMinutes),
      totalLapses,
      weightedCoverage:domainAggregate.weightedCoverage,
      weightedMastery:domainAggregate.weightedMastery,
      masteredTopics:domainAggregate.masteredTopics,
      atRiskTopics:domainAggregate.atRiskTopics,
      highRiskTopics:domainAggregate.highRiskTopics,
      mediumRiskTopics:domainAggregate.mediumRiskTopics
    },
    strengths:strongSubjects,
    weaknesses:weakSubjects,
    subjects,
    recurringErrors:Array.isArray(previous.recurringErrors)?previous.recurringErrors:[],
    methodEffectiveness:normalizeMethodEffectiveness(input.methodEffectiveness||previous.methodEffectiveness),
    topicState:Object.fromEntries(rows.map(row=>[row.key,{
      materia:row.materia,
      assunto:row.assunto,
      retention:row.retention,
      accuracy:row.accuracy,
      confidence:row.confidence,
      lapseCount:row.lapseCount,
      reviewCount:row.reviewCount,
      sessionCount:row.sessionCount,
      totalMinutes:row.totalMinutes,
      difficulty:row.difficulty,
      lastRating:row.lastRating,
      lastStudyAt:row.lastStudyAt,
      editalPriority:row.editalPriority,
      topicPriority:row.topicPriority,
      domainRisk:domainByKey[row.key]
    }]))
  };
}

function read(userId,contest){
  const key=scopeKey(userId,contest);
  if(profileCache.has(key)){cacheHits+=1;return profileCache.get(key)}
  cacheMisses+=1;
  try{
    const parsed=JSON.parse(global.localStorage?.getItem(key)||'null');
    const profile=parsed&&parsed.schemaVersion===SCHEMA_VERSION?parsed:null;
    if(profile)profileCache.set(key,profile);
    return profile;
  }catch(_){return null}
}

function peek(userId,contest){return profileCache.get(scopeKey(userId,contest))||null}
function invalidateCache(userId,contest){
  if(userId!=null||contest!=null)return profileCache.delete(scopeKey(userId||'guest',contest||'Concurso Geral'));
  profileCache.clear();
  return true;
}
function cacheDiagnostics(){return Object.freeze({entries:profileCache.size,hits:cacheHits,misses:cacheMisses})}

function write(profile){
  if(!profile)return false;
  const key=scopeKey(profile.userId,profile.contest);
  profileCache.set(key,profile);
  try{
    global.localStorage?.setItem(key,JSON.stringify(profile));
    return true;
  }catch(_){return false}
}

function refresh(input={}){
  const userId=input.userId||global.currentUser?.id||'guest';
  const contest=input.contest||global.currentConcurso||'Concurso Geral';
  const previous=read(userId,contest);
  const profile=buildProfile({...input,userId,contest,previous});
  write(profile);
  return profile;
}

function refreshFromGlobals(){
  let rows=[];
  let sessions=[];
  try{rows=Array.isArray(global.retentionDiagnosticRows)?global.retentionDiagnosticRows:[]}catch(_){}
  try{sessions=Array.isArray(global.studySessions)?global.studySessions:[]}catch(_){}
  return refresh({rows,sessions});
}

global.AppCognitiveProfile=Object.freeze({
  schemaVersion:SCHEMA_VERSION,
  scopeKey,
  toPercent,
  estimateTopicDomainRisk,
  aggregateDomainRisk,
  buildProfile,
  read,
  peek,
  invalidateCache,
  cacheDiagnostics,
  write,
  refresh,
  refreshFromGlobals
});
})(window);

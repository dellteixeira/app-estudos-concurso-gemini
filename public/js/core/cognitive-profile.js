(function installCognitiveProfile(global){
'use strict';
if(global.AppCognitiveProfile)return;

const SCHEMA_VERSION=1;
const STORAGE_PREFIX='student_cognitive_profile_v1';
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
    lastStudyAt:safe(state.lastStudyAt||state.lastSessionAt||'',60)
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

  return {
    schemaVersion:SCHEMA_VERSION,
    userId:safe(input.userId||previous.userId||'guest',120),
    contest:safe(input.contest||previous.contest||'Concurso Geral',180),
    createdAt:previous.createdAt||new Date().toISOString(),
    updatedAt:new Date().toISOString(),
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
      totalLapses
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
      lastStudyAt:row.lastStudyAt
    }]))
  };
}

function read(userId,contest){
  try{
    const parsed=JSON.parse(global.localStorage?.getItem(scopeKey(userId,contest))||'null');
    return parsed&&parsed.schemaVersion===SCHEMA_VERSION?parsed:null;
  }catch(_){return null}
}

function write(profile){
  if(!profile)return false;
  try{
    global.localStorage?.setItem(scopeKey(profile.userId,profile.contest),JSON.stringify(profile));
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
  buildProfile,
  read,
  write,
  refresh,
  refreshFromGlobals
});
})(window);
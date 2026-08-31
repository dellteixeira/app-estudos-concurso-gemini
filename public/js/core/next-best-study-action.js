(function installNextBestStudyAction(global){
'use strict';
if(global.AppNextBestStudyAction)return;

const SCHEMA_VERSION=1;
const METHOD_LABELS=Object.freeze({
  active_recall:'Recuperação ativa',
  short_review:'Revisão curta',
  questions:'Questões',
  focused_restudy:'Reestudo focado',
  teoria:'Teoria',
  videoaula:'Videoaula',
  lei_seca:'Lei seca'
});
const DEFAULT_METHODS=Object.freeze({
  forgetting:['active_recall','short_review','questions'],
  false_mastery:['questions','active_recall','focused_restudy'],
  overconfidence:['questions','active_recall','short_review'],
  application:['questions','focused_restudy','active_recall'],
  persistent:['focused_restudy','questions','teoria']
});
const safe=(value,max=360)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const finite=value=>value==null||value===''?null:(Number.isFinite(Number(value))?Number(value):null);

function daysSince(value,now=Date.now()){
  const parsed=Date.parse(value||'');
  if(!Number.isFinite(parsed))return null;
  return Math.max(0,(now-parsed)/86400000);
}

function errorForTopic(profile,topicId){
  const errors=Array.isArray(profile?.recurringErrors)?profile.recurringErrors:[];
  return errors.filter(item=>item?.topicId===topicId).sort((a,b)=>(Number(b?.severity)||0)-(Number(a?.severity)||0))[0]||null;
}

function methodScore(profile,method){
  const value=profile?.methodEffectiveness?.[method];
  if(!value)return null;
  const score=finite(value.score);
  const samples=Math.max(0,Number(value.samples)||0);
  if(score==null||samples<2)return null;
  return {score:clamp(score,0,100),samples};
}

function chooseMethod(profile,error,state={}){
  const preferred=DEFAULT_METHODS[error?.type]||(
    finite(state.accuracy)!=null&&Number(state.accuracy)<65
      ?['questions','active_recall','focused_restudy']
      :finite(state.retention)!=null&&Number(state.retention)<65
        ?['active_recall','short_review','questions']
        :['short_review','questions','active_recall']
  );
  const ranked=preferred.map((method,index)=>{
    const history=methodScore(profile,method);
    const prior=Math.max(0,30-index*6);
    const historical=history?history.score*.7:50*.7;
    return {method,score:Math.round(historical+prior),history};
  }).sort((a,b)=>b.score-a.score);
  return ranked[0]||{method:'short_review',score:50,history:null};
}

function scoreTopic(profile,topicId,state={},now=Date.now()){
  const retention=finite(state.retention);
  const accuracy=finite(state.accuracy);
  const confidence=finite(state.confidence);
  const lapseCount=Math.max(0,Number(state.lapseCount)||0);
  const reviewCount=Math.max(0,Number(state.reviewCount)||0);
  const difficulty=clamp(state.difficulty||5,1,10);
  const ageDays=daysSince(state.lastStudyAt,now);
  const error=errorForTopic(profile,topicId);

  const retentionRisk=retention==null?18:clamp((75-retention)*1.15,0,42);
  const accuracyRisk=accuracy==null?10:clamp((70-accuracy)*1.05,0,34);
  const errorRisk=clamp((Number(error?.severity)||0)*.34,0,34);
  const lapseRisk=clamp(lapseCount*4.5,0,18);
  const difficultyRisk=clamp((difficulty-5)*2.5,0,12);
  const neglectRisk=ageDays==null?0:clamp((ageDays-3)*1.6,0,16);
  const confidenceMismatch=confidence!=null&&accuracy!=null&&confidence>=.75&&accuracy<65?8:0;
  const overreviewPenalty=reviewCount>=8&&retention!=null&&retention>=80&&accuracy!=null&&accuracy>=80?10:0;
  const total=Math.round(clamp(retentionRisk+accuracyRisk+errorRisk+lapseRisk+difficultyRisk+neglectRisk+confidenceMismatch-overreviewPenalty,0,100));

  const factors=[];
  if(retentionRisk>=12)factors.push(`retenção ${Math.round(retention??0)}%`);
  if(accuracyRisk>=10)factors.push(`acurácia ${Math.round(accuracy??0)}%`);
  if(error)factors.push(`${safe(error.label||error.type,80)} (sev. ${Math.round(error.severity||0)})`);
  if(lapseCount>0)factors.push(`${lapseCount} lapso${lapseCount===1?'':'s'}`);
  if(ageDays!=null&&ageDays>=5)factors.push(`${Math.round(ageDays)} dias sem estudo`);
  if(confidenceMismatch)factors.push('confiança acima do desempenho');

  const method=chooseMethod(profile,error,state);
  return {
    topicId:safe(topicId,640),
    materia:safe(state.materia,180),
    assunto:safe(state.assunto,400),
    score:total,
    method:method.method,
    methodLabel:METHOD_LABELS[method.method]||method.method,
    methodEvidence:method.history,
    errorType:error?.type||null,
    errorLabel:error?.label||null,
    factors,
    metrics:{retention,accuracy,confidence,lapseCount,reviewCount,difficulty,daysSinceStudy:ageDays==null?null:Number(ageDays.toFixed(1))}
  };
}

function suggestedMinutes(profile,score){
  const fatigue=finite(profile?.metrics?.fatigueIndex)??0;
  if(fatigue>=75)return 15;
  if(fatigue>=55)return 20;
  if(score>=80)return 35;
  if(score>=60)return 30;
  return 25;
}

function recommend(profile={},options={}){
  const topicState=profile?.topicState&&typeof profile.topicState==='object'?profile.topicState:{};
  const ranked=Object.entries(topicState)
    .map(([topicId,state])=>scoreTopic(profile,topicId,state,options.now||Date.now()))
    .filter(item=>item.score>0)
    .sort((a,b)=>b.score-a.score||a.materia.localeCompare(b.materia)||a.assunto.localeCompare(b.assunto));
  if(!ranked.length)return null;
  const best=ranked[0];
  const alternatives=ranked.slice(1,4).map(item=>({topicId:item.topicId,materia:item.materia,assunto:item.assunto,score:item.score,method:item.method,methodLabel:item.methodLabel}));
  return {
    schemaVersion:SCHEMA_VERSION,
    generatedAt:new Date(options.now||Date.now()).toISOString(),
    userId:safe(profile.userId,120),
    contest:safe(profile.contest,180),
    topicId:best.topicId,
    materia:best.materia,
    assunto:best.assunto,
    priorityScore:best.score,
    method:best.method,
    methodLabel:best.methodLabel,
    suggestedMinutes:suggestedMinutes(profile,best.score),
    reasons:best.factors.length?best.factors:['prioridade cognitiva relativa mais alta'],
    metrics:best.metrics,
    methodEvidence:best.methodEvidence,
    errorType:best.errorType,
    errorLabel:best.errorLabel,
    alternatives
  };
}

let latest=null;
function refreshFromProfile(userId,contest){
  try{
    const profile=global.AppCognitiveProfile?.read?.(userId,contest);
    if(!profile)return null;
    latest=recommend(profile);
    if(latest){
      global.dispatchEvent?.(new CustomEvent('app:next-best-study-action',{detail:latest}));
    }
    return latest;
  }catch(_){return null}
}

function handleProfileUpdated(event){
  const detail=event?.detail||{};
  if(detail.userId&&detail.contest)refreshFromProfile(detail.userId,detail.contest);
}

global.addEventListener?.('app:cognitive-profile-updated',handleProfileUpdated);

global.AppNextBestStudyAction=Object.freeze({
  schemaVersion:SCHEMA_VERSION,
  methodLabels:{...METHOD_LABELS},
  scoreTopic,
  chooseMethod,
  suggestedMinutes,
  recommend,
  refreshFromProfile,
  latest:()=>latest
});
})(window);

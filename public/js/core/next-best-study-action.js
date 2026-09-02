(function installNextBestStudyAction(global){
'use strict';
if(global.AppNextBestStudyAction)return;

const SCHEMA_VERSION=2;
const METHOD_LABELS=Object.freeze({active_recall:'Recuperação ativa',short_review:'Revisão curta',questions:'Questões',focused_restudy:'Reestudo focado',teoria:'Teoria',videoaula:'Videoaula',lei_seca:'Lei seca'});
const DEFAULT_METHODS=Object.freeze({forgetting:['active_recall','short_review','questions'],false_mastery:['questions','active_recall','focused_restudy'],overconfidence:['questions','active_recall','short_review'],application:['questions','focused_restudy','active_recall'],persistent:['focused_restudy','questions','teoria']});
const safe=(value,max=360)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const finite=value=>value==null||value===''?null:(Number.isFinite(Number(value))?Number(value):null);
const assessment=()=>global.AppTopicAssessment||null;

function daysSince(value,now=Date.now()){const parsed=Date.parse(value||'');return Number.isFinite(parsed)?Math.max(0,(now-parsed)/86400000):null}
function normalized(state={}){
  const shared=assessment()?.normalizeTopicState?.(state);if(shared)return shared;
  const retention=finite(state.retention),accuracy=finite(state.accuracy);
  return {retention,accuracy,confidence:finite(state.confidence),lapseCount:Math.max(0,Number(state.lapseCount)||0),reviewCount:Math.max(0,Number(state.reviewCount)||0),difficulty:clamp(state.difficulty||5,1,10),lastStudyAt:safe(state.lastStudyAt,80),materia:safe(state.materia,180),assunto:safe(state.assunto,400)};
}
function errorForTopic(profile,topicId){const errors=Array.isArray(profile?.recurringErrors)?profile.recurringErrors:[];return errors.filter(item=>item?.topicId===topicId).sort((a,b)=>(Number(b?.severity)||0)-(Number(a?.severity)||0))[0]||null}
function methodScore(profile,method){const value=profile?.methodEffectiveness?.[method];if(!value)return null;const score=finite(value.score),samples=Math.max(0,Number(value.samples)||0);return score==null||samples<2?null:{score:clamp(score,0,100),samples}}
function chooseMethod(profile,error,state={}){
  const s=normalized(state);
  const preferred=DEFAULT_METHODS[error?.type]||(s.accuracy!=null&&s.accuracy<65?['questions','active_recall','focused_restudy']:s.retention!=null&&s.retention<65?['active_recall','short_review','questions']:['short_review','questions','active_recall']);
  const ranked=preferred.map((method,index)=>{const history=methodScore(profile,method),prior=Math.max(0,30-index*6),historical=history?history.score*.7:35;return {method,score:Math.round(historical+prior),history}}).sort((a,b)=>b.score-a.score);
  return ranked[0]||{method:'short_review',score:50,history:null};
}
function boardSignalForTopic(profile,state={}){try{return global.AppExamBoardIntelligence?.signalForTopic?.(profile?.contest,state?.materia,state?.assunto)||null}catch(_){return null}}
function scoreTopic(profile,topicId,state={},now=Date.now()){
  const s=normalized(state),retention=s.retention,accuracy=s.accuracy,confidence=s.confidence,lapseCount=s.lapseCount,reviewCount=s.reviewCount,difficulty=s.difficulty,ageDays=daysSince(s.lastStudyAt,now);
  const error=errorForTopic(profile,topicId),boardSignal=boardSignalForTopic(profile,state);
  const retentionRisk=retention==null?18:clamp((75-retention)*1.15,0,42),accuracyRisk=accuracy==null?10:clamp((70-accuracy)*1.05,0,34),errorRisk=clamp((Number(error?.severity)||0)*.34,0,34),lapseRisk=clamp(lapseCount*4.5,0,18),difficultyRisk=clamp((difficulty-5)*2.5,0,12),neglectRisk=ageDays==null?0:clamp((ageDays-3)*1.6,0,16),confidenceMismatch=confidence!=null&&accuracy!=null&&confidence>=.75&&accuracy<65?8:0,overreviewPenalty=reviewCount>=8&&retention!=null&&retention>=80&&accuracy!=null&&accuracy>=80?10:0;
  const boardRisk=boardSignal?clamp((Number(boardSignal.priority)||0)*.18*((Number(boardSignal.confidence)||0)/100),0,18):0;
  const total=Math.round(clamp(retentionRisk+accuracyRisk+errorRisk+lapseRisk+difficultyRisk+neglectRisk+confidenceMismatch+boardRisk-overreviewPenalty,0,100));
  const factors=[];if(retentionRisk>=12)factors.push(`retenção ${Math.round(retention??0)}%`);if(accuracyRisk>=10)factors.push(`acurácia ${Math.round(accuracy??0)}%`);if(error)factors.push(`${safe(error.label||error.type,80)} (sev. ${Math.round(error.severity||0)})`);if(lapseCount>0)factors.push(`${lapseCount} lapso${lapseCount===1?'':'s'}`);if(ageDays!=null&&ageDays>=5)factors.push(`${Math.round(ageDays)} dias sem estudo`);if(confidenceMismatch)factors.push('confiança acima do desempenho');if(boardRisk>=3&&boardSignal)factors.push(`incidência ${boardSignal.board}: ${Math.round(boardSignal.priority)}% (conf. ${Math.round(boardSignal.confidence)}%)`);
  const method=chooseMethod(profile,error,state);
  return {topicId:safe(topicId,640),materia:safe(state.materia,180),assunto:safe(state.assunto,400),score:total,method:method.method,methodLabel:METHOD_LABELS[method.method]||method.method,methodEvidence:method.history,errorType:error?.type||null,errorLabel:error?.label||null,
    boardEvidence:boardSignal?{board:safe(boardSignal.board,120),priority:Math.round(Number(boardSignal.priority)||0),confidence:Math.round(Number(boardSignal.confidence)||0),questions:Math.max(0,Number(boardSignal.questions)||0),years:Math.max(0,Number(boardSignal.years)||0),source:boardSignal.source||null,asOf:boardSignal.asOf||null}:null,
    factors,metrics:{retention,accuracy,confidence,lapseCount,reviewCount,difficulty,daysSinceStudy:ageDays==null?null:Number(ageDays.toFixed(1)),boardPriority:boardSignal?Math.round(Number(boardSignal.priority)||0):null,boardConfidence:boardSignal?Math.round(Number(boardSignal.confidence)||0):null},assessment:assessment()?.assessTopic?.(profile,topicId,state)||null};
}
function suggestedMinutes(profile,score){const fatigue=finite(profile?.metrics?.fatigueIndex)??0;if(fatigue>=75)return 15;if(fatigue>=55)return 20;if(score>=80)return 35;if(score>=60)return 30;return 25}
function recommend(profile={},options={}){
  const topicState=profile?.topicState&&typeof profile.topicState==='object'?profile.topicState:{};
  const ranked=Object.entries(topicState).map(([topicId,state])=>scoreTopic(profile,topicId,state,options.now||Date.now())).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.materia.localeCompare(b.materia)||a.assunto.localeCompare(b.assunto));
  if(!ranked.length)return null;const best=ranked[0],alternatives=ranked.slice(1,4).map(item=>({topicId:item.topicId,materia:item.materia,assunto:item.assunto,score:item.score,method:item.method,methodLabel:item.methodLabel,boardEvidence:item.boardEvidence}));
  return {schemaVersion:SCHEMA_VERSION,generatedAt:new Date(options.now||Date.now()).toISOString(),userId:safe(profile.userId,120),contest:safe(profile.contest,180),topicId:best.topicId,materia:best.materia,assunto:best.assunto,priorityScore:best.score,method:best.method,methodLabel:best.methodLabel,suggestedMinutes:suggestedMinutes(profile,best.score),reasons:best.factors.length?best.factors:['prioridade cognitiva relativa mais alta'],metrics:best.metrics,methodEvidence:best.methodEvidence,boardEvidence:best.boardEvidence,errorType:best.errorType,errorLabel:best.errorLabel,assessment:best.assessment,alternatives};
}
let latest=null;
function refreshFromProfile(userId,contest){try{const profile=global.AppCognitiveProfile?.peek?.(userId,contest)||global.AppCognitiveProfile?.read?.(userId,contest);if(!profile)return null;latest=recommend(profile);if(latest)global.dispatchEvent?.(new CustomEvent('app:next-best-study-action',{detail:latest}));return latest}catch(_){return null}}
function handleProfileUpdated(event){const detail=event?.detail||{};if(detail.userId&&detail.contest)refreshFromProfile(detail.userId,detail.contest)}
global.addEventListener?.('app:cognitive-profile-updated',handleProfileUpdated);
global.AppNextBestStudyAction=Object.freeze({schemaVersion:SCHEMA_VERSION,methodLabels:{...METHOD_LABELS},scoreTopic,chooseMethod,boardSignalForTopic,suggestedMinutes,recommend,refreshFromProfile,latest:()=>latest});
})(window);

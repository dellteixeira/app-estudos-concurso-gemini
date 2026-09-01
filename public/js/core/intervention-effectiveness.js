(function installInterventionEffectiveness(global){
'use strict';
if(global.AppInterventionEffectiveness)return;

const SCHEMA_VERSION=1;
const STORAGE_PREFIX='intervention_effectiveness_v1';
const MAX_EVENTS=1200;
const START_DEDUP_MS=30*1000;
const METHODS=['active_recall','short_review','questions','focused_restudy','teoria','videoaula','lei_seca'];
const METHOD_LABELS=Object.freeze({
  active_recall:'Recuperação ativa',
  short_review:'Revisão curta',
  questions:'Questões comentadas',
  focused_restudy:'Reestudo focalizado',
  teoria:'Teoria',
  videoaula:'Videoaula',
  lei_seca:'Lei Seca'
});
const WINDOWS=Object.freeze({immediate:0,h24:20*60*60*1000,d7:6*24*60*60*1000});
const WINDOW_ORDER=['immediate','h24','d7'];
const LAYER_METHODS=Object.freeze({1:'active_recall',2:'short_review',3:'questions',4:'focused_restudy'});
const LAYER_COOLDOWN_MS=24*60*60*1000;
const LAYER_REPEAT_WINDOW_MS=7*24*60*60*1000;

const safe=(value,max=300)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const mean=values=>{
  const valid=values.map(Number).filter(Number.isFinite);
  return valid.length?valid.reduce((sum,value)=>sum+value,0)/valid.length:null;
};
const nowIso=()=>new Date().toISOString();
const finite=value=>value==null||value===''?null:(Number.isFinite(Number(value))?Number(value):null);

function scopeKey(userId,contest){
  const uid=safe(userId||'guest',120).replace(/[^a-z0-9_.-]+/gi,'_');
  const exam=safe(contest||'Concurso Geral',160).replace(/[^a-z0-9_.-]+/gi,'_');
  return `${STORAGE_PREFIX}_${uid}_${exam}`;
}

function normalizePercent(value){
  const n=finite(value);
  if(n==null)return null;
  if(n>=0&&n<=1)return clamp(n*100,0,100);
  return clamp(n,0,100);
}

function normalizeMetricSnapshot(value={}){
  return {
    retention:normalizePercent(value.retention),
    accuracy:normalizePercent(value.accuracy),
    confidence:finite(value.confidence)==null?null:clamp(value.confidence,0,1),
    lapseCount:Math.max(0,Number(value.lapseCount)||0),
    reviewCount:Math.max(0,Number(value.reviewCount)||0),
    sessionCount:Math.max(0,Number(value.sessionCount)||0),
    totalMinutes:Math.max(0,Number(value.totalMinutes)||0),
    lastStudyAt:safe(value.lastStudyAt||'',60)
  };
}

function readEvents(userId,contest){
  try{
    const parsed=JSON.parse(global.localStorage?.getItem(scopeKey(userId,contest))||'null');
    if(!parsed||parsed.schemaVersion!==SCHEMA_VERSION||!Array.isArray(parsed.events))return [];
    return parsed.events.filter(Boolean).slice(-MAX_EVENTS);
  }catch(_){return[]}
}

function writeEvents(userId,contest,events){
  try{
    const payload={schemaVersion:SCHEMA_VERSION,updatedAt:nowIso(),events:(Array.isArray(events)?events:[]).slice(-MAX_EVENTS)};
    global.localStorage?.setItem(scopeKey(userId,contest),JSON.stringify(payload));
    return true;
  }catch(_){return false}
}

function appendEvent(userId,contest,event){
  if(!userId||!contest||!event)return null;
  const events=readEvents(userId,contest);
  const entry={...event,id:safe(event.id||`${Date.now()}_${Math.random().toString(36).slice(2,10)}`,80),at:safe(event.at||nowIso(),60)};
  events.push(entry);
  writeEvents(userId,contest,events);
  try{global.dispatchEvent(new CustomEvent('app:intervention-effectiveness-event',{detail:{userId,contest,event:entry}}))}catch(_){}
  return entry;
}

function getProfileContext(){
  try{
    const source=global.AppCognitiveDataSource?.snapshot?.();
    if(source?.userId&&source?.contest)return {userId:String(source.userId),contest:String(source.contest)};
  }catch(_){}
  return {userId:'',contest:''};
}

function resolveTopicState(userId,contest,topicId){
  try{
    const profile=global.AppCognitiveProfile?.read?.(userId,contest);
    return profile?.topicState?.[topicId]||null;
  }catch(_){return null}
}

function recentEquivalentStart(events,topicId,method,now=Date.now()){
  for(let index=events.length-1;index>=0;index--){
    const event=events[index];
    if(event?.type!=='started')continue;
    const age=now-(Date.parse(event.at)||0);
    if(age>START_DEDUP_MS)break;
    if(event.topicId===topicId&&event.method===method)return event;
  }
  return null;
}

function start(input={}){
  const context=getProfileContext();
  const userId=safe(input.userId||context.userId,120);
  const contest=safe(input.contest||context.contest||'Concurso Geral',180);
  const method=safe(input.method||input.action,60);
  const topicId=safe(input.topicId,640);
  if(!userId||!topicId||!METHODS.includes(method))return null;
  const events=readEvents(userId,contest);
  const duplicate=recentEquivalentStart(events,topicId,method,input.now||Date.now());
  if(duplicate)return duplicate;
  const existingState=resolveTopicState(userId,contest,topicId);
  const baseline=normalizeMetricSnapshot(input.baseline||existingState||{});
  return appendEvent(userId,contest,{
    type:'started',
    interventionId:safe(input.interventionId||`iv_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,80),
    topicId,
    materia:safe(input.materia||existingState?.materia,180),
    assunto:safe(input.assunto||existingState?.assunto,400),
    method,
    source:safe(input.source||'advisor',40),
    suggestedMinutes:Math.max(0,Number(input.suggestedMinutes)||0),
    baseline,
    recommended:Boolean(input.recommended!==false)
  });
}

function observationExists(events,interventionId,windowName){
  return events.some(event=>event?.type==='observed'&&event?.interventionId===interventionId&&event?.window===windowName);
}

function hasNewEvidence(baseline,current){
  if(!current)return false;
  if(Number(current.sessionCount)>Number(baseline.sessionCount))return true;
  if(Number(current.reviewCount)>Number(baseline.reviewCount))return true;
  if(Number(current.totalMinutes)>Number(baseline.totalMinutes))return true;
  const oldTime=Date.parse(baseline.lastStudyAt||0)||0;
  const newTime=Date.parse(current.lastStudyAt||0)||0;
  return newTime>oldTime;
}

function dueWindow(startedAt,events,interventionId,current,baseline,now=Date.now()){
  const age=Math.max(0,Number(now)-(Date.parse(startedAt)||0));
  for(const windowName of WINDOW_ORDER){
    if(observationExists(events,interventionId,windowName))continue;
    if(age<WINDOWS[windowName])continue;
    if(windowName==='immediate'&&!hasNewEvidence(baseline,current))continue;
    return windowName;
  }
  return null;
}

function gain(current,baseline,key){
  const a=finite(current?.[key]);
  const b=finite(baseline?.[key]);
  if(a==null||b==null)return null;
  return Number((a-b).toFixed(2));
}

function observeDue(input={}){
  const context=getProfileContext();
  const userId=safe(input.userId||context.userId,120);
  const contest=safe(input.contest||context.contest||'Concurso Geral',180);
  if(!userId)return [];
  const events=readEvents(userId,contest);
  const starts=events.filter(event=>event?.type==='started');
  const appended=[];
  for(const started of starts){
    const current=normalizeMetricSnapshot(input.topicState?.[started.topicId]||resolveTopicState(userId,contest,started.topicId)||{});
    const baseline=normalizeMetricSnapshot(started.baseline||{});
    const windowName=dueWindow(started.at,events,started.interventionId,current,baseline,input.now||Date.now());
    if(!windowName)continue;
    const observation=appendEvent(userId,contest,{
      type:'observed',
      interventionId:started.interventionId,
      topicId:started.topicId,
      method:started.method,
      window:windowName,
      source:started.source,
      current,
      gain:{
        retention:gain(current,baseline,'retention'),
        accuracy:gain(current,baseline,'accuracy'),
        confidence:gain(current,baseline,'confidence')
      }
    });
    if(observation){events.push(observation);appended.push(observation)}
  }
  return appended;
}

function scoreObservation(observation){
  const retention=finite(observation?.gain?.retention);
  const accuracy=finite(observation?.gain?.accuracy);
  const confidence=finite(observation?.gain?.confidence);
  const components=[];
  if(retention!=null)components.push(retention*0.55);
  if(accuracy!=null)components.push(accuracy*0.4);
  if(confidence!=null)components.push(confidence*20*0.05);
  if(!components.length)return null;
  return components.reduce((sum,value)=>sum+value,0);
}

function aggregate(userId,contest){
  const events=readEvents(userId,contest);
  const starts=events.filter(event=>event?.type==='started');
  const observations=events.filter(event=>event?.type==='observed');
  const result={};
  for(const method of METHODS){
    const methodStarts=starts.filter(event=>event.method===method);
    const methodObs=observations.filter(event=>event.method===method);
    const byWindow=name=>methodObs.filter(event=>event.window===name);
    const retentionGains=name=>byWindow(name).map(event=>finite(event?.gain?.retention)).filter(value=>value!=null);
    const scores=methodObs.map(scoreObservation).filter(value=>value!=null);
    result[method]={
      samples:methodStarts.length,
      observations:methodObs.length,
      immediateGain:mean(retentionGains('immediate')),
      gain24h:mean(retentionGains('h24')),
      gain7d:mean(retentionGains('d7')),
      score:scores.length?Math.round(clamp(50+mean(scores),0,100)):null
    };
  }
  return result;
}

function methodForLayer(layer){
  return LAYER_METHODS[Number(layer)]||'';
}

function layerForMethod(method){
  const found=Object.entries(LAYER_METHODS).find(([,value])=>value===method);
  return found?Number(found[0]):null;
}

function latestObservationFor(events,interventionId){
  const matches=(Array.isArray(events)?events:[]).filter(event=>event?.type==='observed'&&event?.interventionId===interventionId);
  return matches.sort((a,b)=>(Date.parse(a?.at)||0)-(Date.parse(b?.at)||0)).at(-1)||null;
}

function isPositiveObservation(observation){
  if(!observation)return false;
  const retention=finite(observation?.gain?.retention);
  const accuracy=finite(observation?.gain?.accuracy);
  const confidence=finite(observation?.gain?.confidence);
  return (retention!=null&&retention>=8)||(accuracy!=null&&accuracy>=8)||(confidence!=null&&confidence>=0.1);
}

function nextLayerAfter(layer,accuracy){
  const current=Number(layer)||1;
  if(current===1)return 2;
  if(current===2)return 3;
  if(current===3)return finite(accuracy)!=null&&Number(accuracy)<60?4:1;
  if(current===4)return 3;
  return 1;
}

function summarizeLayeredTopic(input={}){
  const context=getProfileContext();
  const userId=safe(input.userId||context.userId,120);
  const contest=safe(input.contest||context.contest||'Concurso Geral',180);
  const topicId=safe(input.topicId,640);
  const now=Number(input.now)||Date.now();
  const cooldownMs=Math.max(0,Number(input.cooldownMs)||LAYER_COOLDOWN_MS);
  const events=Array.isArray(input.events)?input.events:readEvents(userId,contest);
  const starts=events
    .filter(event=>event?.type==='started'&&event?.topicId===topicId&&layerForMethod(event?.method))
    .sort((a,b)=>(Date.parse(a?.at)||0)-(Date.parse(b?.at)||0));
  const recentStarts=starts.filter(event=>{
    const at=Date.parse(event?.at)||0;
    return at>0&&now-at>=0&&now-at<=cooldownMs;
  });
  const statuses={};
  for(const [layerText,method] of Object.entries(LAYER_METHODS)){
    const layer=Number(layerText);
    const latest=starts.filter(event=>event.method===method).at(-1)||null;
    if(!latest)continue;
    const observation=latestObservationFor(events,latest.interventionId);
    const age=now-(Date.parse(latest.at)||0);
    if(observation){
      statuses[layer]={state:'validated',startedAt:latest.at,observedAt:observation.at,positive:isPositiveObservation(observation)};
    }else if(age>=0&&age<=cooldownMs){
      statuses[layer]={state:'started',startedAt:latest.at,observedAt:null,positive:false};
    }
  }
  return {events,starts,recentStarts,statuses,latestStart:starts.at(-1)||null};
}

function resolveLayeredReview(input={}){
  const baseLayer=clamp(Math.round(Number(input.baseLayer)||1),1,4);
  const retention=finite(input.retention);
  const accuracy=finite(input.accuracy);
  const now=Number(input.now)||Date.now();
  const summary=summarizeLayeredTopic({...input,now});
  let recommendedLayer=baseLayer;
  let reason=safe(input.baseReason||'',500)||'Recomendação calculada pelo estado atual do assunto.';
  const baseMethod=methodForLayer(baseLayer);
  const sameBaseRecent=[...summary.recentStarts].reverse().find(event=>event.method===baseMethod)||null;

  if(sameBaseRecent){
    recommendedLayer=nextLayerAfter(baseLayer,accuracy);
    if(baseLayer===2&&accuracy!=null&&accuracy<75){
      reason='A revisão curta já foi iniciada recentemente. Como o desempenho em questões ainda está abaixo do alvo, valide agora a aplicação prática por questões.';
    }else if(baseLayer===3&&accuracy!=null&&accuracy<60){
      reason='Uma bateria de questões já foi iniciada recentemente e o desempenho continua baixo. Escale para reestudo direcionado antes de testar novamente.';
    }else if(baseLayer===4){
      reason='O reestudo já foi iniciado recentemente. A próxima ação deve validar a recuperação do conteúdo por questões.';
    }else{
      reason='Esta intervenção já foi iniciada recentemente. O app avançou para a próxima estratégia para evitar repetição sem nova evidência.';
    }
  }

  const latestRecent=summary.recentStarts.at(-1)||null;
  if(!sameBaseRecent&&latestRecent){
    const latestLayer=layerForMethod(latestRecent.method);
    if(latestLayer===2&&accuracy!=null&&accuracy<75){
      recommendedLayer=3;
      reason='A revisão curta já foi tentada recentemente. O próximo passo é medir aplicação e discriminação do conteúdo por questões.';
    }else if(latestLayer===3&&accuracy!=null&&accuracy<60){
      recommendedLayer=4;
      reason='As questões recentes ainda indicam dificuldade relevante. Faça reestudo direcionado antes de uma nova validação.';
    }else if(latestLayer===4){
      recommendedLayer=3;
      reason='Após o reestudo recente, valide o ganho com uma bateria curta de questões.';
    }else if(latestLayer===1&&baseLayer===1){
      recommendedLayer=2;
      reason='A recuperação mental já foi tentada recentemente. Avance para uma revisão curta e dirigida.';
    }
  }

  const repeatCutoff=now-(Math.max(0,Number(input.repeatWindowMs)||LAYER_REPEAT_WINDOW_MS));
  const baseStarts=summary.starts.filter(event=>event.method===baseMethod&&(Date.parse(event.at)||0)>=repeatCutoff);
  if(baseStarts.length>=2){
    const positive=baseStarts.some(started=>isPositiveObservation(latestObservationFor(summary.events,started.interventionId)));
    if(!positive&&recommendedLayer===baseLayer){
      recommendedLayer=nextLayerAfter(baseLayer,accuracy);
      reason='A mesma estratégia foi tentada duas vezes recentemente sem melhora objetiva registrada. O app mudou a intervenção para evitar repetição improdutiva.';
    }
  }

  if(retention!=null&&retention>=85&&accuracy!=null&&accuracy<75&&summary.recentStarts.some(event=>event.method==='short_review')){
    recommendedLayer=3;
    reason='A retenção está preservada, mas o desempenho em questões ainda está abaixo do alvo. Priorize validação prática em vez de repetir revisão curta.';
  }

  return {recommendedLayer,reason,statuses:summary.statuses,summary,cooldownMs:Math.max(0,Number(input.cooldownMs)||LAYER_COOLDOWN_MS)};
}

function methodFromRecommendedCard(card){
  const text=safe(card?.querySelector?.('.learning-advisor-action strong')?.textContent,180).toLowerCase();
  if(!text)return '';
  return METHODS.find(method=>text.includes(String(METHOD_LABELS[method]||'').toLowerCase()))||'';
}

function handleInterventionStarted(event){
  const detail=event?.detail||{};
  start({
    topicId:detail.topicId,
    materia:detail.materia,
    assunto:detail.assunto,
    method:detail.method||detail.recommendedAction,
    source:detail.source||'learning-advisor',
    suggestedMinutes:detail.suggestedMinutes,
    baseline:detail.baseline,
    recommended:detail.recommended
  });
}

function handleAdvisorActionClick(event){
  const button=event?.target?.closest?.('[data-learning-action="local-intervention"], [data-learning-action="manual-method"]');
  if(!button)return;
  const card=button.closest('.learning-advisor-card');
  const topicId=safe(card?.dataset?.topicId,640);
  const manual=button.dataset.learningAction==='manual-method';
  const method=manual
    ?safe(card?.querySelector?.('[data-learning-method-select]')?.value,60)
    :methodFromRecommendedCard(card);
  if(!topicId||!METHODS.includes(method))return;
  start({topicId,method,source:manual?'manual':'learning-advisor',recommended:!manual});
}

function handleProfileUpdated(event){
  const detail=event?.detail||{};
  if(!detail.userId||!detail.contest)return;
  observeDue({userId:detail.userId,contest:detail.contest});
}

global.addEventListener?.('learning-advisor:intervention-started',handleInterventionStarted);
global.addEventListener?.('app:cognitive-profile-updated',handleProfileUpdated);
if(typeof document!=='undefined'&&!document.documentElement?.dataset?.interventionEffectivenessBound){
  if(document.documentElement)document.documentElement.dataset.interventionEffectivenessBound='1';
  document.addEventListener('click',handleAdvisorActionClick,true);
}

global.AppInterventionEffectiveness=Object.freeze({
  schemaVersion:SCHEMA_VERSION,
  methods:[...METHODS],
  methodLabels:{...METHOD_LABELS},
  windows:{...WINDOWS},
  scopeKey,
  readEvents,
  appendEvent,
  start,
  observeDue,
  aggregate,
  normalizeMetricSnapshot,
  dueWindow,
  scoreObservation,
  recentEquivalentStart,
  methodForLayer,
  layerForMethod,
  latestObservationFor,
  isPositiveObservation,
  summarizeLayeredTopic,
  resolveLayeredReview,
  methodFromRecommendedCard,
  handleAdvisorActionClick
});
})(window);

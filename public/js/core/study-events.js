(function installStudyEvents(global){
'use strict';
if(global.AppStudyEvents)return;

const SCHEMA_VERSION=1;
const DEDUP_WINDOW_MS=120;
const EVENTS=Object.freeze({
  STATE_CHANGED:'study:state-changed',
  TOPIC_UPDATED:'study:topic-updated',
  CONTEST_CHANGED:'study:contest-changed',
  COGNITIVE_UPDATED:'study:cognitive-updated',
  RECOMMENDATION_UPDATED:'study:recommendation-updated',
  BOARD_UPDATED:'study:board-updated',
  INTERVENTION_EFFECTIVENESS_UPDATED:'study:intervention-effectiveness-updated',
  GUIDANCE_REQUESTED:'study:guidance-requested',
  GUIDANCE_RESOLVED:'study:guidance-resolved',
  STUDY_REQUESTED:'study:study-requested'
});
const LEGACY_BRIDGES=Object.freeze({
  'appstate:changed':EVENTS.STATE_CHANGED,
  'app:cognitive-profile-updated':EVENTS.COGNITIVE_UPDATED,
  'app:next-best-study-action':EVENTS.RECOMMENDATION_UPDATED,
  'app:exam-board-intelligence-updated':EVENTS.BOARD_UPDATED,
  'app:intervention-effectiveness-event':EVENTS.INTERVENTION_EFFECTIVENESS_UPDATED,
  'app:study-now-requested':EVENTS.STUDY_REQUESTED
});

let sequence=0;
let bridgedCount=0;
let emittedCount=0;
let dedupDropped=0;
const recent=new Map();
const subscriptions=new Set();

function safeClone(value){
  if(value==null)return value;
  try{return structuredClone(value)}catch(_){try{return JSON.parse(JSON.stringify(value))}catch(_){return value}}
}
function fingerprint(name,detail){
  let payload='';
  try{payload=JSON.stringify(detail??null)}catch(_){payload=String(detail??'')}
  let hash=2166136261;
  const text=`${name}|${payload}`;
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return (hash>>>0).toString(36);
}
function shouldEmit(name,detail){
  const key=fingerprint(name,detail);
  const now=Date.now();
  const previous=recent.get(key)||0;
  recent.set(key,now);
  if(recent.size>80){
    for(const [candidate,at] of recent){if(now-at>DEDUP_WINDOW_MS*4)recent.delete(candidate)}
  }
  if(now-previous<=DEDUP_WINDOW_MS){dedupDropped+=1;return false}
  return true;
}
function emit(name,detail={},meta={}){
  const eventName=String(name||'').trim();
  if(!eventName)throw new Error('Nome de evento obrigatório.');
  if(!shouldEmit(eventName,detail))return null;
  const envelope=Object.freeze({
    schemaVersion:SCHEMA_VERSION,
    eventId:`study-${Date.now().toString(36)}-${(++sequence).toString(36)}`,
    name:eventName,
    at:new Date().toISOString(),
    source:String(meta.source||'app'),
    legacySource:meta.legacySource?String(meta.legacySource):null,
    detail:safeClone(detail)
  });
  emittedCount+=1;
  global.dispatchEvent?.(new CustomEvent(eventName,{detail:envelope}));
  return envelope;
}
function on(name,listener,options={}){
  if(typeof listener!=='function')throw new TypeError('listener must be a function');
  const eventName=String(name||'').trim();
  const handler=event=>listener(event?.detail?.detail??event?.detail,event?.detail||null,event);
  global.addEventListener?.(eventName,handler,options);
  const unsubscribe=()=>global.removeEventListener?.(eventName,handler,options);
  subscriptions.add(unsubscribe);
  return ()=>{subscriptions.delete(unsubscribe);unsubscribe()};
}
function once(name,listener){return on(name,listener,{once:true})}
function bridgeLegacy(){
  Object.entries(LEGACY_BRIDGES).forEach(([legacy,canonical])=>{
    global.addEventListener?.(legacy,event=>{
      bridgedCount+=1;
      emit(canonical,event?.detail||{}, {source:'legacy-bridge',legacySource:legacy});
    });
  });
}
function getSnapshot(){
  try{return global.AppState?.getSnapshot?.('study-events')||null}catch(_){return null}
}
function getDiagnostics(){
  return Object.freeze({
    schemaVersion:SCHEMA_VERSION,
    sequence,
    emittedCount,
    bridgedCount,
    dedupDropped,
    activeSubscriptions:subscriptions.size,
    canonicalEvents:Object.values(EVENTS),
    legacyBridges:{...LEGACY_BRIDGES}
  });
}
function loadHardeningScript(src,marker){
  return new Promise((resolve,reject)=>{
    const selector=`script[data-study-hardening="${marker}"]`;
    const existing=document.querySelector?.(selector);
    if(existing){
      if(existing.dataset.loaded==='1')return resolve(existing);
      existing.addEventListener('load',()=>resolve(existing),{once:true});
      existing.addEventListener('error',reject,{once:true});
      return;
    }
    const script=document.createElement('script');
    script.src=src;
    script.async=false;
    script.dataset.studyHardening=marker;
    script.addEventListener('load',()=>{script.dataset.loaded='1';resolve(script)},{once:true});
    script.addEventListener('error',reject,{once:true});
    (document.head||document.documentElement).appendChild(script);
  });
}
function bootstrapHardening(){
  const tasks=[];
  if(!global.OfflineSyncCoordinator)tasks.push(loadHardeningScript('./js/core/offline-sync-coordinator.js?v=10.64.28','offline-sync-coordinator').then(()=>global.OfflineSyncCoordinator?.install?.()).catch(error=>console.warn('Coordenador offline indisponível; legado preservado.',error)));
  if(!global.AppStudyObservability)tasks.push(loadHardeningScript('./js/core/study-observability.js?v=10.64.28','study-observability').catch(error=>console.warn('Observabilidade de estudo indisponível.',error)));
  return Promise.allSettled(tasks);
}
function stop(){
  [...subscriptions].forEach(unsubscribe=>{try{unsubscribe()}catch(_){}});
  subscriptions.clear();
}

bridgeLegacy();
global.AppStudyEvents=Object.freeze({schemaVersion:SCHEMA_VERSION,EVENTS,legacyBridges:{...LEGACY_BRIDGES},emit,on,once,getSnapshot,getDiagnostics,bootstrapHardening,stop});
global.dispatchEvent?.(new CustomEvent('study:events-ready',{detail:{schemaVersion:SCHEMA_VERSION}}));
bootstrapHardening();
})(window);

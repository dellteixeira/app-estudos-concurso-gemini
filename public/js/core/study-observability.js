(function installStudyObservability(global){
'use strict';
if(global.AppStudyObservability)return;

const SCHEMA_VERSION=1;
const HISTORY_LIMIT=80;
const counts=Object.create(null);
const guidanceSources=Object.create(null);
const history=[];
const unsubscribers=[];
let started=false;
let longTaskCount=0;
let longTaskDurationMs=0;
let performanceObserver=null;

function increment(map,key){const normalized=String(key||'unknown');map[normalized]=(map[normalized]||0)+1}
function push(entry){history.push(Object.freeze(entry));if(history.length>HISTORY_LIMIT)history.splice(0,history.length-HISTORY_LIMIT)}
function record(name,detail,envelope){
  increment(counts,name);
  if(name==='study:guidance-resolved')increment(guidanceSources,detail?.source||detail?.provider||'unknown');
  push({at:new Date().toISOString(),name,source:envelope?.source||null,detail:{
    source:detail?.source||null,
    aiUsed:detail?.aiUsed===true,
    topicId:detail?.topicId||null,
    materia:detail?.materia||null,
    assunto:detail?.assunto||null
  }});
}
function startLongTaskObserver(){
  if(typeof global.PerformanceObserver!=='function')return false;
  try{
    performanceObserver=new global.PerformanceObserver(list=>{
      for(const entry of list.getEntries()){
        if(entry.entryType!=='longtask')continue;
        longTaskCount+=1;
        longTaskDurationMs+=Math.max(0,Number(entry.duration)||0);
      }
    });
    performanceObserver.observe({entryTypes:['longtask']});
    return true;
  }catch(_){performanceObserver=null;return false}
}
function start(){
  if(started)return getDiagnostics();
  const bus=global.AppStudyEvents;
  if(!bus?.on)return getDiagnostics();
  Object.values(bus.EVENTS||{}).forEach(name=>{
    unsubscribers.push(bus.on(name,(detail,envelope)=>record(name,detail,envelope)));
  });
  startLongTaskObserver();
  started=true;
  return getDiagnostics();
}
function reset(){
  Object.keys(counts).forEach(key=>delete counts[key]);
  Object.keys(guidanceSources).forEach(key=>delete guidanceSources[key]);
  history.length=0;
  longTaskCount=0;
  longTaskDurationMs=0;
}
function stop(){
  unsubscribers.splice(0).forEach(fn=>{try{fn()}catch(_){}});
  try{performanceObserver?.disconnect?.()}catch(_){}
  performanceObserver=null;
  started=false;
}
function getDiagnostics(){
  const eventBus=global.AppStudyEvents?.getDiagnostics?.()||null;
  return Object.freeze({
    schemaVersion:SCHEMA_VERSION,
    started,
    eventCounts:Object.freeze({...counts}),
    guidanceSources:Object.freeze({...guidanceSources}),
    longTasks:Object.freeze({count:longTaskCount,durationMs:Math.round(longTaskDurationMs)}),
    eventBus,
    performance:Object.freeze({cognitiveProfile:global.AppCognitiveProfile?.performanceDiagnostics?.()||null,editalIndex:global.AppCognitiveDataSource?.indexDiagnostics?.()||null,predictionCache:global.AppPredictiveAdaptiveTutor?.cacheDiagnostics?.()||null,studyOptimization:global.AppStudyOptimization?.performanceDiagnostics?.()||null}),
    history:[...history]
  });
}

global.AppStudyObservability=Object.freeze({schemaVersion:SCHEMA_VERSION,start,stop,reset,getDiagnostics});
if(global.AppStudyEvents?.on)start();
else global.addEventListener?.('study:events-ready',()=>start(),{once:true});
})(window);

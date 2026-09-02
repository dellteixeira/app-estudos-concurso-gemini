const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const read=rel=>fs.readFileSync(path.join(__dirname,'..',rel),'utf8');
const studyEventsSource=read('public/js/core/study-events.js');
const offlineCoordinatorSource=read('public/js/core/offline-sync-coordinator.js');

function studyEventsRuntime(){
  const listeners=new Map();
  class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail}}
  const context={
    console,Date,JSON,Math,Object,Map,Set,Promise,structuredClone,CustomEvent,
    document:{
      querySelector(){return {dataset:{loaded:'1'},addEventListener(){}}},
      createElement(){return {dataset:{},addEventListener(){}}},
      head:{appendChild(){}},documentElement:{appendChild(){}}
    },
    addEventListener(name,listener){const list=listeners.get(name)||[];list.push(listener);listeners.set(name,list)},
    removeEventListener(name,listener){const list=listeners.get(name)||[];listeners.set(name,list.filter(item=>item!==listener))},
    dispatchEvent(event){for(const listener of [...(listeners.get(event.type)||[])])listener(event);return true;},
    AppState:{getSnapshot:()=>({currentContest:'TJ-CE'})},
    OfflineSyncCoordinator:{install:async()=>({})},
    AppStudyObservability:{}
  };
  context.window=context;
  vm.runInNewContext(studyEventsSource,context,{filename:'study-events.js'});
  return {context,listeners};
}

test('hardening remove versões históricas dos loaders dinâmicos',()=>{
  assert.equal(studyEventsSource.includes('?v=10.64.28'),false);
  assert.equal(offlineCoordinatorSource.includes("ROLLOUT_VERSION='10.56.0'"),false);
  assert.equal(/offline-sync-[^'"`]+\.js\?v=/.test(offlineCoordinatorSource),false);
  assert.match(offlineCoordinatorSource,/ASSET_STRATEGY='canonical-no-store'/);
});

test('stop desmonta também bridges legadas e limpa deduplicação',()=>{
  const {context,listeners}=studyEventsRuntime();
  const legacy='app:next-best-study-action';
  assert.ok((listeners.get(legacy)||[]).length>0);
  const before=context.AppStudyEvents.getDiagnostics();
  assert.equal(before.bridgesInstalled,true);
  assert.ok(before.activeLegacyBridges>0);

  context.AppStudyEvents.stop();

  const after=context.AppStudyEvents.getDiagnostics();
  assert.equal(after.activeSubscriptions,0);
  assert.equal(after.activeLegacyBridges,0);
  assert.equal(after.bridgesInstalled,false);
  assert.equal((listeners.get(legacy)||[]).length,0);
});

test('bridges continuam convertendo legado em evento canônico sem duplicação',()=>{
  const {context}=studyEventsRuntime();
  let count=0;
  context.AppStudyEvents.on(context.AppStudyEvents.EVENTS.RECOMMENDATION_UPDATED,()=>count++);
  const detail={topicId:'constitucional::controle',score:91};
  context.dispatchEvent(new context.CustomEvent('app:next-best-study-action',{detail}));
  context.dispatchEvent(new context.CustomEvent('app:next-best-study-action',{detail}));
  assert.equal(count,1);
  assert.equal(context.AppStudyEvents.getDiagnostics().dedupDropped,1);
});

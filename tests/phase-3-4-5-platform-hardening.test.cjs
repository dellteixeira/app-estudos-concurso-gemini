'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

function makeBusWindow(){
  const listeners=new Map();
  const target={
    setTimeout,
    clearTimeout,
    console,
    CustomEvent:class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail}},
    addEventListener(name,fn){const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list)},
    removeEventListener(name,fn){const list=listeners.get(name)||[];listeners.set(name,list.filter(item=>item!==fn))},
    dispatchEvent(event){for(const fn of [...(listeners.get(event.type)||[])])fn.call(target,event);return true},
    OfflineSyncCoordinator:{install:async()=>true},
    AppStudyObservability:{start:()=>true},
    document:{querySelector:()=>null,createElement:()=>({dataset:{},addEventListener(){}}),head:{appendChild(){}}}
  };
  target.window=target;
  return target;
}

test('Fase 3: asset loader usa a release canônica atual',()=>{
  const source=read('public/js/core/asset-loader.js');
  assert.match(source,/global\.APP_VERSION\|\|'10\.64\.28'/);
  assert.doesNotMatch(source,/10\.64\.22/);
});

test('Fase 4: coordenador preserva cadeia histórica e usa assets canônicos sem hardcode',()=>{
  const source=read('public/js/core/offline-sync-coordinator.js');
  assert.match(source,/const ASSET_STRATEGY='canonical-no-store'/);
  assert.doesNotMatch(source,/ROLLOUT_VERSION/,'o coordenador não deve carregar uma versão histórica hardcoded');
  assert.doesNotMatch(source,/\?v=/,'módulos offline devem usar o caminho canônico sem query-string de release');
  assert.match(source,/path:`\.\/js\/core\/\$\{file\}`/,'cada módulo deve resolver pelo caminho canônico');
  const modules=[...source.matchAll(/\['(Offline[^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+\.js)'\]/g)];
  assert.equal(modules.length,19,'a cadeia histórica deve permanecer completa nesta etapa de consolidação');
  assert.equal(new Set(modules.map(match=>match[1])).size,19,'cada autoridade offline deve aparecer uma única vez');
  assert.match(source,/if\(installed&&!options\.force\)return getDiagnostics\(\)/);
  assert.match(source,/if\(installPromise\)return installPromise/);
  assert.match(source,/assetStrategy:ASSET_STRATEGY/,'diagnósticos devem declarar explicitamente a estratégia canônica');
});

test('Fase 5: barramento contabiliza eventos deduplicados sem reemitir',()=>{
  const window=makeBusWindow();
  const context=vm.createContext({window,console,setTimeout,clearTimeout,structuredClone,JSON,Date,Math,Object,String,CustomEvent:window.CustomEvent});
  vm.runInContext(read('public/js/core/study-events.js'),context,{filename:'study-events.js'});
  let delivered=0;
  window.AppStudyEvents.on(window.AppStudyEvents.EVENTS.COGNITIVE_UPDATED,()=>{delivered+=1});
  const detail={userId:'u1',contest:'Teste',updatedAt:'same'};
  window.AppStudyEvents.emit(window.AppStudyEvents.EVENTS.COGNITIVE_UPDATED,detail);
  window.AppStudyEvents.emit(window.AppStudyEvents.EVENTS.COGNITIVE_UPDATED,detail);
  const diagnostics=window.AppStudyEvents.getDiagnostics();
  assert.equal(delivered,1);
  assert.equal(diagnostics.dedupDropped,1);
  assert.equal(diagnostics.emittedCount,1);
});

test('Fase 5: observabilidade registra fonte do fallback sem emitir novos eventos',()=>{
  const callbacks=new Map();
  let emitted=0;
  const events={
    GUIDANCE_RESOLVED:'study:guidance-resolved',
    COGNITIVE_UPDATED:'study:cognitive-updated'
  };
  const window={
    console,
    AppStudyEvents:{
      EVENTS:events,
      on(name,fn){callbacks.set(name,fn);return()=>callbacks.delete(name)},
      getDiagnostics(){return{dedupDropped:0,emittedCount:0}},
      emit(){emitted+=1}
    },
    addEventListener(){},
    PerformanceObserver:undefined
  };
  window.window=window;
  const context=vm.createContext({window,console,Object,Date,Math});
  vm.runInContext(read('public/js/core/study-observability.js'),context,{filename:'study-observability.js'});
  callbacks.get('study:guidance-resolved')?.({source:'local_fallback',aiUsed:false,topicId:'x'}, {source:'study-guidance'});
  const diagnostics=window.AppStudyObservability.getDiagnostics();
  assert.equal(diagnostics.guidanceSources.local_fallback,1);
  assert.equal(diagnostics.eventCounts['study:guidance-resolved'],1);
  assert.equal(emitted,0,'observabilidade deve ser somente leitura e não criar feedback loop');
});
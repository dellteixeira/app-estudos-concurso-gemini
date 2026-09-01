const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','public','js','core','study-events.js'),'utf8');

function runtime(){
  const listeners=new Map();
  class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail}}
  const context={
    console,Date,JSON,Math,Object,Map,Set,structuredClone,CustomEvent,
    addEventListener(name,listener){const list=listeners.get(name)||[];list.push(listener);listeners.set(name,list)},
    removeEventListener(name,listener){const list=listeners.get(name)||[];listeners.set(name,list.filter(item=>item!==listener))},
    dispatchEvent(event){for(const listener of [...(listeners.get(event.type)||[])])listener(event);return true;},
    AppState:{getSnapshot:()=>({currentContest:'TJ-CE'})}
  };
  context.window=context;
  vm.runInNewContext(source,context,{filename:'study-events.js'});
  return context;
}

test('ponte converte evento legado para contrato canônico',()=>{
  const app=runtime();
  const received=[];
  app.AppStudyEvents.on(app.AppStudyEvents.EVENTS.COGNITIVE_UPDATED,(detail,envelope)=>received.push({detail,envelope}));
  app.dispatchEvent(new app.CustomEvent('app:cognitive-profile-updated',{detail:{userId:'u1',contest:'TJ-CE'}}));
  assert.equal(received.length,1);
  assert.equal(received[0].detail.userId,'u1');
  assert.equal(received[0].envelope.source,'legacy-bridge');
  assert.equal(received[0].envelope.legacySource,'app:cognitive-profile-updated');
});

test('eventos idênticos em rajada são deduplicados',()=>{
  const app=runtime();
  let count=0;
  app.AppStudyEvents.on(app.AppStudyEvents.EVENTS.RECOMMENDATION_UPDATED,()=>count++);
  const detail={topicId:'direito::atos',score:80};
  app.dispatchEvent(new app.CustomEvent('app:next-best-study-action',{detail}));
  app.dispatchEvent(new app.CustomEvent('app:next-best-study-action',{detail}));
  assert.equal(count,1);
  const diagnostics=app.AppStudyEvents.getDiagnostics();
  assert.equal(diagnostics.bridgedCount,2);
  assert.equal(diagnostics.emittedCount,1);
});

test('snapshot de estado é obtido pelo AppState sem ler globals de domínio',()=>{
  const app=runtime();
  assert.deepEqual(app.AppStudyEvents.getSnapshot(),{currentContest:'TJ-CE'});
});

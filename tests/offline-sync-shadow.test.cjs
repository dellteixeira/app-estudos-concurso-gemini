'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const outboxSource=fs.readFileSync('public/js/core/offline-outbox-store.js','utf8');
const shadowSource=fs.readFileSync('public/js/core/offline-sync-shadow.js','utf8');
const appStateSource=fs.readFileSync('public/js/app-state.js','utf8');

function makeStorage(){
  const map=new Map();
  return {
    getItem:key=>map.has(String(key))?map.get(String(key)):null,
    setItem:(key,value)=>map.set(String(key),String(value)),
    removeItem:key=>map.delete(String(key)),
    key:index=>[...map.keys()][index]??null,
    get length(){return map.size;}
  };
}

function makeContext(){
  const events=[];
  let legacyCalls=0;
  let syncCalls=0;
  let legacyUpserts={'topic-1':{id:'topic-1'}};
  const localStorage=makeStorage();
  const context={
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Set,
    Map,
    localStorage,
    indexedDB:undefined,
    crypto:{randomUUID:()=> 'device-shadow-test'},
    CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},
    dispatchEvent:event=>{events.push(event);return true;},
    addEventListener:()=>{},
    currentUser:{id:'user-shadow-test'},
    getSyncState:()=>({editalUpserts:legacyUpserts}),
    queueEditalUpsert:item=>{legacyCalls+=1;return {legacy:true,item};},
    syncAllWithSupabase:()=>{syncCalls+=1;}
  };
  context.window=context;
  context.globalThis=context;
  vm.createContext(context);
  return {
    context,
    events,
    getLegacyCalls:()=>legacyCalls,
    getSyncCalls:()=>syncCalls,
    setLegacyUpserts:value=>{legacyUpserts=value||{};}
  };
}

function tick(){return new Promise(resolve=>setTimeout(resolve,30));}

test('shadow envolve queueEditalUpsert sem substituir envio legado nem chamar Supabase',async()=>{
  const env=makeContext();
  vm.runInContext(outboxSource,env.context,{filename:'offline-outbox-store.js'});
  vm.runInContext(shadowSource,env.context,{filename:'offline-sync-shadow.js'});

  assert.equal(env.context.OfflineSyncShadow.isInstalled(),true);
  const result=env.context.queueEditalUpsert({id:'topic-1',materia:'Direito',assunto:'Constitucional',teoria:true});
  assert.equal(result.legacy,true);
  assert.equal(env.getLegacyCalls(),1);
  assert.equal(env.getSyncCalls(),0);

  await tick();
  const rows=await env.context.OfflineOutboxStore.list('user-shadow-test',{statuses:['shadow']});
  assert.equal(rows.length,1);
  assert.equal(rows[0].entity,'edital-topic');
  assert.equal(rows[0].entityId,'topic-1');
  assert.equal(rows[0].status,'shadow');
  assert.equal(rows[0].payload.mode,'shadow-v1');
  assert.equal(env.getSyncCalls(),0);
});

test('mesmo payload é idempotente no shadow e payload alterado gera nova observação',async()=>{
  const env=makeContext();
  vm.runInContext(outboxSource,env.context,{filename:'offline-outbox-store.js'});
  vm.runInContext(shadowSource,env.context,{filename:'offline-sync-shadow.js'});

  const base={id:'topic-1',materia:'Direito',assunto:'Constitucional',teoria:true};
  env.context.queueEditalUpsert({...base});
  env.context.queueEditalUpsert({...base});
  await tick();
  let rows=await env.context.OfflineOutboxStore.list('user-shadow-test',{statuses:['shadow']});
  assert.equal(rows.length,1);
  assert.equal(env.getLegacyCalls(),2,'fila legada continua recebendo cada chamada real');

  env.context.queueEditalUpsert({...base,questoes:true});
  await tick();
  rows=await env.context.OfflineOutboxStore.list('user-shadow-test',{statuses:['shadow']});
  assert.equal(rows.length,2,'mudança real de payload ganha nova chave idempotente');
  assert.equal(env.getSyncCalls(),0);
});

test('diagnóstico compara ids da fila legada com o espelho sem promover shadow a pending',async()=>{
  const env=makeContext();
  vm.runInContext(outboxSource,env.context,{filename:'offline-outbox-store.js'});
  vm.runInContext(shadowSource,env.context,{filename:'offline-sync-shadow.js'});
  env.context.queueEditalUpsert({id:'topic-1',materia:'Direito',assunto:'Constitucional'});
  await tick();

  const diag=await env.context.OfflineSyncShadow.getDiagnostics();
  assert.equal(diag.mode,'shadow-v1');
  assert.equal(diag.legacyUpserts,1);
  assert.equal(diag.shadowUpserts,1);
  assert.equal(diag.matched,1);
  assert.equal(diag.coverage,1);
  assert.equal(diag.healthy,true);
  assert.deepEqual([...diag.missingShadowIds],[]);
  assert.equal(await env.context.OfflineOutboxStore.countPending('user-shadow-test'),0);
});

test('telemetria local registra amostra saudável após observação shadow',async()=>{
  const env=makeContext();
  vm.runInContext(outboxSource,env.context,{filename:'offline-outbox-store.js'});
  vm.runInContext(shadowSource,env.context,{filename:'offline-sync-shadow.js'});

  env.context.queueEditalUpsert({id:'topic-1',materia:'Direito'});
  await tick();

  const history=env.context.OfflineSyncShadow.getParityHistory({limit:10});
  assert.ok(history.length>=1);
  const latest=history.at(-1);
  assert.equal(latest.healthy,true);
  assert.equal(latest.coverage,1);
  assert.deepEqual([...latest.missingShadowIds],[]);
  assert.ok(env.events.some(event=>event.type==='offline-sync-shadow:parity'));
  assert.equal(env.getSyncCalls(),0);
});

test('relatório detecta divergência real quando fila legada possui id sem shadow',async()=>{
  const env=makeContext();
  vm.runInContext(outboxSource,env.context,{filename:'offline-outbox-store.js'});
  vm.runInContext(shadowSource,env.context,{filename:'offline-sync-shadow.js'});

  env.setLegacyUpserts({'topic-sem-shadow':{id:'topic-sem-shadow'}});
  const sample=await env.context.OfflineSyncShadow.recordParitySnapshot('test-divergence');
  assert.equal(sample.healthy,false);
  assert.equal(sample.coverage,0);
  assert.deepEqual([...sample.missingShadowIds],['topic-sem-shadow']);

  const report=env.context.OfflineSyncShadow.getParityReport({limit:10});
  assert.equal(report.sampleCount,1);
  assert.equal(report.healthySamples,0);
  assert.equal(report.unhealthySamples,1);
  assert.equal(report.lowestCoverage,0);
  assert.equal(report.missingOccurrences['topic-sem-shadow'],1);
  assert.equal(env.getSyncCalls(),0);
});

test('shadowOnly após esvaziamento da fila legada não vira falso erro de paridade',async()=>{
  const env=makeContext();
  vm.runInContext(outboxSource,env.context,{filename:'offline-outbox-store.js'});
  vm.runInContext(shadowSource,env.context,{filename:'offline-sync-shadow.js'});

  env.context.queueEditalUpsert({id:'topic-1',materia:'Direito'});
  await tick();
  env.setLegacyUpserts({});
  const sample=await env.context.OfflineSyncShadow.recordParitySnapshot('after-legacy-sync');

  assert.equal(sample.healthy,true);
  assert.equal(sample.coverage,1);
  assert.deepEqual([...sample.missingShadowIds],[]);
  assert.deepEqual([...sample.shadowOnlyIds],['topic-1']);
  assert.equal(env.getSyncCalls(),0);
});

test('histórico de paridade é bounded e pode ser limpo localmente',async()=>{
  const env=makeContext();
  vm.runInContext(outboxSource,env.context,{filename:'offline-outbox-store.js'});
  vm.runInContext(shadowSource,env.context,{filename:'offline-sync-shadow.js'});

  env.setLegacyUpserts({});
  for(let i=0;i<105;i++) await env.context.OfflineSyncShadow.recordParitySnapshot(`sample-${i}`);
  assert.equal(env.context.OfflineSyncShadow.getParityHistory({limit:1000}).length,100);
  assert.equal(env.context.OfflineSyncShadow.clearParityHistory(),true);
  assert.equal(env.context.OfflineSyncShadow.getParityHistory({limit:100}).length,0);
});

test('AppState carrega outbox antes do bridge na release v10.32.0',()=>{
  assert.match(appStateSource,/offline-outbox-store\.js\?v=10\.32\.0/);
  assert.match(appStateSource,/offline-sync-shadow\.js\?v=10\.32\.0/);
  assert.match(appStateSource,/loadOfflineShadowFoundation/);
  assert.match(appStateSource,/OfflineSyncShadow\?\.install/);
  assert.match(appStateSource,/getOfflineShadowDiagnostics/);
});

test('bridge shadow e telemetria não contêm caminhos de envio remoto',()=>{
  assert.doesNotMatch(shadowSource,/syncAllWithSupabase\s*\(/);
  assert.doesNotMatch(shadowSource,/supabaseClient\./);
  assert.doesNotMatch(shadowSource,/\.from\s*\(/);
  assert.doesNotMatch(shadowSource,/\bfetch\s*\(/);
  assert.match(shadowSource,/legacyQueueEditalUpsert\.apply/);
  assert.match(shadowSource,/status:'shadow'/);
  assert.match(shadowSource,/recordParitySnapshot/);
  assert.match(shadowSource,/getParityReport/);
  assert.match(shadowSource,/MAX_PARITY_SAMPLES = 100/);
});

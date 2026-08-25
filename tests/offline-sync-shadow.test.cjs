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

function clone(value){return JSON.parse(JSON.stringify(value));}

function makeContext(){
  const events=[];
  let legacyUpsertCalls=0;
  let legacyDeleteCalls=0;
  let syncCalls=0;
  let syncState={editalUpserts:{'topic-1':{id:'topic-1'}},editalDeletes:[]};
  const localStorage=makeStorage();
  const context={
    console,setTimeout,clearTimeout,Promise,Date,Math,JSON,Object,Array,String,Number,Boolean,Set,Map,
    localStorage,indexedDB:undefined,
    crypto:{randomUUID:()=> 'device-shadow-test'},
    CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},
    dispatchEvent:event=>{events.push(event);return true;},addEventListener:()=>{},
    currentUser:{id:'user-shadow-test'},
    getSyncState:()=>clone(syncState),
    queueEditalUpsert:item=>{
      legacyUpsertCalls+=1;
      const id=String(item.id);
      syncState.editalUpserts[id]={...item,id};
      syncState.editalDeletes=syncState.editalDeletes.filter(value=>String(value)!==id);
      return {legacy:true,item};
    },
    queueEditalDelete:id=>{
      legacyDeleteCalls+=1;
      const normalized=String(id);
      delete syncState.editalUpserts[normalized];
      if(!syncState.editalDeletes.includes(normalized)) syncState.editalDeletes.push(normalized);
      return {legacyDelete:true,id:normalized};
    },
    syncAllWithSupabase:()=>{syncCalls+=1;}
  };
  context.window=context;
  context.globalThis=context;
  vm.createContext(context);
  return {
    context,events,
    getLegacyUpsertCalls:()=>legacyUpsertCalls,
    getLegacyDeleteCalls:()=>legacyDeleteCalls,
    getSyncCalls:()=>syncCalls,
    getState:()=>clone(syncState),
    setState:value=>{syncState={editalUpserts:{},editalDeletes:[],...clone(value||{})};},
    setLegacyUpserts:value=>{syncState.editalUpserts=value||{};},
    setLegacyDeletes:value=>{syncState.editalDeletes=Array.isArray(value)?value:[];}
  };
}

function boot(env){
  vm.runInContext(outboxSource,env.context,{filename:'offline-outbox-store.js'});
  vm.runInContext(shadowSource,env.context,{filename:'offline-sync-shadow.js'});
}
function tick(){return new Promise(resolve=>setTimeout(resolve,35));}

test('shadow envolve queueEditalUpsert sem substituir envio legado nem chamar Supabase',async()=>{
  const env=makeContext();boot(env);
  assert.equal(env.context.OfflineSyncShadow.isInstalled(),true);
  const result=env.context.queueEditalUpsert({id:'topic-1',materia:'Direito',assunto:'Constitucional',teoria:true});
  assert.equal(result.legacy,true);
  assert.equal(env.getLegacyUpsertCalls(),1);
  assert.equal(env.getSyncCalls(),0);
  await tick();
  const rows=await env.context.OfflineOutboxStore.list('user-shadow-test',{statuses:['shadow']});
  assert.equal(rows.length,1);
  assert.equal(rows[0].entity,'edital-topic');
  assert.equal(rows[0].entityId,'topic-1');
  assert.equal(rows[0].action,'upsert');
  assert.equal(rows[0].status,'shadow');
  assert.equal(rows[0].payload.mode,'shadow-v1');
});

test('delete entra somente no shadow enquanto fila legada continua sendo autoridade',async()=>{
  const env=makeContext();boot(env);
  assert.equal(env.context.OfflineSyncShadow.isDeleteInstalled(),true);
  const result=env.context.queueEditalDelete('topic-1');
  assert.equal(result.legacyDelete,true);
  assert.equal(env.getLegacyDeleteCalls(),1);
  assert.deepEqual(env.getState().editalDeletes,['topic-1']);
  assert.equal(env.getSyncCalls(),0);
  await tick();
  const rows=await env.context.OfflineOutboxStore.list('user-shadow-test',{statuses:['shadow']});
  const deletion=rows.find(row=>row.action==='delete');
  assert.ok(deletion);
  assert.equal(deletion.entity,'edital-topic');
  assert.equal(deletion.entityId,'topic-1');
  assert.equal(deletion.payload.deleted,true);
  assert.equal(deletion.idempotencyKey,'user-shadow-test:edital-topic:topic-1:delete');
  assert.equal(await env.context.OfflineOutboxStore.countPending('user-shadow-test'),0,'shadow não vira pending');
});

test('delete repetido é idempotente no shadow e permanece idempotente na fila legada',async()=>{
  const env=makeContext();boot(env);
  env.context.queueEditalDelete('topic-1');
  env.context.queueEditalDelete('topic-1');
  await tick();
  const rows=await env.context.OfflineOutboxStore.list('user-shadow-test',{statuses:['shadow']});
  assert.equal(rows.filter(row=>row.action==='delete').length,1);
  assert.equal(env.getLegacyDeleteCalls(),2);
  assert.deepEqual(env.getState().editalDeletes,['topic-1']);
});

test('mesmo payload é idempotente no shadow e payload alterado gera nova observação',async()=>{
  const env=makeContext();boot(env);
  const base={id:'topic-1',materia:'Direito',assunto:'Constitucional',teoria:true};
  env.context.queueEditalUpsert({...base});
  env.context.queueEditalUpsert({...base});
  await tick();
  let rows=await env.context.OfflineOutboxStore.list('user-shadow-test',{statuses:['shadow']});
  assert.equal(rows.filter(row=>row.action==='upsert').length,1);
  assert.equal(env.getLegacyUpsertCalls(),2,'fila legada continua recebendo cada chamada real');
  env.context.queueEditalUpsert({...base,questoes:true});
  await tick();
  rows=await env.context.OfflineOutboxStore.list('user-shadow-test',{statuses:['shadow']});
  assert.equal(rows.filter(row=>row.action==='upsert').length,2,'mudança real de payload ganha nova chave idempotente');
  assert.equal(env.getSyncCalls(),0);
});

test('diagnóstico mede upsert e delete separadamente sem promover shadow a pending',async()=>{
  const env=makeContext();boot(env);
  env.context.queueEditalUpsert({id:'topic-1',materia:'Direito',assunto:'Constitucional'});
  env.setLegacyDeletes(['topic-delete']);
  await env.context.OfflineSyncShadow.shadowEditalDelete('topic-delete','test-delete');
  const diag=await env.context.OfflineSyncShadow.getDiagnostics();
  assert.equal(diag.mode,'shadow-v1');
  assert.equal(diag.legacyUpserts,1);
  assert.equal(diag.shadowUpserts,1);
  assert.equal(diag.matched,1);
  assert.equal(diag.coverage,1);
  assert.equal(diag.healthy,true);
  assert.equal(diag.legacyDeletes,1);
  assert.equal(diag.shadowDeletes,1);
  assert.equal(diag.deleteMatched,1);
  assert.equal(diag.deleteCoverage,1);
  assert.equal(diag.deleteHealthy,true);
  assert.deepEqual([...diag.missingDeleteShadowIds],[]);
  assert.equal(await env.context.OfflineOutboxStore.countPending('user-shadow-test'),0);
});

test('telemetria de delete fica isolada da paridade usada pelo canário de upsert',async()=>{
  const env=makeContext();boot(env);
  env.setState({editalUpserts:{},editalDeletes:['delete-sem-shadow']});
  const deleteSample=await env.context.OfflineSyncShadow.recordDeleteParitySnapshot('delete-divergence');
  assert.equal(deleteSample.healthy,false);
  assert.equal(deleteSample.coverage,0);
  assert.deepEqual([...deleteSample.missingShadowIds],['delete-sem-shadow']);
  const deleteReport=env.context.OfflineSyncShadow.getDeleteParityReport({limit:10});
  assert.equal(deleteReport.sampleCount,1);
  assert.equal(deleteReport.unhealthySamples,1);
  assert.equal(deleteReport.lowestCoverage,0);
  assert.equal(deleteReport.missingOccurrences['delete-sem-shadow'],1);
  const upsertReport=env.context.OfflineSyncShadow.getParityReport({limit:10});
  assert.equal(upsertReport.sampleCount,0,'delete não contamina histórico de elegibilidade do upsert');
  assert.equal(upsertReport.unhealthySamples,0);
});

test('telemetria local registra amostra saudável após observação shadow de upsert',async()=>{
  const env=makeContext();boot(env);
  env.context.queueEditalUpsert({id:'topic-1',materia:'Direito'});
  await tick();
  const history=env.context.OfflineSyncShadow.getParityHistory({limit:10});
  assert.ok(history.length>=1);
  const latest=history.at(-1);
  assert.equal(latest.action,'upsert');
  assert.equal(latest.healthy,true);
  assert.equal(latest.coverage,1);
  assert.deepEqual([...latest.missingShadowIds],[]);
  assert.ok(env.events.some(event=>event.type==='offline-sync-shadow:parity'));
});

test('queueEditalDelete registra paridade saudável de delete após o legado',async()=>{
  const env=makeContext();boot(env);
  env.context.queueEditalDelete('topic-1');
  await tick();
  const history=env.context.OfflineSyncShadow.getDeleteParityHistory({limit:10});
  assert.ok(history.length>=1);
  const latest=history.at(-1);
  assert.equal(latest.action,'delete');
  assert.equal(latest.healthy,true);
  assert.equal(latest.coverage,1);
  assert.deepEqual([...latest.missingShadowIds],[]);
  assert.ok(env.events.some(event=>event.type==='offline-sync-shadow:delete-parity'));
  assert.equal(env.getSyncCalls(),0);
});

test('relatório detecta divergência real quando fila legada de upsert possui id sem shadow',async()=>{
  const env=makeContext();boot(env);
  env.setState({editalUpserts:{'topic-sem-shadow':{id:'topic-sem-shadow'}},editalDeletes:[]});
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
});

test('shadowOnly de delete após esvaziamento legado não vira falso erro',async()=>{
  const env=makeContext();boot(env);
  env.setLegacyDeletes(['topic-1']);
  await env.context.OfflineSyncShadow.shadowEditalDelete('topic-1','before-legacy-delete');
  env.setLegacyDeletes([]);
  const sample=await env.context.OfflineSyncShadow.recordDeleteParitySnapshot('after-legacy-delete');
  assert.equal(sample.healthy,true);
  assert.equal(sample.coverage,1);
  assert.deepEqual([...sample.missingShadowIds],[]);
  assert.deepEqual([...sample.shadowOnlyIds],['topic-1']);
});

test('históricos de paridade são bounded e podem ser limpos independentemente',async()=>{
  const env=makeContext();boot(env);
  env.setState({editalUpserts:{},editalDeletes:[]});
  for(let i=0;i<105;i++){
    await env.context.OfflineSyncShadow.recordParitySnapshot(`upsert-${i}`);
    await env.context.OfflineSyncShadow.recordDeleteParitySnapshot(`delete-${i}`);
  }
  assert.equal(env.context.OfflineSyncShadow.getParityHistory({limit:1000}).length,100);
  assert.equal(env.context.OfflineSyncShadow.getDeleteParityHistory({limit:1000}).length,100);
  assert.equal(env.context.OfflineSyncShadow.clearDeleteParityHistory(),true);
  assert.equal(env.context.OfflineSyncShadow.getDeleteParityHistory({limit:100}).length,0);
  assert.equal(env.context.OfflineSyncShadow.getParityHistory({limit:100}).length,100,'limpar delete não apaga histórico de upsert');
  assert.equal(env.context.OfflineSyncShadow.clearParityHistory(),true);
  assert.equal(env.context.OfflineSyncShadow.getParityHistory({limit:100}).length,0);
});

test('AppState carrega outbox antes do bridge na release v10.41.0',()=>{
  assert.match(appStateSource,/offline-outbox-store\.js\?v=10\.41\.0/);
  assert.match(appStateSource,/offline-sync-shadow\.js\?v=10\.41\.0/);
  assert.match(appStateSource,/loadOfflineSyncFoundation/);
  assert.match(appStateSource,/OfflineSyncShadow\?\.install/);
  assert.match(appStateSource,/getOfflineShadowDiagnostics/);
});

test('bridge de delete continua estritamente shadow e sem qualquer envio remoto',()=>{
  assert.doesNotMatch(shadowSource,/syncAllWithSupabase\s*\(/);
  assert.doesNotMatch(shadowSource,/supabaseClient\./);
  assert.doesNotMatch(shadowSource,/\.from\s*\(/);
  assert.doesNotMatch(shadowSource,/\.delete\s*\(/);
  assert.doesNotMatch(shadowSource,/\bfetch\s*\(/);
  assert.match(shadowSource,/legacyQueueEditalUpsert\.apply/);
  assert.match(shadowSource,/legacyQueueEditalDelete\.apply/);
  assert.match(shadowSource,/action:'delete'/);
  assert.match(shadowSource,/status:'shadow'/);
  assert.match(shadowSource,/DELETE_PARITY_STORAGE_PREFIX/);
  assert.match(shadowSource,/getDeleteParityReport/);
  assert.match(shadowSource,/MAX_PARITY_SAMPLES = 100/);
});

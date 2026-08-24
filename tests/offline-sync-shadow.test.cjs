'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const outboxSource=fs.readFileSync('public/js/core/offline-outbox-store.js','utf8');
const shadowSource=fs.readFileSync('public/js/core/offline-sync-shadow.js','utf8');
const pwaSource=fs.readFileSync('public/js/app-pwa.js','utf8');

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
    getSyncState:()=>({editalUpserts:{'topic-1':{id:'topic-1'}}}),
    queueEditalUpsert:item=>{legacyCalls+=1;return {legacy:true,item};},
    syncAllWithSupabase:()=>{syncCalls+=1;}
  };
  context.window=context;
  context.globalThis=context;
  vm.createContext(context);
  return {context,events,getLegacyCalls:()=>legacyCalls,getSyncCalls:()=>syncCalls};
}

function tick(){return new Promise(resolve=>setTimeout(resolve,20));}

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
  assert.deepEqual([...diag.missingShadowIds],[]);
  assert.equal(await env.context.OfflineOutboxStore.countPending('user-shadow-test'),0);
});

test('loader PWA carrega outbox antes do bridge e mantém versão canônica durante experimento',()=>{
  assert.match(pwaSource,/offline-outbox-store\.js\?v=10\.31\.0/);
  assert.match(pwaSource,/offline-sync-shadow\.js\?v=10\.31\.0/);
  assert.match(pwaSource,/dataOfflineOutboxStore|offlineOutboxStore/);
  assert.match(pwaSource,/dataOfflineSyncShadow|offlineSyncShadow/);
});

test('bridge shadow não contém caminhos de envio remoto',()=>{
  assert.doesNotMatch(shadowSource,/syncAllWithSupabase\s*\(/);
  assert.doesNotMatch(shadowSource,/supabaseClient\./);
  assert.doesNotMatch(shadowSource,/\.from\s*\(/);
  assert.match(shadowSource,/legacyQueueEditalUpsert\.apply/);
  assert.match(shadowSource,/status:'shadow'/);
});

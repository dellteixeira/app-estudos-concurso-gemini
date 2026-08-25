'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/core/offline-sync-metadata-shadow.js','utf8');
const appStateSource=fs.readFileSync('public/js/app-state.js','utf8');
const manifest=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));
const sw=fs.readFileSync('public/sw.js','utf8');
const worker=fs.readFileSync('src/worker.js','utf8');
const headers=fs.readFileSync('public/_headers','utf8');

function makeStorage(){
  const map=new Map();
  return {
    getItem:key=>map.has(String(key))?map.get(String(key)):null,
    setItem:(key,value)=>map.set(String(key),String(value)),
    removeItem:key=>map.delete(String(key))
  };
}

function makeContext(){
  const operations=[];
  const order=[];
  const state={metadataDirty:false,metadataRevision:0};
  let metadata={Concurso:{banca:'FCC',data_prova:'2026-10-01'}};
  const context={
    console,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,Math,Promise,
    localStorage:makeStorage(),
    currentUser:{id:'user-metadata-shadow'},
    getSyncState:()=>({...state}),
    getConcursosMetadata:()=>JSON.parse(JSON.stringify(metadata)),
    setMetadataDirty:isDirty=>{
      order.push('legacy');
      state.metadataDirty=Boolean(isDirty);
      if(isDirty) state.metadataRevision+=1;
    },
    OfflineOutboxStore:{
      enqueue:async operation=>{order.push('shadow');operations.push(operation);return operation;},
      list:async()=>operations
    },
    CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},
    dispatchEvent:()=>true
  };
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'offline-sync-metadata-shadow.js'});
  context.OfflineSyncMetadataShadow.install();
  return {context,state,operations,order,setMetadata:value=>{metadata=value;}};
}

async function flush(){
  await Promise.resolve();
  await new Promise(resolve=>setImmediate(resolve));
}

test('shadow preserva o legado como primeira autoridade e espelha somente depois',async()=>{
  const env=makeContext();
  env.context.setMetadataDirty(true);
  assert.deepEqual(env.order,['legacy']);
  await flush();
  assert.deepEqual(env.order,['legacy','shadow']);
  assert.equal(env.state.metadataDirty,true);
  assert.equal(env.state.metadataRevision,1);
  assert.equal(env.operations.length,1);
  assert.equal(env.operations[0].status,'shadow');
  assert.equal(env.operations[0].entity,'concursos-metadata');
  assert.equal(env.operations[0].entityId,'concursos_metadata');
  assert.equal(env.operations[0].action,'upsert');
  assert.equal(env.operations[0].payload.metadataRevision,1);
});

test('setMetadataDirty(false) não cria operação e mantém semântica legada',async()=>{
  const env=makeContext();
  env.context.setMetadataDirty(false);
  await flush();
  assert.equal(env.state.metadataDirty,false);
  assert.equal(env.state.metadataRevision,0);
  assert.equal(env.operations.length,0);
});

test('idempotência é determinística para mesma revisão e mesmo snapshot',async()=>{
  const env=makeContext();
  env.context.setMetadataDirty(true);
  await flush();
  const first=env.operations[0];
  const mirrored=await env.context.OfflineSyncMetadataShadow.mirrorDirtyMetadata();
  assert.equal(mirrored.idempotencyKey,first.idempotencyKey);
  assert.match(first.idempotencyKey,/user-metadata-shadow:concursos-metadata:concursos_metadata:upsert:r1:/);
});

test('mudança real de metadados produz novo fingerprint após nova revisão',async()=>{
  const env=makeContext();
  env.context.setMetadataDirty(true);
  await flush();
  const first=env.operations[0];
  env.setMetadata({Concurso:{banca:'CEBRASPE',data_prova:'2026-10-01'}});
  env.context.setMetadataDirty(true);
  await flush();
  const second=env.operations[1];
  assert.equal(second.payload.metadataRevision,2);
  assert.notEqual(second.payload.payloadFingerprint,first.payload.payloadFingerprint);
  assert.notEqual(second.idempotencyKey,first.idempotencyKey);
});

test('diagnóstico registra paridade saudável sem autoridade remota',async()=>{
  const env=makeContext();
  env.context.setMetadataDirty(true);
  await flush();
  const diagnostics=await env.context.OfflineSyncMetadataShadow.getDiagnostics();
  assert.equal(diagnostics.remoteAuthority,false);
  assert.equal(diagnostics.legacy.metadataDirty,true);
  assert.equal(diagnostics.legacy.metadataRevision,1);
  assert.equal(diagnostics.shadowCount,1);
  assert.equal(diagnostics.parity.sampleCount,1);
  assert.equal(diagnostics.parity.healthy,true);
  assert.equal(diagnostics.lastMirror.parity,true);
});

test('falha do shadow não interrompe o caminho legado',async()=>{
  const env=makeContext();
  env.context.OfflineOutboxStore.enqueue=async()=>{throw new Error('shadow unavailable');};
  assert.doesNotThrow(()=>env.context.setMetadataDirty(true));
  await flush();
  assert.equal(env.state.metadataDirty,true);
  assert.equal(env.state.metadataRevision,1);
  const diagnostics=await env.context.OfflineSyncMetadataShadow.getDiagnostics();
  assert.match(diagnostics.lastError.message,/shadow unavailable/);
});

test('módulo shadow não contém caminho remoto Supabase próprio',()=>{
  assert.doesNotMatch(source,/supabaseClient\./);
  assert.doesNotMatch(source,/\.from\s*\(/);
  assert.doesNotMatch(source,/\.upsert\s*\(/);
  assert.doesNotMatch(source,/\.delete\s*\(/);
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.match(source,/status:'shadow'/);
});

test('AppState carrega metadata shadow após outbox e antes das autoridades remotas',()=>{
  const outboxIndex=appStateSource.indexOf('offline-outbox-store.js?v=10.50.0');
  const metadataIndex=appStateSource.indexOf('offline-sync-metadata-shadow.js?v=10.50.0');
  const authorityIndex=appStateSource.indexOf('offline-sync-authority.js?v=10.50.0');
  assert.ok(outboxIndex>=0);
  assert.ok(metadataIndex>outboxIndex);
  assert.ok(authorityIndex>metadataIndex);
  assert.match(appStateSource,/getOfflineSyncMetadataShadowDiagnostics/);
});

test('metadata shadow integra app shell, network-first e no-store',()=>{
  const asset='/js/core/offline-sync-metadata-shadow.js';
  assert.ok(manifest.criticalAppShell.includes(asset));
  assert.ok(manifest.networkFirstPaths.includes(asset));
  assert.ok(manifest.workerNoStorePaths.includes(asset));
  assert.ok(manifest.headersNoStorePaths.includes(asset));
  assert.match(sw,/offline-sync-metadata-shadow\.js/);
  assert.match(worker,/offline-sync-metadata-shadow\.js/);
  assert.match(headers,/\/js\/core\/offline-sync-metadata-shadow\.js\n\s+Cache-Control: no-cache, no-store, must-revalidate/);
});

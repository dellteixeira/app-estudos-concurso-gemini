'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/core/offline-sync-metadata-stability.js','utf8');
const appStateSource=fs.readFileSync('public/js/app-state.js','utf8');
const manifest=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));
const swSource=fs.readFileSync('public/sw.js','utf8');
const workerSource=fs.readFileSync('src/worker.js','utf8');
const headersSource=fs.readFileSync('public/_headers','utf8');

function makeStorage(){
  const map=new Map();
  return { getItem:key=>map.has(String(key))?map.get(String(key)):null, setItem:(key,value)=>map.set(String(key),String(value)), removeItem:key=>map.delete(String(key)) };
}

function makeContext(options={}){
  const listeners=new Map();
  const events=[];
  let session=options.session||'session-0';
  let parityEligible=options.parityEligible!==false;
  const context={
    console,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,Math,
    localStorage:makeStorage(),
    currentUser:{id:options.userId||'stability-user'},
    OfflineSyncMetadataAuthority:{
      getEligibility:()=>({eligible:parityEligible,reasons:parityEligible?[]:['unhealthy-parity-samples']}),
      getDiagnostics:()=>({canarySession:{startedAt:session}})
    },
    OfflineSyncMetadataRollout:{
      getCohortAssignment:userId=>({userId:userId||null,bucket:1,percent:10,included:options.inCohort!==false})
    },
    CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},
    addEventListener:(type,fn)=>{const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},
    dispatchEvent:event=>{events.push(event);for(const fn of listeners.get(event.type)||[]) fn(event);return true;}
  };
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'offline-sync-metadata-stability.js'});
  context.OfflineSyncMetadataStability.install();
  return {context,events,setSession:value=>{session=value;},setParity:value=>{parityEligible=Boolean(value);}};
}

function dispatch(env,type,detail={}){
  env.context.dispatchEvent(new env.context.CustomEvent(type,{detail}));
}

test('ledger nasce observacional, local e sem autoridade remota',()=>{
  const env=makeContext();
  const diagnostics=env.context.OfflineSyncMetadataStability.getDiagnostics();
  assert.equal(diagnostics.installed,true);
  assert.equal(diagnostics.remoteAuthority,false);
  assert.deepEqual([...diagnostics.scope],['local-observation:concursos_metadata']);
  assert.doesNotMatch(source,/\.from\s*\(/);
  assert.doesNotMatch(source,/\.upsert\s*\(/);
  assert.doesNotMatch(source,/\.delete\s*\(/);
  assert.doesNotMatch(source,/\bfetch\s*\(/);
});

test('três canários bem-sucedidos qualificam estabilidade',()=>{
  const env=makeContext();
  for(let i=1;i<=3;i+=1){
    env.setSession(`session-${i}`);
    dispatch(env,'offline-sync-metadata-authority:flushed',{handled:true,fallback:false,canarySession:{startedAt:`session-${i}`}});
  }
  const report=env.context.OfflineSyncMetadataStability.getReport();
  assert.equal(report.successes,3);
  assert.equal(report.failures,0);
  assert.equal(report.aborted,0);
  assert.equal(report.stable,true);
  assert.equal(report.readyForExpansion,true);
});

test('fallback recente bloqueia estabilidade',()=>{
  const env=makeContext();
  for(let i=1;i<=3;i+=1){
    env.setSession(`ok-${i}`);
    dispatch(env,'offline-sync-metadata-authority:flushed',{handled:true,fallback:false,canarySession:{startedAt:`ok-${i}`}});
  }
  env.setSession('failed-1');
  dispatch(env,'offline-sync-metadata-authority:fallback',{canarySession:{startedAt:'failed-1'}});
  const report=env.context.OfflineSyncMetadataStability.getReport();
  assert.equal(report.failures,1);
  assert.equal(report.stable,false);
  assert.ok([...report.reasons].includes('recent-canary-failure'));
});

test('abort de revisão concorrente bloqueia estabilidade',()=>{
  const env=makeContext();
  env.setSession('abort-1');
  dispatch(env,'offline-sync-metadata-authority:canary-stopped',{reason:'revision-changed-preflight',session:{startedAt:'abort-1'}});
  const report=env.context.OfflineSyncMetadataStability.getReport();
  assert.equal(report.aborted,1);
  assert.ok([...report.reasons].includes('recent-canary-abort'));
});

test('budget-exhausted normal não é tratado como falha ou abort',()=>{
  const env=makeContext();
  env.setSession('normal-1');
  dispatch(env,'offline-sync-metadata-authority:canary-stopped',{reason:'budget-exhausted',session:{startedAt:'normal-1'}});
  assert.equal(env.context.OfflineSyncMetadataStability.getReport().sampleCount,0);
  dispatch(env,'offline-sync-metadata-authority:flushed',{handled:true,fallback:false,canarySession:{startedAt:'normal-1'}});
  assert.equal(env.context.OfflineSyncMetadataStability.getReport().successes,1);
});

test('registro é deduplicado por sessão e limitado à janela de 10',()=>{
  const env=makeContext();
  env.setSession('same');
  dispatch(env,'offline-sync-metadata-authority:flushed',{handled:true,fallback:false,canarySession:{startedAt:'same'}});
  dispatch(env,'offline-sync-metadata-authority:flushed',{handled:true,fallback:false,canarySession:{startedAt:'same'}});
  assert.equal(env.context.OfflineSyncMetadataStability.getReport().sampleCount,1);
  for(let i=0;i<12;i+=1){
    env.setSession(`bounded-${i}`);
    dispatch(env,'offline-sync-metadata-authority:flushed',{handled:true,fallback:false,canarySession:{startedAt:`bounded-${i}`}});
  }
  const report=env.context.OfflineSyncMetadataStability.getReport();
  assert.equal(report.sampleCount,10);
  assert.equal(report.history.length,10);
});

test('histórico é estritamente separado por user_id',()=>{
  const env=makeContext({userId:'user-a'});
  env.setSession('a-1');
  dispatch(env,'offline-sync-metadata-authority:flushed',{handled:true,fallback:false,canarySession:{startedAt:'a-1'}});
  assert.equal(env.context.OfflineSyncMetadataStability.getReport('user-a').sampleCount,1);
  assert.equal(env.context.OfflineSyncMetadataStability.getReport('user-b').sampleCount,0);
});

test('coorte e paridade saudável continuam obrigatórias',()=>{
  const outside=makeContext({inCohort:false});
  for(let i=0;i<3;i++) outside.context.OfflineSyncMetadataStability.observe('success',{canarySession:{startedAt:`x-${i}`}});
  assert.equal(outside.context.OfflineSyncMetadataStability.getReport().stable,false);
  assert.ok([...outside.context.OfflineSyncMetadataStability.getReport().reasons].includes('outside-rollout-cohort'));

  const unhealthy=makeContext({parityEligible:false});
  for(let i=0;i<3;i++) unhealthy.context.OfflineSyncMetadataStability.observe('success',{canarySession:{startedAt:`p-${i}`}});
  assert.equal(unhealthy.context.OfflineSyncMetadataStability.getReport().stable,false);
  assert.ok([...unhealthy.context.OfflineSyncMetadataStability.getReport().reasons].includes('metadata-parity-not-eligible'));
});

test('AppState carrega stability depois do rollout e antes das autoridades do edital',()=>{
  const rolloutIndex=appStateSource.indexOf('offline-sync-metadata-rollout.js?v=10.38.0');
  const stabilityIndex=appStateSource.indexOf('offline-sync-metadata-stability.js?v=10.38.0');
  const editalAuthorityIndex=appStateSource.indexOf('offline-sync-authority.js?v=10.38.0');
  assert.ok(rolloutIndex>=0);
  assert.ok(stabilityIndex>rolloutIndex);
  assert.ok(editalAuthorityIndex>stabilityIndex);
  assert.match(appStateSource,/metadataStability:global\.OfflineSyncMetadataStability/);
  assert.match(appStateSource,/getOfflineSyncMetadataStabilityDiagnostics/);
});

test('stability integra contratos PWA e no-store',()=>{
  const asset='/js/core/offline-sync-metadata-stability.js';
  assert.ok(manifest.criticalAppShell.includes(asset));
  assert.ok(manifest.networkFirstPaths.includes(asset));
  assert.ok(manifest.workerNoStorePaths.includes(asset));
  assert.ok(manifest.headersNoStorePaths.includes(asset));
  assert.match(swSource,/offline-sync-metadata-stability\.js/);
  assert.match(workerSource,/offline-sync-metadata-stability\.js/);
  assert.match(headersSource,/\/js\/core\/offline-sync-metadata-stability\.js/);
});

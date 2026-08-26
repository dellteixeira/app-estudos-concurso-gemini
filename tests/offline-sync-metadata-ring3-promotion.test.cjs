'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/core/offline-sync-metadata-ring3-promotion.js','utf8');
const expansionSource=fs.readFileSync('public/js/core/offline-sync-metadata-expansion.js','utf8');
const appStateSource=fs.readFileSync('public/js/app-state.js','utf8');
const assets=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));
const swSource=fs.readFileSync('public/sw.js','utf8');
const workerSource=fs.readFileSync('src/worker.js','utf8');
const headersSource=fs.readFileSync('public/_headers','utf8');

function makeContext(options={}){
  const store=new Map();
  const listeners=new Map();
  const events=[];
  if(options.state) store.set(`offline_sync_metadata_ring3_promotion_v1_${options.userId||'ring3-user'}`,JSON.stringify(options.state));
  const tier=options.tier||'population-expanded-ring-3';
  const context={
    console,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,Math,
    currentUser:{id:options.userId||'ring3-user'},
    localStorage:{getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)},
    OfflineSyncMetadataExpandedStability:{getRing3Report:()=>({readyForDepthReview:options.ready!==false,tier,remoteWriteBudget:1,populationPercent:55})},
    OfflineSyncMetadataRollout:{
      getCohortAssignment:userId=>({userId:userId||null,tier,percent:55,included:tier!=='excluded'}),
      getEligibility:()=>({eligible:options.rolloutEligible!==false}),
      isEnabled:()=>options.rolloutEnabled!==false
    },
    OfflineSyncMetadataAuthority:{getCircuit:()=>options.circuit?{openedAt:'now'}:null,isHardKilled:()=>Boolean(options.hardKill)},
    OfflineSyncMetadataGraduation:{isEnabled:()=>options.graduationEnabled!==false,isHardKilled:()=>Boolean(options.hardKill)},
    CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},
    addEventListener:(type,fn)=>{const rows=listeners.get(type)||[];rows.push(fn);listeners.set(type,rows);},
    dispatchEvent:event=>{events.push(event);for(const fn of listeners.get(event.type)||[]) fn(event);return true;}
  };
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'offline-sync-metadata-ring3-promotion.js'});
  return {context,events,store};
}

test('4X é política local e não cria nova autoridade remota',()=>{
  assert.match(source,/metadata-ring3-promotion-v1/);
  assert.doesNotMatch(source,/\.from\s*\(/);
  assert.doesNotMatch(source,/\.upsert\s*\(/);
  assert.doesNotMatch(source,/\.delete\s*\(/);
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.match(source,/remoteAuthority:false/);
});

test('usuário 45–54 pronto na 4W pode ser promovido individualmente',()=>{
  const env=makeContext();
  assert.equal(env.context.OfflineSyncMetadataRing3Promotion.install(),true);
  const diag=env.context.OfflineSyncMetadataRing3Promotion.getDiagnostics();
  assert.equal(diag.promoted,true);
  assert.equal(diag.maxRemoteWrites,2);
  assert.equal(diag.populationPercent,55);
  assert.ok(env.events.some(event=>event.type==='offline-sync-metadata-ring3-promotion:promoted'));
});

test('4X recusa promoção sem readyForDepthReview',()=>{
  const env=makeContext({ready:false});
  env.context.OfflineSyncMetadataRing3Promotion.install();
  const diag=env.context.OfflineSyncMetadataRing3Promotion.getDiagnostics();
  assert.equal(diag.promoted,false);
  assert.equal(diag.maxRemoteWrites,1);
  assert.ok([...diag.eligibility.reasons].includes('ring3-stability-not-ready'));
});

test('4X não promove tiers históricos nem excluídos',()=>{
  for(const tier of ['pilot','expanded-base','population-expanded-base','population-expanded-ring-2','excluded']){
    const env=makeContext({tier});
    env.context.OfflineSyncMetadataRing3Promotion.install();
    const diag=env.context.OfflineSyncMetadataRing3Promotion.getDiagnostics();
    assert.equal(diag.promoted,false);
    assert.ok([...diag.eligibility.reasons].includes('outside-population-expanded-ring-3-tier'));
  }
});

test('circuit breaker, kill switch e rollout inativo bloqueiam 4X',()=>{
  for(const options of [{circuit:true},{hardKill:true},{rolloutEnabled:false},{graduationEnabled:false},{rolloutEligible:false}]){
    const env=makeContext(options);
    env.context.OfflineSyncMetadataRing3Promotion.install();
    assert.equal(env.context.OfflineSyncMetadataRing3Promotion.isPromoted(),false);
  }
});

test('promoção 4X persistida é revogada quando elegibilidade regride',()=>{
  const env=makeContext({ready:false,state:{promoted:true,promotedAt:'earlier'}});
  env.context.OfflineSyncMetadataRing3Promotion.install();
  const state=env.context.OfflineSyncMetadataRing3Promotion.readState();
  assert.equal(state.promoted,false);
  assert.equal(state.revokeReason,'eligibility-regressed');
  assert.ok(env.events.some(event=>event.type==='offline-sync-metadata-ring3-promotion:revoked'));
});

test('budget 4X permanece rigidamente limitado a dois writes e integra política final',()=>{
  assert.match(source,/PROMOTED_REMOTE_WRITES\s*=\s*2/);
  assert.doesNotMatch(source,/PROMOTED_REMOTE_WRITES\s*=\s*[3-9]/);
  assert.match(expansionSource,/OfflineSyncMetadataRing3Promotion/);
  assert.match(expansionSource,/ring3Promoted/);
});

test('AppState carrega 4X depois da 4W e antes da política final de expansão',()=>{
  const stabilityIndex=appStateSource.indexOf('offline-sync-metadata-expanded-stability.js?v=10.57.0');
  const ring3Index=appStateSource.indexOf('offline-sync-metadata-ring3-promotion.js?v=10.57.0');
  const expansionIndex=appStateSource.indexOf('offline-sync-metadata-expansion.js?v=10.57.0');
  assert.ok(stabilityIndex>=0);
  assert.ok(ring3Index>stabilityIndex);
  assert.ok(expansionIndex>ring3Index);
  assert.match(appStateSource,/metadataRing3Promotion/);
  assert.match(appStateSource,/getOfflineSyncMetadataRing3PromotionDiagnostics/);
});

test('asset 4X integra shell, network-first e contratos no-store',()=>{
  const path='/js/core/offline-sync-metadata-ring3-promotion.js';
  assert.equal(assets.version,'10.57.0');
  for(const key of ['criticalAppShell','networkFirstPaths','workerNoStorePaths','headersNoStorePaths']) assert.ok(assets[key].includes(path),key);
  assert.ok(swSource.includes(`'./js/core/offline-sync-metadata-ring3-promotion.js'`));
  assert.ok(swSource.includes(`'/js/core/offline-sync-metadata-ring3-promotion.js'`));
  assert.ok(workerSource.includes(path));
  assert.ok(headersSource.includes(path));
});

test('4X preserva rollout em 55% e não amplia além de dois writes',()=>{
  assert.match(source,/populationPercent:55/);
  assert.doesNotMatch(source,/populationPercent\s*:\s*(?:5[6-9]|[6-9][0-9]|100)/);
  assert.doesNotMatch(source,/PROMOTED_REMOTE_WRITES\s*=\s*(?:[3-9]|[1-9][0-9]+)/);
});

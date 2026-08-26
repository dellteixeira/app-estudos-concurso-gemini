'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const observerSource=fs.readFileSync('public/js/core/offline-sync-metadata-ring2-promoted-stability.js','utf8');
const promotionSource=fs.readFileSync('public/js/core/offline-sync-metadata-ring2-promotion.js','utf8');
const appStateSource=fs.readFileSync('public/js/app-state.js','utf8');
const manifest=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));

function makeStorage(){
  const data=new Map();
  return {getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
}

function makeContext(options={}){
  const listeners=new Map();
  let tier=options.tier||'population-expanded-ring-2';
  let promoted=options.promoted!==false;
  let promotionEligible=options.promotionEligible!==false;
  let parityEligible=options.parityEligible!==false;
  const promotedAt=options.promotedAt===undefined?'2026-08-26T00:00:00.000Z':options.promotedAt;
  const context={
    console,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,Math,localStorage:makeStorage(),
    currentUser:{id:options.userId||'ring2-user'},
    OfflineSyncMetadataRing2Promotion:{
      readState:userId=>({mode:'metadata-ring2-promotion-v1',userId:userId||'ring2-user',promoted,promotedAt}),
      getEligibility:()=>({eligible:promotionEligible,reasons:promotionEligible?[]:['ring2-stability-not-ready']})
    },
    OfflineSyncMetadataRollout:{getCohortAssignment:userId=>({userId:userId||null,bucket:tier==='population-expanded-ring-2'?38:70,included:tier!=='excluded',tier})},
    OfflineSyncMetadataAuthority:{getEligibility:()=>({eligible:parityEligible,reasons:parityEligible?[]:['metadata-parity-not-eligible']})},
    CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},
    addEventListener:(type,fn)=>{const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},
    dispatchEvent:event=>{for(const fn of listeners.get(event.type)||[])fn(event);return true;}
  };
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(observerSource,context,{filename:'offline-sync-metadata-ring2-promoted-stability.js'});
  context.OfflineSyncMetadataRing2PromotedStability.install();
  return {context,setPromoted:v=>{promoted=Boolean(v);},setPromotionEligible:v=>{promotionEligible=Boolean(v);},setParityEligible:v=>{parityEligible=Boolean(v);}};
}

function emitSuccess(env,index){
  env.context.dispatchEvent(new env.context.CustomEvent('offline-sync-metadata-stability:observed',{detail:{outcome:'success',sessionId:`success-${index}`}}));
}

test('4U permanece observador local sem nova autoridade remota',()=>{
  assert.doesNotMatch(observerSource,/\.from\s*\(/);
  assert.doesNotMatch(observerSource,/\.upsert\s*\(/);
  assert.doesNotMatch(observerSource,/\bfetch\s*\(/);
  assert.match(observerSource,/remoteAuthority:false/);
  assert.match(observerSource,/metadata-ring2-promoted-stability-v1/);
  assert.match(observerSource,/populationPercent:45/);
  assert.match(observerSource,/maxRemoteWrites:2/);
});

test('cinco sucessos limpos após a promoção 4T habilitam revisão populacional',()=>{
  const env=makeContext();
  for(let i=1;i<=5;i++)emitSuccess(env,i);
  const report=env.context.OfflineSyncMetadataRing2PromotedStability.getReport();
  assert.equal(report.successes,5);
  assert.equal(report.failures,0);
  assert.equal(report.aborted,0);
  assert.equal(report.stable,true);
  assert.equal(report.readyForPopulationReview,true);
  assert.deepEqual([...report.reasons],[]);
});

test('usuário 35–44 ainda não promovido não acumula observações pós-promoção',()=>{
  const env=makeContext({promoted:false,promotedAt:null});
  emitSuccess(env,1);
  const api=env.context.OfflineSyncMetadataRing2PromotedStability;
  assert.equal(api.readHistory().length,0);
  const report=api.getReport();
  assert.equal(report.readyForPopulationReview,false);
  assert.ok([...report.reasons].includes('never-promoted-by-4t'));
});

test('falha ou revogação da 4T invalida prontidão',()=>{
  const env=makeContext();
  for(let i=1;i<=5;i++)emitSuccess(env,i);
  env.setPromoted(false);env.setPromotionEligible(false);
  env.context.dispatchEvent(new env.context.CustomEvent('offline-sync-metadata-ring2-promotion:revoked',{detail:{userId:'ring2-user',promotedAt:'2026-08-26T00:00:00.000Z',revokedAt:'2026-08-26T00:05:00.000Z',revokeReason:'eligibility-regressed',detail:{reasons:['metadata-parity-not-eligible'],sourceDetail:{outcome:'failure'}}}}));
  const report=env.context.OfflineSyncMetadataRing2PromotedStability.getReport();
  assert.equal(report.failures,1);
  assert.equal(report.readyForPopulationReview,false);
  assert.ok([...report.reasons].includes('recent-ring2-promoted-canary-failure'));
});

test('4U não amplia o orçamento remoto acima de dois writes',()=>{
  assert.match(promotionSource,/const PROMOTED_REMOTE_WRITES = 2;/);
  assert.doesNotMatch(observerSource,/getMaxRemoteWrites/);
});

test('AppState carrega 4U após 4T e expõe diagnóstico',()=>{
  const promotionIndex=appStateSource.indexOf('offline-sync-metadata-ring2-promotion.js?v=10.52.0');
  const observerIndex=appStateSource.indexOf('offline-sync-metadata-ring2-promoted-stability.js?v=10.52.0');
  const expansionIndex=appStateSource.indexOf('offline-sync-metadata-expansion.js?v=10.52.0');
  assert.ok(promotionIndex>=0);
  assert.ok(observerIndex>promotionIndex);
  assert.ok(expansionIndex>observerIndex);
  assert.match(appStateSource,/metadataRing2PromotedStability:global\.OfflineSyncMetadataRing2PromotedStability/);
  assert.match(appStateSource,/getOfflineSyncMetadataRing2PromotedStabilityDiagnostics/);
});

test('asset 4U integra manifesto sem alterar identidade durante implementação',()=>{
  const asset='/js/core/offline-sync-metadata-ring2-promoted-stability.js';
  assert.equal(manifest.version,'10.52.0');
  assert.ok(manifest.criticalAppShell.includes(asset));
  assert.ok(manifest.networkFirstPaths.includes(asset));
  assert.ok(manifest.workerNoStorePaths.includes(asset));
  assert.ok(manifest.headersNoStorePaths.includes(asset));
});

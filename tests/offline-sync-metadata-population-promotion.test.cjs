'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/core/offline-sync-metadata-population-promotion.js','utf8');
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
  if(options.state) store.set(`offline_sync_metadata_population_promotion_v1_${options.userId||'population-user'}`,JSON.stringify(options.state));
  const tier=options.tier||'population-expanded-base';
  const context={
    console,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,Math,
    currentUser:{id:options.userId||'population-user'},
    localStorage:{getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)},
    OfflineSyncMetadataExpandedStability:{getPopulationReport:()=>({readyForDepthReview:options.ready!==false,tier})},
    OfflineSyncMetadataRollout:{
      getCohortAssignment:userId=>({userId:userId||null,tier,percent:35,included:tier!=='excluded'}),
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
  vm.runInContext(source,context,{filename:'offline-sync-metadata-population-promotion.js'});
  return {context,events,store};
}

test('4P é política local e não cria nova autoridade remota',()=>{
  assert.match(source,/metadata-population-promotion-v1/);
  assert.doesNotMatch(source,/\.from\s*\(/);
  assert.doesNotMatch(source,/\.upsert\s*\(/);
  assert.doesNotMatch(source,/\.delete\s*\(/);
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.match(source,/remoteAuthority:false/);
});

test('usuário 25–34 pronto na 4O pode ser promovido individualmente',()=>{
  const env=makeContext();
  assert.equal(env.context.OfflineSyncMetadataPopulationPromotion.install(),true);
  const diag=env.context.OfflineSyncMetadataPopulationPromotion.getDiagnostics();
  assert.equal(diag.promoted,true);
  assert.equal(diag.maxRemoteWrites,2);
  assert.equal(diag.populationPercent,35);
  assert.ok(env.events.some(event=>event.type==='offline-sync-metadata-population-promotion:promoted'));
});

test('4P recusa promoção sem readyForDepthReview',()=>{
  const env=makeContext({ready:false});
  env.context.OfflineSyncMetadataPopulationPromotion.install();
  const diag=env.context.OfflineSyncMetadataPopulationPromotion.getDiagnostics();
  assert.equal(diag.promoted,false);
  assert.equal(diag.maxRemoteWrites,1);
  assert.ok([...diag.eligibility.reasons].includes('population-stability-not-ready'));
});

test('4P não promove piloto, expanded-base anterior ou excluídos',()=>{
  for(const tier of ['pilot','expanded-base','excluded']){
    const env=makeContext({tier});
    env.context.OfflineSyncMetadataPopulationPromotion.install();
    const diag=env.context.OfflineSyncMetadataPopulationPromotion.getDiagnostics();
    assert.equal(diag.promoted,false);
    assert.ok([...diag.eligibility.reasons].includes('outside-population-expanded-base-tier'));
  }
});

test('circuit breaker, kill switch e rollout inativo bloqueiam promoção',()=>{
  for(const options of [{circuit:true},{hardKill:true},{rolloutEnabled:false},{graduationEnabled:false},{rolloutEligible:false}]){
    const env=makeContext(options);
    env.context.OfflineSyncMetadataPopulationPromotion.install();
    assert.equal(env.context.OfflineSyncMetadataPopulationPromotion.isPromoted(),false);
  }
});

test('promoção persistida é revogada quando elegibilidade longitudinal regride',()=>{
  const env=makeContext({ready:false,state:{promoted:true,promotedAt:'earlier'}});
  env.context.OfflineSyncMetadataPopulationPromotion.install();
  const state=env.context.OfflineSyncMetadataPopulationPromotion.readState();
  assert.equal(state.promoted,false);
  assert.equal(state.revokeReason,'eligibility-regressed');
  assert.ok(env.events.some(event=>event.type==='offline-sync-metadata-population-promotion:revoked'));
});

test('budget 4P permanece rigidamente limitado a dois writes',()=>{
  assert.match(source,/PROMOTED_REMOTE_WRITES\s*=\s*2/);
  assert.doesNotMatch(source,/PROMOTED_REMOTE_WRITES\s*=\s*[3-9]/);
  assert.match(expansionSource,/OfflineSyncMetadataPopulationPromotion/);
  assert.match(expansionSource,/populationPromoted/);
});

test('AppState carrega 4P antes da política final de expansão e expõe diagnóstico',()=>{
  const populationIndex=appStateSource.indexOf('offline-sync-metadata-population-promotion.js?v=10.50.1');
  const expansionIndex=appStateSource.indexOf('offline-sync-metadata-expansion.js?v=10.50.1');
  assert.ok(populationIndex>=0);
  assert.ok(expansionIndex>populationIndex);
  assert.match(appStateSource,/metadataPopulationPromotion/);
  assert.match(appStateSource,/getOfflineSyncMetadataPopulationPromotionDiagnostics/);
});

test('asset 4P integra shell, network-first e contratos no-store',()=>{
  const path='/js/core/offline-sync-metadata-population-promotion.js';
  assert.equal(assets.version,'10.50.1');
  for(const key of ['criticalAppShell','networkFirstPaths','workerNoStorePaths','headersNoStorePaths']) assert.ok(assets[key].includes(path),key);
  assert.ok(swSource.includes(`'./js/core/offline-sync-metadata-population-promotion.js'`));
  assert.ok(swSource.includes(`'/js/core/offline-sync-metadata-population-promotion.js'`));
  assert.ok(workerSource.includes(path));
  assert.ok(headersSource.includes(path));
});

test('4P não amplia a população-base além dos 35%',()=>{
  assert.match(source,/populationPercent:35/);
  assert.doesNotMatch(source,/COHORT_PERCENT\s*=\s*(?:4[0-9]|[5-9][0-9]|100)/);
  assert.doesNotMatch(expansionSource,/COHORT_PERCENT\s*=\s*(?:4[0-9]|[5-9][0-9]|100)/);
});

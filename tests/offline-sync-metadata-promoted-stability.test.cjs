'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const observerSource=fs.readFileSync('public/js/core/offline-sync-metadata-promoted-stability.js','utf8');
const promotionSource=fs.readFileSync('public/js/core/offline-sync-metadata-expanded-promotion.js','utf8');
const appStateSource=fs.readFileSync('public/js/app-state.js','utf8');
const manifest=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));
const swSource=fs.readFileSync('public/sw.js','utf8');
const workerSource=fs.readFileSync('src/worker.js','utf8');
const headersSource=fs.readFileSync('public/_headers','utf8');

function makeStorage(){
  const data=new Map();
  return {
    getItem:key=>data.has(key)?data.get(key):null,
    setItem:(key,value)=>data.set(key,String(value)),
    removeItem:key=>data.delete(key),
    dump:()=>new Map(data)
  };
}

function makeContext(options={}){
  const listeners=new Map();
  const events=[];
  const localStorage=makeStorage();
  let tier=options.tier||'expanded-base';
  let promoted=options.promoted!==false;
  let promotionEligible=options.promotionEligible!==false;
  let parityEligible=options.parityEligible!==false;
  const promotedAt=options.promotedAt===undefined?'2026-08-25T12:00:00.000Z':options.promotedAt;

  const context={
    console,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,Math,localStorage,
    currentUser:{id:options.userId||'expanded-user'},
    OfflineSyncMetadataExpandedPromotion:{
      readState:userId=>({mode:'metadata-expanded-pilot-promotion-v1',userId:userId||'expanded-user',promoted,promotedAt}),
      getEligibility:()=>({eligible:promotionEligible,reasons:promotionEligible?[]:['expanded-stability-not-ready']})
    },
    OfflineSyncMetadataRollout:{
      getCohortAssignment:userId=>({userId:userId||null,bucket:tier==='pilot'?2:tier==='expanded-base'?15:70,included:tier!=='excluded',tier})
    },
    OfflineSyncMetadataAuthority:{
      getEligibility:()=>({eligible:parityEligible,reasons:parityEligible?[]:['metadata-parity-not-eligible']})
    },
    CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},
    addEventListener:(type,fn)=>{const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},
    dispatchEvent:event=>{events.push(event);for(const fn of listeners.get(event.type)||[])fn(event);return true;}
  };
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(observerSource,context,{filename:'offline-sync-metadata-promoted-stability.js'});
  context.OfflineSyncMetadataPromotedStability.install();

  return {
    context,events,localStorage,
    setTier:value=>{tier=value;},
    setPromoted:value=>{promoted=Boolean(value);},
    setPromotionEligible:value=>{promotionEligible=Boolean(value);},
    setParityEligible:value=>{parityEligible=Boolean(value);}
  };
}

function emitBaseSuccess(env,index){
  env.context.dispatchEvent(new env.context.CustomEvent('offline-sync-metadata-stability:observed',{
    detail:{outcome:'success',sessionId:`success-${index}`}
  }));
}

test('4M é observador local sem nova autoridade remota',()=>{
  assert.doesNotMatch(observerSource,/\.from\s*\(/);
  assert.doesNotMatch(observerSource,/\.upsert\s*\(/);
  assert.doesNotMatch(observerSource,/\.delete\s*\(/);
  assert.doesNotMatch(observerSource,/\bfetch\s*\(/);
  assert.match(observerSource,/remoteAuthority:false/);
  assert.match(observerSource,/metadata-promoted-stability-v1/);
  assert.match(observerSource,/readyForPopulationReview/);
});

test('expanded-base ainda não promovido não acumula sucessos pós-promoção',()=>{
  const env=makeContext({promoted:false,promotedAt:null});
  emitBaseSuccess(env,1);
  const api=env.context.OfflineSyncMetadataPromotedStability;
  assert.equal(api.readHistory().length,0);
  const report=api.getReport();
  assert.equal(report.readyForPopulationReview,false);
  assert.ok([...report.reasons].includes('never-promoted-by-4l'));
  assert.ok([...report.reasons].includes('promotion-not-currently-active'));
});

test('cinco sucessos limpos após promoção habilitam apenas revisão populacional',()=>{
  const env=makeContext();
  for(let i=1;i<=5;i++)emitBaseSuccess(env,i);
  const report=env.context.OfflineSyncMetadataPromotedStability.getReport();
  assert.equal(report.successes,5);
  assert.equal(report.failures,0);
  assert.equal(report.aborted,0);
  assert.equal(report.promoted,true);
  assert.equal(report.stable,true);
  assert.equal(report.readyForPopulationReview,true);
  assert.deepEqual([...report.reasons],[]);
});

test('piloto original e usuários fora da base não entram na observação 4M',()=>{
  for(const tier of ['pilot','excluded']){
    const env=makeContext({tier});
    emitBaseSuccess(env,1);
    const api=env.context.OfflineSyncMetadataPromotedStability;
    assert.equal(api.readHistory().length,0);
    assert.equal(api.getReport().readyForPopulationReview,false);
    assert.ok([...api.getReport().reasons].includes('outside-expanded-base-tier'));
  }
});

test('revogação causada por falha de canário registra failure e invalida revisão',()=>{
  const env=makeContext();
  for(let i=1;i<=5;i++)emitBaseSuccess(env,i);
  env.setPromoted(false);
  env.setPromotionEligible(false);
  env.context.dispatchEvent(new env.context.CustomEvent('offline-sync-metadata-expanded-promotion:revoked',{
    detail:{
      userId:'expanded-user',promotedAt:'2026-08-25T12:00:00.000Z',revokedAt:'2026-08-25T12:10:00.000Z',
      revokeReason:'eligibility-regressed',
      detail:{reasons:['expanded-stability-not-ready'],sourceDetail:{outcome:'failure'}}
    }
  }));
  const report=env.context.OfflineSyncMetadataPromotedStability.getReport();
  assert.equal(report.failures,1);
  assert.equal(report.readyForPopulationReview,false);
  assert.ok([...report.reasons].includes('recent-promoted-canary-failure'));
});

test('revogação administrativa registra aborted sem confundir com failure',()=>{
  const env=makeContext();
  env.setPromoted(false);
  env.setPromotionEligible(false);
  env.context.dispatchEvent(new env.context.CustomEvent('offline-sync-metadata-expanded-promotion:revoked',{
    detail:{
      userId:'expanded-user',promotedAt:'2026-08-25T12:00:00.000Z',revokedAt:'2026-08-25T12:15:00.000Z',
      revokeReason:'offline-sync-metadata-rollout:stopped',detail:{sourceDetail:{reason:'manual-disable'}}
    }
  }));
  const report=env.context.OfflineSyncMetadataPromotedStability.getReport();
  assert.equal(report.failures,0);
  assert.equal(report.aborted,1);
  assert.ok([...report.reasons].includes('recent-promoted-canary-abort'));
});

test('histórico pós-promoção é separado, deduplicado e limitado a dez amostras',()=>{
  const env=makeContext();
  const api=env.context.OfflineSyncMetadataPromotedStability;
  for(let i=0;i<12;i++)api.observe('success',{sessionId:`s-${i}`});
  assert.equal(api.readHistory().length,10);
  api.observe('failure',{sessionId:'s-11',reason:'replacement'});
  const history=[...api.readHistory()];
  assert.equal(history.length,10);
  assert.equal(history.filter(row=>row.sessionId==='s-11').length,1);
  assert.equal(history.find(row=>row.sessionId==='s-11').outcome,'failure');
  assert.ok([...env.localStorage.dump().keys()].some(key=>key.startsWith('offline_sync_metadata_promoted_stability_v1_')));
});

test('leitura de relatório não chama isPromoted nem provoca transição na 4L',()=>{
  assert.doesNotMatch(observerSource,/promotion\(\)\?\.isPromoted/);
  assert.match(observerSource,/promotionSnapshot/);
  const env=makeContext();
  const before=env.events.length;
  env.context.OfflineSyncMetadataPromotedStability.getReport();
  env.context.OfflineSyncMetadataPromotedStability.getDiagnostics();
  assert.equal(env.events.length,before);
});

test('4M não amplia budget remoto da 4L acima de dois writes',()=>{
  assert.match(promotionSource,/const PROMOTED_REMOTE_WRITES = 2;/);
  assert.doesNotMatch(observerSource,/PROMOTED_REMOTE_WRITES/);
  assert.doesNotMatch(observerSource,/getMaxRemoteWrites/);
});

test('AppState carrega 4M após 4L e antes da 4I e expõe diagnóstico',()=>{
  const promotionIndex=appStateSource.indexOf('offline-sync-metadata-expanded-promotion.js?v=10.43.0');
  const promotedStabilityIndex=appStateSource.indexOf('offline-sync-metadata-promoted-stability.js?v=10.43.0');
  const expansionIndex=appStateSource.indexOf('offline-sync-metadata-expansion.js?v=10.43.0');
  assert.ok(promotionIndex>=0);
  assert.ok(promotedStabilityIndex>promotionIndex);
  assert.ok(expansionIndex>promotedStabilityIndex);
  assert.match(appStateSource,/metadataPromotedStability:global\.OfflineSyncMetadataPromotedStability/);
  assert.match(appStateSource,/getOfflineSyncMetadataPromotedStabilityDiagnostics/);
});

test('4M integra PWA/no-store e preserva identidade 10.43.0 durante implementação',()=>{
  const asset='/js/core/offline-sync-metadata-promoted-stability.js';
  assert.equal(manifest.version,'10.43.0');
  assert.ok(manifest.criticalAppShell.includes(asset));
  assert.ok(manifest.networkFirstPaths.includes(asset));
  assert.ok(manifest.workerNoStorePaths.includes(asset));
  assert.ok(manifest.headersNoStorePaths.includes(asset));
  assert.match(swSource,/offline-sync-metadata-promoted-stability\.js/);
  assert.match(workerSource,/offline-sync-metadata-promoted-stability\.js/);
  assert.match(headersSource,/\/js\/core\/offline-sync-metadata-promoted-stability\.js/);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const promotionSource=fs.readFileSync('public/js/core/offline-sync-metadata-expanded-promotion.js','utf8');
const expansionSource=fs.readFileSync('public/js/core/offline-sync-metadata-expansion.js','utf8');
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
    removeItem:key=>data.delete(key)
  };
}

function makeContext(options={}){
  const listeners=new Map();
  const events=[];
  let ready=options.ready!==false;
  let tier=options.tier||'expanded-base';
  let rolloutEnabled=options.rolloutEnabled!==false;
  let graduationEnabled=options.graduationEnabled!==false;
  let circuit=options.circuit||null;
  let hardKill=Boolean(options.hardKill);
  const localStorage=makeStorage();
  const context={
    console,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,Math,localStorage,
    currentUser:{id:options.userId||'expanded-user'},
    OfflineSyncMetadataExpandedStability:{
      getReport:()=>({readyForPilotReview:ready,reasons:ready?[]:['expanded-stability-not-ready']})
    },
    OfflineSyncMetadataRollout:{
      getCohortAssignment:userId=>({userId:userId||null,bucket:tier==='pilot'?1:tier==='expanded-base'?15:70,percent:25,included:tier!=='excluded',pilotPercent:10,pilotIncluded:tier==='pilot',tier}),
      getPilotCohortAssignment:userId=>({userId:userId||null,bucket:tier==='pilot'?1:15,percent:10,included:tier==='pilot'}),
      getEligibility:()=>({eligible:true,reasons:[]}),
      isEnabled:()=>rolloutEnabled
    },
    OfflineSyncMetadataAuthority:{
      getCircuit:()=>circuit,
      isHardKilled:()=>hardKill
    },
    OfflineSyncMetadataGraduation:{
      isEnabled:()=>graduationEnabled,
      isHardKilled:()=>hardKill
    },
    CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},
    addEventListener:(type,fn)=>{const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},
    dispatchEvent:event=>{events.push(event);for(const fn of listeners.get(event.type)||[]) fn(event);return true;}
  };
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(promotionSource,context,{filename:'offline-sync-metadata-expanded-promotion.js'});
  context.OfflineSyncMetadataExpandedPromotion.install();
  return {
    context,events,
    setReady:value=>{ready=Boolean(value);},
    setTier:value=>{tier=value;},
    setRolloutEnabled:value=>{rolloutEnabled=Boolean(value);},
    setGraduationEnabled:value=>{graduationEnabled=Boolean(value);},
    setCircuit:value=>{circuit=value;},
    setHardKill:value=>{hardKill=Boolean(value);}
  };
}

test('4L é política local sem nova autoridade ou telemetria remota',()=>{
  assert.doesNotMatch(promotionSource,/\.from\s*\(/);
  assert.doesNotMatch(promotionSource,/\.upsert\s*\(/);
  assert.doesNotMatch(promotionSource,/\.delete\s*\(/);
  assert.doesNotMatch(promotionSource,/\bfetch\s*\(/);
  assert.match(promotionSource,/remoteAuthority:false/);
  assert.match(promotionSource,/STATE_PREFIX/);
});

test('expanded-base estável recebe promoção persistida para dois writes',()=>{
  const env=makeContext();
  const api=env.context.OfflineSyncMetadataExpandedPromotion;
  assert.equal(api.isPromoted(),true);
  assert.equal(api.getMaxRemoteWrites(),2);
  const state=api.readState();
  assert.equal(state.promoted,true);
  assert.equal(state.mode,'metadata-expanded-pilot-promotion-v1');
  assert.ok(env.events.some(event=>event.type==='offline-sync-metadata-expanded-promotion:promoted'));
});

test('piloto original e usuários fora da base nunca são promovidos pela 4L',()=>{
  const pilot=makeContext({tier:'pilot'}).context.OfflineSyncMetadataExpandedPromotion;
  assert.equal(pilot.isPromoted(),false);
  assert.ok([...pilot.getEligibility().reasons].includes('outside-expanded-base-tier'));
  const excluded=makeContext({tier:'excluded'}).context.OfflineSyncMetadataExpandedPromotion;
  assert.equal(excluded.isPromoted(),false);
});

test('promoção é revogada imediatamente quando estabilidade deixa de ser válida',()=>{
  const env=makeContext();
  const api=env.context.OfflineSyncMetadataExpandedPromotion;
  assert.equal(api.isPromoted(),true);
  env.setReady(false);
  env.context.dispatchEvent(new env.context.CustomEvent('offline-sync-metadata-stability:observed',{detail:{outcome:'failure'}}));
  assert.equal(api.isPromoted(),false);
  assert.equal(api.getMaxRemoteWrites(),1);
  assert.equal(api.readState().promoted,false);
  assert.ok(env.events.some(event=>event.type==='offline-sync-metadata-expanded-promotion:revoked'));
});

test('kill switch, circuito, rollout ou graduation inativos impedem profundidade maior',()=>{
  const killed=makeContext({hardKill:true}).context.OfflineSyncMetadataExpandedPromotion;
  assert.equal(killed.isPromoted(),false);
  const circuit=makeContext({circuit:{openedAt:'now'}}).context.OfflineSyncMetadataExpandedPromotion;
  assert.equal(circuit.isPromoted(),false);
  const rolloutOff=makeContext({rolloutEnabled:false}).context.OfflineSyncMetadataExpandedPromotion;
  assert.equal(rolloutOff.isPromoted(),false);
  const graduationOff=makeContext({graduationEnabled:false}).context.OfflineSyncMetadataExpandedPromotion;
  assert.equal(graduationOff.isPromoted(),false);
});

test('4I consome promoção externa sem ampliar setEnabled manual para expanded-base',()=>{
  assert.match(expansionSource,/OfflineSyncMetadataExpandedPromotion/);
  assert.match(expansionSource,/outside-expansion-pilot-cohort/);
  assert.match(expansionSource,/if \(!eligibility\.originalPilot \|\| !eligibility\.eligible\)/);
  assert.match(expansionSource,/hasDepthGrant/);
});

test('AppState carrega 4L entre 4K e 4I e expõe diagnóstico',()=>{
  const stabilityIndex=appStateSource.indexOf('offline-sync-metadata-expanded-stability.js?v=10.50.1');
  const promotionIndex=appStateSource.indexOf('offline-sync-metadata-expanded-promotion.js?v=10.50.1');
  const expansionIndex=appStateSource.indexOf('offline-sync-metadata-expansion.js?v=10.50.1');
  assert.ok(stabilityIndex>=0);
  assert.ok(promotionIndex>stabilityIndex);
  assert.ok(expansionIndex>promotionIndex);
  assert.match(appStateSource,/metadataExpandedPromotion:global\.OfflineSyncMetadataExpandedPromotion/);
  assert.match(appStateSource,/getOfflineSyncMetadataExpandedPromotionDiagnostics/);
});

test('4L integra contratos PWA e no-store sem promover versão durante implementação',()=>{
  const asset='/js/core/offline-sync-metadata-expanded-promotion.js';
  assert.equal(manifest.version,'10.50.1');
  assert.ok(manifest.criticalAppShell.includes(asset));
  assert.ok(manifest.networkFirstPaths.includes(asset));
  assert.ok(manifest.workerNoStorePaths.includes(asset));
  assert.ok(manifest.headersNoStorePaths.includes(asset));
  assert.match(swSource,/offline-sync-metadata-expanded-promotion\.js/);
  assert.match(workerSource,/offline-sync-metadata-expanded-promotion\.js/);
  assert.match(headersSource,/\/js\/core\/offline-sync-metadata-expanded-promotion\.js/);
});

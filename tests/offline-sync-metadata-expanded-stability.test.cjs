'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/core/offline-sync-metadata-expanded-stability.js','utf8');
const appStateSource=fs.readFileSync('public/js/app-state.js','utf8');
const manifest=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));
const swSource=fs.readFileSync('public/sw.js','utf8');
const workerSource=fs.readFileSync('src/worker.js','utf8');
const headersSource=fs.readFileSync('public/_headers','utf8');

function rows(successes=0, failures=0, aborted=0){
  return [
    ...Array.from({length:successes},(_,i)=>({sessionId:`s${i}`,outcome:'success'})),
    ...Array.from({length:failures},(_,i)=>({sessionId:`f${i}`,outcome:'failure'})),
    ...Array.from({length:aborted},(_,i)=>({sessionId:`a${i}`,outcome:'aborted'}))
  ].slice(-10);
}

function makeContext(options={}){
  const listeners=new Map();
  const events=[];
  const history=options.history||rows();
  const tier=options.tier||'expanded-base';
  const parityEligible=options.parityEligible!==false;
  const context={
    console,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,Math,
    currentUser:{id:options.userId||'expanded-user'},
    OfflineSyncMetadataRollout:{
      getCohortAssignment:userId=>({userId:userId||null,bucket:tier==='pilot'?1:tier==='expanded-base'?15:70,percent:25,included:tier!=='excluded',pilotPercent:10,pilotIncluded:tier==='pilot',tier})
    },
    OfflineSyncMetadataStability:{
      WINDOW_SIZE:10,
      readHistory:()=>Object.freeze(history.map(row=>Object.freeze({...row}))),
      getReport:userId=>({userId:userId||null,window:10,parity:{eligible:parityEligible},history:Object.freeze(history.map(row=>Object.freeze({...row})))})
    },
    CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},
    addEventListener:(type,fn)=>{const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},
    dispatchEvent:event=>{events.push(event);for(const fn of listeners.get(event.type)||[]) fn(event);return true;}
  };
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'offline-sync-metadata-expanded-stability.js'});
  context.OfflineSyncMetadataExpandedStability.install();
  return {context,events};
}

test('4K é diagnóstico local sem autoridade remota ou ledger duplicado',()=>{
  assert.doesNotMatch(source,/\.from\s*\(/);
  assert.doesNotMatch(source,/\.upsert\s*\(/);
  assert.doesNotMatch(source,/\.delete\s*\(/);
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.doesNotMatch(source,/localStorage|setItem\s*\(/);
  assert.match(source,/OfflineSyncMetadataStability/);
  assert.match(source,/remoteAuthority:false/);
});

test('faixa expanded-base exige cinco canários limpos para revisão do piloto',()=>{
  const report=makeContext({history:rows(5)}).context.OfflineSyncMetadataExpandedStability.getReport();
  assert.equal(report.tier,'expanded-base');
  assert.equal(report.requiredCleanSuccesses,5);
  assert.equal(report.successes,5);
  assert.equal(report.failures,0);
  assert.equal(report.aborted,0);
  assert.equal(report.stable,true);
  assert.equal(report.readyForPilotReview,true);
});

test('quatro sucessos ainda são evidência insuficiente',()=>{
  const report=makeContext({history:rows(4)}).context.OfflineSyncMetadataExpandedStability.getReport();
  assert.equal(report.readyForPilotReview,false);
  assert.ok([...report.reasons].includes('insufficient-clean-expanded-canaries'));
});

test('falha ou aborto recente bloqueia prontidão mesmo com cinco sucessos',()=>{
  const failed=makeContext({history:rows(5,1)}).context.OfflineSyncMetadataExpandedStability.getReport();
  assert.equal(failed.readyForPilotReview,false);
  assert.ok([...failed.reasons].includes('recent-expanded-canary-failure'));
  const aborted=makeContext({history:rows(5,0,1)}).context.OfflineSyncMetadataExpandedStability.getReport();
  assert.equal(aborted.readyForPilotReview,false);
  assert.ok([...aborted.reasons].includes('recent-expanded-canary-abort'));
});

test('piloto original e usuários excluídos não são qualificados pela 4K',()=>{
  const pilot=makeContext({tier:'pilot',history:rows(6)}).context.OfflineSyncMetadataExpandedStability.getReport();
  assert.equal(pilot.readyForPilotReview,false);
  assert.ok([...pilot.reasons].includes('outside-expanded-base-tier'));
  const excluded=makeContext({tier:'excluded',history:rows(6)}).context.OfflineSyncMetadataExpandedStability.getReport();
  assert.equal(excluded.readyForPilotReview,false);
  assert.ok([...excluded.reasons].includes('outside-expanded-base-tier'));
});

test('paridade atual continua obrigatória',()=>{
  const report=makeContext({history:rows(5),parityEligible:false}).context.OfflineSyncMetadataExpandedStability.getReport();
  assert.equal(report.readyForPilotReview,false);
  assert.ok([...report.reasons].includes('metadata-parity-not-eligible'));
});

test('evento 4H reavalia somente a faixa expanded-base',()=>{
  const env=makeContext({history:rows(5)});
  env.context.dispatchEvent(new env.context.CustomEvent('offline-sync-metadata-stability:observed',{detail:{outcome:'success'}}));
  assert.ok(env.events.some(event=>event.type==='offline-sync-metadata-expanded-stability:evaluated'));
  const pilot=makeContext({tier:'pilot',history:rows(5)});
  pilot.context.dispatchEvent(new pilot.context.CustomEvent('offline-sync-metadata-stability:observed',{detail:{outcome:'success'}}));
  assert.equal(pilot.events.some(event=>event.type==='offline-sync-metadata-expanded-stability:evaluated'),false);
});

test('AppState carrega 4K depois da estabilidade e antes da expansão 4I',()=>{
  const stabilityIndex=appStateSource.indexOf('offline-sync-metadata-stability.js?v=10.52.0');
  const expandedIndex=appStateSource.indexOf('offline-sync-metadata-expanded-stability.js?v=10.52.0');
  const expansionIndex=appStateSource.indexOf('offline-sync-metadata-expansion.js?v=10.52.0');
  assert.ok(stabilityIndex>=0);
  assert.ok(expandedIndex>stabilityIndex);
  assert.ok(expansionIndex>expandedIndex);
  assert.match(appStateSource,/metadataExpandedStability:global\.OfflineSyncMetadataExpandedStability/);
  assert.match(appStateSource,/getOfflineSyncMetadataExpandedStabilityDiagnostics/);
});

test('4K integra contratos PWA e no-store',()=>{
  const asset='/js/core/offline-sync-metadata-expanded-stability.js';
  assert.ok(manifest.criticalAppShell.includes(asset));
  assert.ok(manifest.networkFirstPaths.includes(asset));
  assert.ok(manifest.workerNoStorePaths.includes(asset));
  assert.ok(manifest.headersNoStorePaths.includes(asset));
  assert.match(swSource,/offline-sync-metadata-expanded-stability\.js/);
  assert.match(workerSource,/offline-sync-metadata-expanded-stability\.js/);
  assert.match(headersSource,/\/js\/core\/offline-sync-metadata-expanded-stability\.js/);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/core/offline-sync-metadata-expansion.js','utf8');
const authoritySource=fs.readFileSync('public/js/core/offline-sync-metadata-authority.js','utf8');
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
  let stable=options.stable===true;
  let cohort=options.inCohort!==false;
  let pilot=options.inPilot!==false;
  let rolloutEligible=options.rolloutEligible!==false;
  let hardKill=options.hardKill===true;
  let circuit=options.circuit||null;
  let rolloutEnabled=false;
  const rolloutCalls=[];
  const context={
    console,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,Math,
    localStorage:makeStorage(),
    currentUser:{id:options.userId||'expansion-user'},
    OfflineSyncMetadataStability:{
      getReport:userId=>({userId:userId||null,readyForExpansion:stable,stable,reasons:stable?[]:['insufficient-successful-canaries']})
    },
    OfflineSyncMetadataRollout:{
      getCohortAssignment:userId=>({userId:userId||null,bucket:pilot?1:12,percent:25,included:cohort,pilotPercent:10,pilotIncluded:pilot,tier:pilot?'pilot':(cohort?'expanded-base':'excluded')}),
      getPilotCohortAssignment:userId=>({userId:userId||null,bucket:pilot?1:12,percent:10,included:pilot}),
      getEligibility:()=>({eligible:rolloutEligible,reasons:rolloutEligible?[]:['metadata-graduation-not-eligible']}),
      isEnabled:()=>rolloutEnabled,
      setEnabled:value=>{rolloutCalls.push(Boolean(value));rolloutEnabled=Boolean(value);return true;},
      setKillSwitch:value=>{hardKill=Boolean(value);return hardKill;}
    },
    OfflineSyncMetadataAuthority:{
      getCircuit:()=>circuit,
      isHardKilled:()=>hardKill
    },
    OfflineSyncMetadataGraduation:{isHardKilled:()=>hardKill},
    CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},
    addEventListener:(type,fn)=>{const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},
    dispatchEvent:event=>{events.push(event);for(const fn of listeners.get(event.type)||[]) fn(event);return true;}
  };
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'offline-sync-metadata-expansion.js'});
  context.OfflineSyncMetadataExpansion.install();
  return {
    context,events,rolloutCalls,
    setStable:value=>{stable=Boolean(value);},
    setCohort:value=>{cohort=Boolean(value);},
    setPilot:value=>{pilot=Boolean(value);},
    setRolloutEligible:value=>{rolloutEligible=Boolean(value);},
    setHardKill:value=>{hardKill=Boolean(value);},
    setCircuit:value=>{circuit=value;}
  };
}

function dispatch(env,type,detail={}){
  env.context.dispatchEvent(new env.context.CustomEvent(type,{detail}));
}

test('expansão nasce desligada e preserva teto legado de um write',()=>{
  const env=makeContext({stable:true});
  const expansion=env.context.OfflineSyncMetadataExpansion;
  assert.equal(expansion.isOptedIn(),false);
  assert.equal(expansion.isEnabled(),false);
  assert.equal(expansion.getMaxRemoteWrites(),1);
  const diagnostics=expansion.getDiagnostics();
  assert.equal(diagnostics.baseRemoteWrites,1);
  assert.equal(diagnostics.expandedRemoteWrites,2);
  assert.equal(diagnostics.remoteAuthority,false);
});

test('estabilidade 4H é obrigatória antes da expansão',()=>{
  const env=makeContext({stable:false});
  const expansion=env.context.OfflineSyncMetadataExpansion;
  assert.equal(expansion.setEnabled(true),false);
  assert.equal(expansion.getMaxRemoteWrites(),1);
  assert.ok([...expansion.getEligibility().reasons].includes('metadata-stability-not-ready'));
  assert.equal(env.rolloutCalls.length,0);
});

test('usuário estável do piloto pode optar por teto máximo de dois writes',()=>{
  const env=makeContext({stable:true,inPilot:true});
  const expansion=env.context.OfflineSyncMetadataExpansion;
  assert.equal(expansion.setEnabled(true),true);
  assert.equal(expansion.isOptedIn(),true);
  assert.equal(expansion.isEnabled(),true);
  assert.equal(expansion.getMaxRemoteWrites(),2);
  assert.deepEqual(env.rolloutCalls,[true]);
  assert.equal(expansion.getEligibility().pilotCohort.included,true);
});

test('faixa expandida 10-24 permanece rigidamente em um write',()=>{
  const env=makeContext({stable:true,inCohort:true,inPilot:false,rolloutEligible:true});
  const expansion=env.context.OfflineSyncMetadataExpansion;
  const eligibility=expansion.getEligibility();
  assert.equal(eligibility.cohort.included,true);
  assert.equal(eligibility.pilotCohort.included,false);
  assert.equal(eligibility.eligible,false);
  assert.ok([...eligibility.reasons].includes('outside-expansion-pilot-cohort'));
  assert.equal(expansion.setEnabled(true),false);
  assert.equal(expansion.getMaxRemoteWrites(),1);
  assert.equal(env.rolloutCalls.length,0);
});

test('coorte base e elegibilidade do rollout continuam obrigatórias',()=>{
  const outside=makeContext({stable:true,inCohort:false,inPilot:false});
  assert.equal(outside.context.OfflineSyncMetadataExpansion.setEnabled(true),false);
  assert.ok([...outside.context.OfflineSyncMetadataExpansion.getEligibility().reasons].includes('outside-rollout-cohort'));

  const ineligible=makeContext({stable:true,rolloutEligible:false});
  assert.equal(ineligible.context.OfflineSyncMetadataExpansion.setEnabled(true),false);
  assert.ok([...ineligible.context.OfflineSyncMetadataExpansion.getEligibility().reasons].includes('metadata-rollout-not-eligible'));
});

test('circuit breaker e kill switch bloqueiam expansão',()=>{
  const circuit=makeContext({stable:true,circuit:{openedAt:'now'}});
  assert.equal(circuit.context.OfflineSyncMetadataExpansion.setEnabled(true),false);
  assert.ok([...circuit.context.OfflineSyncMetadataExpansion.getEligibility().reasons].includes('metadata-authority-circuit-open'));

  const killed=makeContext({stable:true,hardKill:true});
  assert.equal(killed.context.OfflineSyncMetadataExpansion.setEnabled(true),false);
  assert.ok([...killed.context.OfflineSyncMetadataExpansion.getEligibility().reasons].includes('kill-switch-active'));
});

test('regressão de estabilidade faz fail-closed e volta ao teto um',()=>{
  const env=makeContext({stable:true});
  const expansion=env.context.OfflineSyncMetadataExpansion;
  assert.equal(expansion.setEnabled(true),true);
  env.setStable(false);
  dispatch(env,'offline-sync-metadata-stability:observed',{outcome:'failure'});
  assert.equal(expansion.isOptedIn(),false);
  assert.equal(expansion.getMaxRemoteWrites(),1);
  assert.equal(env.rolloutCalls.at(-1),false);
  assert.equal(expansion.getDiagnostics().state.stopReason,'metadata-stability-regressed');
});

test('falha/circuito da autoridade interrompe expansão',()=>{
  const env=makeContext({stable:true});
  const expansion=env.context.OfflineSyncMetadataExpansion;
  assert.equal(expansion.setEnabled(true),true);
  dispatch(env,'offline-sync-metadata-authority:fallback',{error:'boom'});
  assert.equal(expansion.isOptedIn(),false);
  assert.equal(expansion.getMaxRemoteWrites(),1);
});

test('opt-in é estritamente separado por user_id',()=>{
  const env=makeContext({stable:true,userId:'user-a'});
  const expansion=env.context.OfflineSyncMetadataExpansion;
  assert.equal(expansion.setEnabled(true),true);
  assert.equal(expansion.isOptedIn('user-a'),true);
  assert.equal(expansion.isOptedIn('user-b'),false);
  assert.equal(expansion.getMaxRemoteWrites('user-b'),1);
});

test('controlador é política local e não implementa acesso remoto',()=>{
  assert.doesNotMatch(source,/\.from\s*\(/);
  assert.doesNotMatch(source,/\.upsert\s*\(/);
  assert.doesNotMatch(source,/\.delete\s*\(/);
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.match(source,/EXPANDED_REMOTE_WRITES = 2/);
  assert.match(source,/getPilotCohortAssignment/);
  assert.match(source,/outside-expansion-pilot-cohort/);
});

test('autoridade preserva um write por padrão e aceita apenas teto limitado a dois',()=>{
  assert.match(authoritySource,/const MAX_REMOTE_WRITES = 1/);
  assert.match(authoritySource,/OfflineSyncMetadataExpansion\?\.getMaxRemoteWrites/);
  assert.match(authoritySource,/Math\.min\(2, Math\.floor\(proposed\)\)/);
  assert.match(authoritySource,/const maxRemoteWrites = getMaxRemoteWrites\(userId\)/);
  assert.match(authoritySource,/if \(getBudget\(userId\)\.exhausted\) stopCanary\('budget-exhausted'\)/);
  assert.doesNotMatch(authoritySource,/Math\.min\([3-9]/);
});

test('AppState carrega expansion depois de stability e antes das autoridades do edital',()=>{
  const stabilityIndex=appStateSource.indexOf('offline-sync-metadata-stability.js?v=10.53.0');
  const expansionIndex=appStateSource.indexOf('offline-sync-metadata-expansion.js?v=10.53.0');
  const editalAuthorityIndex=appStateSource.indexOf('offline-sync-authority.js?v=10.53.0');
  assert.ok(stabilityIndex>=0);
  assert.ok(expansionIndex>stabilityIndex);
  assert.ok(editalAuthorityIndex>expansionIndex);
  assert.match(appStateSource,/metadataExpansion:global\.OfflineSyncMetadataExpansion/);
  assert.match(appStateSource,/getOfflineSyncMetadataExpansionDiagnostics/);
});

test('expansion integra contratos PWA e no-store',()=>{
  const asset='/js/core/offline-sync-metadata-expansion.js';
  assert.ok(manifest.criticalAppShell.includes(asset));
  assert.ok(manifest.networkFirstPaths.includes(asset));
  assert.ok(manifest.workerNoStorePaths.includes(asset));
  assert.ok(manifest.headersNoStorePaths.includes(asset));
  assert.match(swSource,/offline-sync-metadata-expansion\.js/);
  assert.match(workerSource,/offline-sync-metadata-expansion\.js/);
  assert.match(headersSource,/\/js\/core\/offline-sync-metadata-expansion\.js/);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/core/offline-sync-metadata-graduation.js','utf8');
const appStateSource=fs.readFileSync('public/js/app-state.js','utf8');
const manifest=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));
const swSource=fs.readFileSync('public/sw.js','utf8');
const workerSource=fs.readFileSync('src/worker.js','utf8');
const headersSource=fs.readFileSync('public/_headers','utf8');

function makeStorage(){
  const map=new Map();
  return {
    getItem:key=>map.has(String(key))?map.get(String(key)):null,
    setItem:(key,value)=>map.set(String(key),String(value)),
    removeItem:key=>map.delete(String(key))
  };
}

function makeAuthority(options={}){
  let optedIn=false;
  let hardKill=false;
  let circuit=null;
  let enableCalls=0;
  let disableCalls=0;
  return {
    getEligibility:()=>({
      eligible:options.eligible!==false,
      sampleCount:options.sampleCount??8,
      requiredSamples:8,
      reasons:options.eligible===false?['insufficient-parity']:[]
    }),
    isHardKilled:()=>hardKill,
    isOptedIn:()=>optedIn,
    isEnabled:()=>optedIn&&!hardKill&&!circuit&&options.eligible!==false,
    setEnabled:value=>{
      if(value){
        enableCalls+=1;
        if(options.enableFails||options.eligible===false||hardKill) return false;
        optedIn=true;
        circuit=null;
        return true;
      }
      disableCalls+=1;
      optedIn=false;
      return true;
    },
    setKillSwitch:value=>{hardKill=Boolean(value);if(hardKill) optedIn=false;return hardKill;},
    resetCircuit:()=>{const had=Boolean(circuit);circuit=null;return had;},
    getCircuit:()=>circuit,
    getBudget:()=>({exhausted:false,remoteWrites:0,maxRemoteWrites:1}),
    getDiagnostics:()=>({mode:'metadata-authority-canary-v1',remoteAuthority:true}),
    _stats:()=>({optedIn,hardKill,circuit,enableCalls,disableCalls}),
    _trip:error=>{circuit={error};optedIn=false;}
  };
}

function makeContext(options={}){
  const listeners=new Map();
  const events=[];
  const authority=makeAuthority(options.authority||{});
  const context={
    console,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,
    localStorage:makeStorage(),
    currentUser:{id:'user-metadata-graduation'},
    OfflineSyncMetadataAuthority:authority,
    CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},
    addEventListener:(type,fn)=>{
      const list=listeners.get(type)||[];
      list.push(fn);
      listeners.set(type,list);
    },
    dispatchEvent:event=>{
      events.push(event);
      for(const fn of listeners.get(event.type)||[]) fn(event);
      return true;
    }
  };
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'offline-sync-metadata-graduation.js'});
  context.OfflineSyncMetadataGraduation.install();
  return {context,authority,events};
}

test('graduação de metadados nasce desligada e recusa autoridade inelegível',()=>{
  const env=makeContext({authority:{eligible:false}});
  const graduation=env.context.OfflineSyncMetadataGraduation;
  assert.equal(graduation.isOptedIn(),false);
  assert.equal(graduation.isEnabled(),false);
  assert.equal(graduation.getEligibility().eligible,false);
  assert.deepEqual([...graduation.getEligibility().reasons],['metadata-authority-not-eligible']);
  assert.equal(graduation.setEnabled(true),false);
  assert.equal(env.authority._stats().optedIn,false);
  assert.equal(graduation.getDiagnostics().state.stopReason,'ineligible');
});

test('ativação elegível delega exclusivamente à autoridade 4E',()=>{
  const env=makeContext();
  const graduation=env.context.OfflineSyncMetadataGraduation;
  assert.equal(graduation.setEnabled(true),true);
  assert.equal(graduation.isEnabled(),true);
  assert.equal(env.authority._stats().optedIn,true);
  assert.equal(env.authority._stats().enableCalls,1);
  assert.deepEqual([...graduation.getDiagnostics().scope],['user_settings:concursos_metadata:upsert']);
  assert.equal(graduation.getDiagnostics().remoteAuthority,false);
});

test('falha de ativação do filho faz rollback e preserva legado',()=>{
  const env=makeContext({authority:{enableFails:true}});
  const graduation=env.context.OfflineSyncMetadataGraduation;
  assert.equal(graduation.setEnabled(true),false);
  assert.equal(graduation.isOptedIn(),false);
  assert.equal(env.authority._stats().optedIn,false);
  assert.equal(graduation.getDiagnostics().state.stopReason,'child-enable-failed');
});

test('fallback da autoridade derruba graduação e desabilita o filho',()=>{
  const env=makeContext();
  const graduation=env.context.OfflineSyncMetadataGraduation;
  assert.equal(graduation.setEnabled(true),true);
  env.context.dispatchEvent(new env.context.CustomEvent('offline-sync-metadata-authority:fallback',{detail:{error:'remote'}}));
  assert.equal(graduation.isEnabled(),false);
  assert.equal(graduation.isOptedIn(),false);
  assert.equal(env.authority._stats().optedIn,false);
  assert.equal(graduation.getDiagnostics().state.stopReason,'child-authority-fallback');
});

test('circuit-open da autoridade derruba graduação',()=>{
  const env=makeContext();
  const graduation=env.context.OfflineSyncMetadataGraduation;
  assert.equal(graduation.setEnabled(true),true);
  env.context.dispatchEvent(new env.context.CustomEvent('offline-sync-metadata-authority:circuit-open',{detail:{error:'write'}}));
  assert.equal(graduation.isOptedIn(),false);
  assert.equal(env.authority._stats().optedIn,false);
  assert.equal(graduation.getDiagnostics().state.stopReason,'child-authority-fallback');
});

test('encerramento do canário por orçamento encerra também a graduação',()=>{
  const env=makeContext();
  const graduation=env.context.OfflineSyncMetadataGraduation;
  assert.equal(graduation.setEnabled(true),true);
  env.context.dispatchEvent(new env.context.CustomEvent('offline-sync-metadata-authority:canary-stopped',{detail:{reason:'budget-exhausted'}}));
  assert.equal(graduation.isOptedIn(),false);
  assert.equal(env.authority._stats().optedIn,false);
  assert.equal(graduation.getDiagnostics().state.stopReason,'budget-exhausted');
});

test('kill switch compartilhado encerra graduação e autoridade',()=>{
  const env=makeContext();
  const graduation=env.context.OfflineSyncMetadataGraduation;
  assert.equal(graduation.setEnabled(true),true);
  assert.equal(graduation.setKillSwitch(true),true);
  assert.equal(graduation.isHardKilled(),true);
  assert.equal(graduation.isEnabled(),false);
  assert.equal(graduation.isOptedIn(),false);
  assert.equal(env.authority._stats().optedIn,false);
});

test('coordenador não possui caminho remoto próprio',()=>{
  assert.doesNotMatch(source,/\.from\s*\(/);
  assert.doesNotMatch(source,/\.upsert\s*\(/);
  assert.doesNotMatch(source,/\.delete\s*\(/);
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.match(source,/OfflineSyncMetadataAuthority/);
  assert.match(source,/remoteAuthority:false/);
});

test('AppState carrega graduação entre autoridade de metadados e autoridade do edital',()=>{
  const shadowIndex=appStateSource.indexOf('offline-sync-metadata-shadow.js?v=10.56.0');
  const authorityIndex=appStateSource.indexOf('offline-sync-metadata-authority.js?v=10.56.0');
  const graduationIndex=appStateSource.indexOf('offline-sync-metadata-graduation.js?v=10.56.0');
  const editalAuthorityIndex=appStateSource.indexOf('offline-sync-authority.js?v=10.56.0');
  assert.ok(shadowIndex>=0);
  assert.ok(authorityIndex>shadowIndex);
  assert.ok(graduationIndex>authorityIndex);
  assert.ok(editalAuthorityIndex>graduationIndex);
  assert.match(appStateSource,/metadataGraduation:global\.OfflineSyncMetadataGraduation/);
  assert.match(appStateSource,/getOfflineSyncMetadataGraduationDiagnostics/);
});

test('coordenador integra todos os contratos PWA e no-store',()=>{
  const asset='/js/core/offline-sync-metadata-graduation.js';
  assert.ok(manifest.criticalAppShell.includes(asset));
  assert.ok(manifest.networkFirstPaths.includes(asset));
  assert.ok(manifest.workerNoStorePaths.includes(asset));
  assert.ok(manifest.headersNoStorePaths.includes(asset));
  assert.match(swSource,/offline-sync-metadata-graduation\.js/);
  assert.match(workerSource,/offline-sync-metadata-graduation\.js/);
  assert.match(headersSource,/\/js\/core\/offline-sync-metadata-graduation\.js/);
});

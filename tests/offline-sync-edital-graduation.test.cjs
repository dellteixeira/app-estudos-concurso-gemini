'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/core/offline-sync-edital-graduation.js','utf8');
const appStateSource=fs.readFileSync('public/js/app-state.js','utf8');
const manifest=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));

function makeStorage(){
  const map=new Map();
  return {
    getItem:key=>map.has(String(key))?map.get(String(key)):null,
    setItem:(key,value)=>map.set(String(key),String(value)),
    removeItem:key=>map.delete(String(key))
  };
}

function makeAuthority(kind,options={}){
  let optedIn=false;
  let hardKill=false;
  let circuit=null;
  let enableCalls=0;
  let disableCalls=0;
  return {
    getEligibility:()=>({eligible:options.eligible!==false,sampleCount:8,requiredSamples:8,reasons:options.eligible===false?[`${kind}-blocked`]:[]}),
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
    getBudget:()=>({exhausted:false,batches:0,items:0}),
    _stats:()=>({optedIn,hardKill,circuit,enableCalls,disableCalls}),
    _trip:error=>{circuit={error};optedIn=false;}
  };
}

function makeContext(options={}){
  const listeners=new Map();
  const events=[];
  const upsert=makeAuthority('upsert',options.upsert||{});
  const del=makeAuthority('delete',options.delete||{});
  const context={
    console,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,
    localStorage:makeStorage(),
    currentUser:{id:'user-graduation'},
    OfflineSyncAuthority:upsert,
    OfflineSyncDeleteAuthority:del,
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
  vm.runInContext(source,context,{filename:'offline-sync-edital-graduation.js'});
  context.OfflineSyncEditalGraduation.install();
  return {context,upsert,del,events};
}

test('graduação nasce desligada e exige elegibilidade conjunta',()=>{
  const env=makeContext({delete:{eligible:false}});
  const eligibility=env.context.OfflineSyncEditalGraduation.getEligibility();
  assert.equal(eligibility.eligible,false);
  assert.deepEqual([...eligibility.reasons],['delete-not-eligible']);
  assert.equal(env.context.OfflineSyncEditalGraduation.setEnabled(true),false);
  assert.equal(env.upsert._stats().optedIn,false);
  assert.equal(env.del._stats().optedIn,false);
});

test('ativação conjunta é atômica e habilita upsert + delete somente quando ambos aceitam',()=>{
  const env=makeContext();
  assert.equal(env.context.OfflineSyncEditalGraduation.setEnabled(true),true);
  assert.equal(env.context.OfflineSyncEditalGraduation.isEnabled(),true);
  assert.equal(env.upsert._stats().optedIn,true);
  assert.equal(env.del._stats().optedIn,true);
  assert.deepEqual([...env.context.OfflineSyncEditalGraduation.getDiagnostics().scope],[
    'edital-topic:upsert','edital-topic:delete'
  ]);
});

test('falha ao ativar segundo filho reverte o primeiro e mantém legado como autoridade',()=>{
  const env=makeContext({delete:{enableFails:true}});
  assert.equal(env.context.OfflineSyncEditalGraduation.setEnabled(true),false);
  assert.equal(env.upsert._stats().optedIn,false);
  assert.equal(env.del._stats().optedIn,false);
  assert.equal(env.context.OfflineSyncEditalGraduation.isOptedIn(),false);
  assert.equal(env.context.OfflineSyncEditalGraduation.getDiagnostics().state.stopReason,'atomic-enable-failed');
});

test('fallback/circuito de qualquer autoridade derruba o par inteiro',()=>{
  const env=makeContext();
  assert.equal(env.context.OfflineSyncEditalGraduation.setEnabled(true),true);
  env.context.dispatchEvent(new env.context.CustomEvent('offline-sync-delete-authority:fallback',{detail:{error:'remote'}}));
  assert.equal(env.context.OfflineSyncEditalGraduation.isEnabled(),false);
  assert.equal(env.context.OfflineSyncEditalGraduation.isOptedIn(),false);
  assert.equal(env.upsert._stats().optedIn,false);
  assert.equal(env.del._stats().optedIn,false);
  assert.equal(env.context.OfflineSyncEditalGraduation.getDiagnostics().state.stopReason,'child-authority-fallback');
});

test('encerramento por orçamento de um canário desliga também o outro',()=>{
  const env=makeContext();
  assert.equal(env.context.OfflineSyncEditalGraduation.setEnabled(true),true);
  env.context.dispatchEvent(new env.context.CustomEvent('offline-sync-authority:canary-stopped',{detail:{reason:'budget-exhausted'}}));
  assert.equal(env.context.OfflineSyncEditalGraduation.isOptedIn(),false);
  assert.equal(env.upsert._stats().optedIn,false);
  assert.equal(env.del._stats().optedIn,false);
  assert.equal(env.context.OfflineSyncEditalGraduation.getDiagnostics().state.stopReason,'budget-exhausted');
});

test('kill switch compartilhado derruba a graduação e os dois filhos',()=>{
  const env=makeContext();
  assert.equal(env.context.OfflineSyncEditalGraduation.setEnabled(true),true);
  assert.equal(env.context.OfflineSyncEditalGraduation.setKillSwitch(true),true);
  assert.equal(env.context.OfflineSyncEditalGraduation.isHardKilled(),true);
  assert.equal(env.context.OfflineSyncEditalGraduation.isEnabled(),false);
  assert.equal(env.upsert._stats().optedIn,false);
  assert.equal(env.del._stats().optedIn,false);
});

test('coordenador não possui caminho remoto próprio',()=>{
  assert.doesNotMatch(source,/\.from\s*\(/);
  assert.doesNotMatch(source,/\.upsert\s*\(/);
  assert.doesNotMatch(source,/\.delete\s*\(/);
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.match(source,/OfflineSyncAuthority/);
  assert.match(source,/OfflineSyncDeleteAuthority/);
});

test('AppState carrega graduação depois das duas autoridades e expõe diagnóstico',()=>{
  const upsertIndex=appStateSource.indexOf('offline-sync-authority.js?v=10.40.0');
  const deleteIndex=appStateSource.indexOf('offline-sync-delete-authority.js?v=10.40.0');
  const graduationIndex=appStateSource.indexOf('offline-sync-edital-graduation.js?v=10.40.0');
  assert.ok(upsertIndex>=0);
  assert.ok(deleteIndex>upsertIndex);
  assert.ok(graduationIndex>deleteIndex);
  assert.match(appStateSource,/getOfflineSyncEditalGraduationDiagnostics/);
});

test('coordenador integra o núcleo offline e contratos de cache',()=>{
  const asset='/js/core/offline-sync-edital-graduation.js';
  assert.ok(manifest.criticalAppShell.includes(asset));
  assert.ok(manifest.networkFirstPaths.includes(asset));
  assert.ok(manifest.workerNoStorePaths.includes(asset));
  assert.ok(manifest.headersNoStorePaths.includes(asset));
});

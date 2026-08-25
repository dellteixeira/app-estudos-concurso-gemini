'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/core/offline-sync-metadata-rollout.js','utf8');
const appStateSource=fs.readFileSync('public/js/app-state.js','utf8');
const manifest=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));
const swSource=fs.readFileSync('public/sw.js','utf8');
const workerSource=fs.readFileSync('src/worker.js','utf8');
const headersSource=fs.readFileSync('public/_headers','utf8');

function makeStorage(){
  const map=new Map();
  return { getItem:key=>map.has(String(key))?map.get(String(key)):null, setItem:(key,value)=>map.set(String(key),String(value)), removeItem:key=>map.delete(String(key)) };
}

function makeGraduation(options={}){
  let optedIn=false;
  let hardKill=false;
  let enableCalls=0;
  let disableCalls=0;
  return {
    getEligibility:()=>({eligible:options.eligible!==false,reasons:options.eligible===false?['blocked']:[]}),
    isHardKilled:()=>hardKill,
    isEnabled:()=>optedIn&&!hardKill&&options.eligible!==false,
    isOptedIn:()=>optedIn,
    setEnabled:value=>{
      if(value){ enableCalls+=1; if(options.enableFails||options.eligible===false||hardKill) return false; optedIn=true; return true; }
      disableCalls+=1; optedIn=false; return true;
    },
    setKillSwitch:value=>{ hardKill=Boolean(value); if(hardKill) optedIn=false; return hardKill; },
    getDiagnostics:()=>({mode:'metadata-authority-graduation-v1',remoteAuthority:false}),
    _stats:()=>({optedIn,hardKill,enableCalls,disableCalls})
  };
}

function makeContext(options={}){
  const listeners=new Map();
  const events=[];
  const graduation=makeGraduation(options.graduation||{});
  const context={
    console,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,Math,
    localStorage:makeStorage(),
    currentUser:{id:options.userId||'rollout-user'},
    OfflineSyncMetadataGraduation:graduation,
    CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},
    addEventListener:(type,fn)=>{const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},
    dispatchEvent:event=>{events.push(event);for(const fn of listeners.get(event.type)||[]) fn(event);return true;}
  };
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'offline-sync-metadata-rollout.js'});
  context.OfflineSyncMetadataRollout.install();
  return {context,graduation,events};
}

function findUser(included){
  const env=makeContext();
  const rollout=env.context.OfflineSyncMetadataRollout;
  for(let i=0;i<10000;i+=1){
    const id=`rollout-user-${i}`;
    if(rollout.getCohortAssignment(id).included===included) return id;
  }
  throw new Error('cohort user not found');
}

test('coorte é determinística e limitada inicialmente a 10%',()=>{
  const env=makeContext();
  const rollout=env.context.OfflineSyncMetadataRollout;
  const first=rollout.getCohortAssignment('stable-user');
  const second=rollout.getCohortAssignment('stable-user');
  assert.deepEqual({...first},{...second});
  assert.equal(first.percent,10);
  assert.equal(first.bucket>=0&&first.bucket<100,true);
});

test('usuário fora da coorte não pode ativar graduação',()=>{
  const userId=findUser(false);
  const env=makeContext({userId});
  const rollout=env.context.OfflineSyncMetadataRollout;
  assert.equal(rollout.getEligibility().eligible,false);
  assert.deepEqual([...rollout.getEligibility().reasons],['outside-rollout-cohort']);
  assert.equal(rollout.setEnabled(true),false);
  assert.equal(env.graduation._stats().enableCalls,0);
  assert.equal(rollout.getDiagnostics().state.stopReason,'ineligible');
});

test('usuário da coorte ainda depende da elegibilidade da graduação 4F',()=>{
  const userId=findUser(true);
  const env=makeContext({userId,graduation:{eligible:false}});
  const rollout=env.context.OfflineSyncMetadataRollout;
  assert.equal(rollout.getCohortAssignment().included,true);
  assert.equal(rollout.getEligibility().eligible,false);
  assert.deepEqual([...rollout.getEligibility().reasons],['metadata-graduation-not-eligible']);
  assert.equal(rollout.setEnabled(true),false);
});

test('ativação elegível delega somente à graduação 4F',()=>{
  const userId=findUser(true);
  const env=makeContext({userId});
  const rollout=env.context.OfflineSyncMetadataRollout;
  assert.equal(rollout.setEnabled(true),true);
  assert.equal(rollout.isEnabled(),true);
  assert.equal(env.graduation._stats().enableCalls,1);
  assert.deepEqual([...rollout.getDiagnostics().scope],['user_settings:concursos_metadata:upsert']);
  assert.equal(rollout.getDiagnostics().remoteAuthority,false);
});

test('falha de ativação da graduação faz rollback local',()=>{
  const userId=findUser(true);
  const env=makeContext({userId,graduation:{enableFails:true}});
  const rollout=env.context.OfflineSyncMetadataRollout;
  assert.equal(rollout.setEnabled(true),false);
  assert.equal(rollout.isOptedIn(),false);
  assert.equal(env.graduation._stats().optedIn,false);
  assert.equal(rollout.getDiagnostics().state.stopReason,'graduation-enable-failed');
});

test('encerramento da graduação encerra rollout',()=>{
  const userId=findUser(true);
  const env=makeContext({userId});
  const rollout=env.context.OfflineSyncMetadataRollout;
  assert.equal(rollout.setEnabled(true),true);
  env.context.dispatchEvent(new env.context.CustomEvent('offline-sync-metadata-graduation:stopped',{detail:{stopReason:'budget-exhausted'}}));
  assert.equal(rollout.isOptedIn(),false);
  assert.equal(env.graduation._stats().optedIn,false);
  assert.equal(rollout.getDiagnostics().state.stopReason,'metadata-graduation-stopped');
});

test('kill switch compartilhado encerra rollout e graduação',()=>{
  const userId=findUser(true);
  const env=makeContext({userId});
  const rollout=env.context.OfflineSyncMetadataRollout;
  assert.equal(rollout.setEnabled(true),true);
  assert.equal(rollout.setKillSwitch(true),true);
  assert.equal(rollout.isEnabled(),false);
  assert.equal(rollout.isOptedIn(),false);
  assert.equal(env.graduation._stats().hardKill,true);
});

test('rollout não possui caminho remoto próprio',()=>{
  assert.doesNotMatch(source,/\.from\s*\(/);
  assert.doesNotMatch(source,/\.upsert\s*\(/);
  assert.doesNotMatch(source,/\.delete\s*\(/);
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.match(source,/OfflineSyncMetadataGraduation/);
  assert.match(source,/remoteAuthority:false/);
});

test('AppState carrega rollout depois da graduação e antes das autoridades do edital',()=>{
  const graduationIndex=appStateSource.indexOf('offline-sync-metadata-graduation.js?v=10.39.0');
  const rolloutIndex=appStateSource.indexOf('offline-sync-metadata-rollout.js?v=10.39.0');
  const editalAuthorityIndex=appStateSource.indexOf('offline-sync-authority.js?v=10.39.0');
  assert.ok(graduationIndex>=0);
  assert.ok(rolloutIndex>graduationIndex);
  assert.ok(editalAuthorityIndex>rolloutIndex);
  assert.match(appStateSource,/metadataRollout:global\.OfflineSyncMetadataRollout/);
  assert.match(appStateSource,/getOfflineSyncMetadataRolloutDiagnostics/);
});

test('rollout integra contratos PWA e no-store',()=>{
  const asset='/js/core/offline-sync-metadata-rollout.js';
  assert.ok(manifest.criticalAppShell.includes(asset));
  assert.ok(manifest.networkFirstPaths.includes(asset));
  assert.ok(manifest.workerNoStorePaths.includes(asset));
  assert.ok(manifest.headersNoStorePaths.includes(asset));
  assert.match(swSource,/offline-sync-metadata-rollout\.js/);
  assert.match(workerSource,/offline-sync-metadata-rollout\.js/);
  assert.match(headersSource,/\/js\/core\/offline-sync-metadata-rollout\.js/);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/core/offline-sync-metadata-authority.js','utf8');
const appStateSource=fs.readFileSync('public/js/app-state.js','utf8');
const manifest=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));
const sw=fs.readFileSync('public/sw.js','utf8');
const worker=fs.readFileSync('src/worker.js','utf8');
const headers=fs.readFileSync('public/_headers','utf8');

function makeStorage(){
  const map=new Map();
  return {
    getItem:key=>map.has(String(key))?map.get(String(key)):null,
    setItem:(key,value)=>map.set(String(key),String(value)),
    removeItem:key=>map.delete(String(key))
  };
}
function clone(value){return JSON.parse(JSON.stringify(value));}
function fingerprint(value){
  const stable=input=>Array.isArray(input)?input.map(stable):(input&&typeof input==='object'?Object.keys(input).sort().reduce((o,k)=>(o[k]=stable(input[k]),o),{}):input);
  const text=JSON.stringify(stable(value));
  let hash=2166136261;
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(16).padStart(8,'0');
}

function makeContext(options={}){
  let metadata=clone(options.metadata||{Concurso:{banca:'FCC',studySessions:[{id:'local'}]}});
  let state={metadataDirty:true,metadataRevision:8};
  let legacyCalls=0;
  let scheduleCalls=0;
  const requests=[];
  const statuses=[];
  const remote=clone(options.remote||{Concurso:{studySessions:[{id:'remote'}]}});
  let readError=options.readError||null;
  let writeError=options.writeError||null;
  let mutateDuringWrite=Boolean(options.mutateDuringWrite);

  const builder={
    select(columns){requests.push(['select',columns]);return this;},
    eq(column,value){requests.push(['eq',column,value]);return this;},
    async maybeSingle(){requests.push(['maybeSingle']);return readError?{error:readError}:{data:{setting_value:clone(remote)},error:null};},
    async upsert(payload,config){
      requests.push(['upsert',clone(payload),clone(config)]);
      if(mutateDuringWrite){
        state.metadataDirty=true;
        state.metadataRevision+=1;
        metadata={...metadata,Concurso:{...metadata.Concurso,banca:'CEBRASPE'}};
      }
      return writeError?{error:writeError}:{data:null,error:null};
    }
  };

  const context={
    console,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,Math,Promise,
    localStorage:makeStorage(),navigator:{onLine:true},currentUser:{id:'user-metadata-authority'},
    getSyncState:()=>clone(state),
    saveSyncState:next=>{state=clone(next);},
    getConcursosMetadata:()=>clone(metadata),
    getConcursosMetadataStorageKey:()=> 'concursos_metadata_user-metadata-authority',
    mergeConcursosMetadataPreservingHistory:(localSnapshot,remoteSnapshot)=>{
      const result=clone(localSnapshot);
      const localSessions=localSnapshot?.Concurso?.studySessions||[];
      const remoteSessions=remoteSnapshot?.Concurso?.studySessions||[];
      result.Concurso={...(remoteSnapshot.Concurso||{}),...(result.Concurso||{}),studySessions:[...remoteSessions,...localSessions]};
      return result;
    },
    scheduleMetadataSync:()=>{scheduleCalls+=1;},
    flushPendingMetadata:async()=>{legacyCalls+=1;return {legacy:true};},
    runSupabaseRequest:async factory=>factory(),
    supabaseClient:{from:table=>{requests.push(['from',table]);return builder;}},
    OfflineOutboxStore:{
      updateStatus:async(userId,key,status,patch)=>{statuses.push({userId,key,status,patch});return {idempotencyKey:key,status,...patch};}
    },
    OfflineSyncMetadataShadow:{
      getParityReport:()=>({sampleCount:8,healthySamples:8,unhealthySamples:0,healthy:true}),
      fingerprint,
      mirrorDirtyMetadata:async()=>({
        userId:'user-metadata-authority',entity:'concursos-metadata',entityId:'concursos_metadata',action:'upsert',status:'shadow',attempts:0,
        idempotencyKey:`user-metadata-authority:concursos-metadata:concursos_metadata:upsert:r${state.metadataRevision}:${fingerprint(metadata)}`,
        payload:{metadataRevision:state.metadataRevision,payloadFingerprint:fingerprint(metadata),snapshot:clone(metadata)}
      })
    },
    CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},dispatchEvent:()=>true
  };
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'offline-sync-metadata-authority.js'});
  return {
    context,requests,statuses,
    getState:()=>clone(state),getMetadata:()=>clone(metadata),
    getLegacyCalls:()=>legacyCalls,getScheduleCalls:()=>scheduleCalls,
    setState:value=>{state={...state,...clone(value)};},
    setReadError:value=>{readError=value;},setWriteError:value=>{writeError=value;},
    setMutateDuringWrite:value=>{mutateDuringWrite=Boolean(value);}
  };
}

function enableWithHealthyParity(env){
  assert.equal(env.context.OfflineSyncMetadataAuthority.setEnabled(true),true);
  assert.equal(env.context.OfflineSyncMetadataAuthority.isEnabled(),true);
}

test('autoridade de metadata nasce opt-in e exige 8 amostras shadow saudáveis',()=>{
  const env=makeContext();
  const authority=env.context.OfflineSyncMetadataAuthority;
  assert.equal(authority.isOptedIn(),false);
  assert.equal(authority.isEnabled(),false);
  assert.equal(authority.getEligibility().eligible,true);
  env.context.OfflineSyncMetadataShadow.getParityReport=()=>({sampleCount:7,healthySamples:7,unhealthySamples:0});
  assert.equal(authority.setEnabled(true),false);
  assert.equal(authority.getEligibility().eligible,false);
});

test('canário lê remoto, preserva histórico e grava somente concursos_metadata',async()=>{
  const env=makeContext();
  enableWithHealthyParity(env);
  const result=await env.context.flushPendingMetadata();
  assert.equal(result.handled,true);
  assert.equal(result.revision,8);
  assert.equal(env.getLegacyCalls(),0);
  assert.equal(env.getState().metadataDirty,false);

  const fromCalls=env.requests.filter(entry=>entry[0]==='from');
  assert.deepEqual(fromCalls,[['from','user_settings'],['from','user_settings']]);
  const eqCalls=env.requests.filter(entry=>entry[0]==='eq');
  assert.deepEqual(eqCalls,[['eq','user_id','user-metadata-authority'],['eq','setting_key','concursos_metadata']]);
  const upsert=env.requests.find(entry=>entry[0]==='upsert');
  assert.ok(upsert);
  assert.equal(upsert[1].user_id,'user-metadata-authority');
  assert.equal(upsert[1].setting_key,'concursos_metadata');
  assert.equal(upsert[2].onConflict,'user_id,setting_key');
  assert.deepEqual(upsert[1].setting_value.Concurso.studySessions,[{id:'remote'},{id:'local'}]);
  assert.equal(env.statuses.at(-1).status,'synced');
  assert.equal(env.context.OfflineSyncMetadataAuthority.getBudget().remoteWrites,1);
  assert.equal(env.context.OfflineSyncMetadataAuthority.isOptedIn(),false,'budget de um write encerra o canário');
});

test('falha na leitura remota abre circuito e entrega pendência intacta ao legado',async()=>{
  const env=makeContext({readError:new Error('remote read failed')});
  enableWithHealthyParity(env);
  const result=await env.context.flushPendingMetadata();
  assert.equal(result.legacy,true);
  assert.equal(env.getLegacyCalls(),1);
  assert.equal(env.getState().metadataDirty,true);
  assert.match(env.context.OfflineSyncMetadataAuthority.getCircuit().error,/remote read failed/);
  assert.equal(env.context.OfflineSyncMetadataAuthority.isOptedIn(),false);
  assert.ok(env.statuses.some(entry=>entry.status==='failed'));
});

test('falha no upsert abre circuito e legado reassume sem apagar metadataDirty',async()=>{
  const env=makeContext({writeError:new Error('remote write failed')});
  enableWithHealthyParity(env);
  const result=await env.context.flushPendingMetadata();
  assert.equal(result.legacy,true);
  assert.equal(env.getLegacyCalls(),1);
  assert.equal(env.getState().metadataDirty,true);
  assert.match(env.context.OfflineSyncMetadataAuthority.getCircuit().error,/remote write failed/);
  assert.ok(env.statuses.some(entry=>entry.status==='sending'));
  assert.ok(env.statuses.some(entry=>entry.status==='failed'));
});

test('revisão concorrente nunca é limpa pela confirmação de uma versão anterior',async()=>{
  const env=makeContext({mutateDuringWrite:true});
  enableWithHealthyParity(env);
  const result=await env.context.flushPendingMetadata();
  assert.equal(result.handled,true);
  assert.equal(result.concurrentRevision,true);
  assert.equal(env.getState().metadataRevision,9);
  assert.equal(env.getState().metadataDirty,true);
  assert.equal(env.getScheduleCalls(),1);
  assert.equal(env.getLegacyCalls(),0);
});

test('kill switch compartilhado impede autoridade e mantém caminho legado',async()=>{
  const env=makeContext();
  enableWithHealthyParity(env);
  assert.equal(env.context.OfflineSyncMetadataAuthority.setKillSwitch(true),true);
  assert.equal(env.context.OfflineSyncMetadataAuthority.isEnabled(),false);
  const result=await env.context.flushPendingMetadata();
  assert.equal(result.legacy,true);
  assert.equal(env.getLegacyCalls(),1);
  assert.equal(env.requests.length,0);
});

test('orçamento é estritamente um write remoto por sessão canário',async()=>{
  const env=makeContext();
  enableWithHealthyParity(env);
  await env.context.flushPendingMetadata();
  const budget=env.context.OfflineSyncMetadataAuthority.getBudget();
  assert.equal(budget.maxRemoteWrites,1);
  assert.equal(budget.remoteWrites,1);
  assert.equal(budget.exhausted,true);
  env.setState({metadataDirty:true,metadataRevision:9});
  const second=await env.context.flushPendingMetadata();
  assert.equal(second.legacy,true);
  assert.equal(env.getLegacyCalls(),1);
  assert.equal(env.requests.filter(entry=>entry[0]==='upsert').length,1);
});

test('módulo remoto é limitado a user_settings concursos_metadata e não toca outros domínios',()=>{
  assert.match(source,/\.from\('user_settings'\)/);
  assert.match(source,/setting_key:ENTITY_ID/);
  assert.match(source,/onConflict:'user_id,setting_key'/);
  assert.doesNotMatch(source,/\.from\('edital'\)/);
  assert.doesNotMatch(source,/\.from\('flashcards'\)/);
  assert.doesNotMatch(source,/concursoDeletes/);
  assert.doesNotMatch(source,/flashcardDeletes/);
  assert.match(source,/mergeConcursosMetadataPreservingHistory/);
  assert.match(source,/metadataRevision/);
});

test('AppState carrega metadata authority entre shadow e autoridades do edital',()=>{
  const shadowIndex=appStateSource.indexOf('offline-sync-metadata-shadow.js?v=10.54.0');
  const metadataAuthorityIndex=appStateSource.indexOf('offline-sync-metadata-authority.js?v=10.54.0');
  const editalAuthorityIndex=appStateSource.indexOf('offline-sync-authority.js?v=10.54.0');
  assert.ok(shadowIndex>=0);
  assert.ok(metadataAuthorityIndex>shadowIndex);
  assert.ok(editalAuthorityIndex>metadataAuthorityIndex);
  assert.match(appStateSource,/getOfflineSyncMetadataAuthorityDiagnostics/);
});

test('metadata authority integra app shell, network-first e no-store',()=>{
  const asset='/js/core/offline-sync-metadata-authority.js';
  assert.ok(manifest.criticalAppShell.includes(asset));
  assert.ok(manifest.networkFirstPaths.includes(asset));
  assert.ok(manifest.workerNoStorePaths.includes(asset));
  assert.ok(manifest.headersNoStorePaths.includes(asset));
  assert.match(sw,/offline-sync-metadata-authority\.js/);
  assert.match(worker,/offline-sync-metadata-authority\.js/);
  assert.match(headers,/\/js\/core\/offline-sync-metadata-authority\.js\n\s+Cache-Control: no-cache, no-store, must-revalidate/);
});

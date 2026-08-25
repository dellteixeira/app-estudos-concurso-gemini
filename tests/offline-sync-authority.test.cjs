'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const outboxSource=fs.readFileSync('public/js/core/offline-outbox-store.js','utf8');
const shadowSource=fs.readFileSync('public/js/core/offline-sync-shadow.js','utf8');
const authoritySource=fs.readFileSync('public/js/core/offline-sync-authority.js','utf8');
const appStateSource=fs.readFileSync('public/js/app-state.js','utf8');
const swSource=fs.readFileSync('public/sw.js','utf8');
const manifestSource=fs.readFileSync('config/app-assets.json','utf8');

function makeStorage(){
  const map=new Map();
  return {
    getItem:key=>map.has(String(key))?map.get(String(key)):null,
    setItem:(key,value)=>map.set(String(key),String(value)),
    removeItem:key=>map.delete(String(key)),
    key:index=>[...map.keys()][index]??null,
    get length(){return map.size;}
  };
}
function clone(value){return JSON.parse(JSON.stringify(value));}

function makeContext(options={}){
  let syncState={metadataDirty:false,flashcardsDirty:{},editalUpserts:{},editalDeletes:[],flashcardDeletes:[],concursoDeletes:[]};
  let legacySyncCalls=0;
  let authorityRemoteCalls=0;
  const legacySnapshots=[];
  const remotePayloads=[];
  const events=[];
  const localStorage=makeStorage();
  const context={
    console,setTimeout,clearTimeout,Promise,Date,Math,JSON,Object,Array,String,Number,Boolean,Set,Map,
    localStorage,indexedDB:undefined,navigator:{onLine:true},
    crypto:{randomUUID:()=>`device-${Math.random().toString(36).slice(2)}`},
    CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},
    dispatchEvent:event=>{events.push(event);return true;},addEventListener:()=>{},
    currentUser:{id:'user-authority-test'},currentConcurso:'Concurso Geral',
    getContentMethod:item=>item.metodo_conteudo||'automatico',
    getSyncState:()=>clone(syncState),saveSyncState:state=>{syncState=clone(state);},
    queueEditalUpsert:item=>{
      const id=String(item.id);
      syncState.editalUpserts[id]={...item,id};
      syncState.editalDeletes=syncState.editalDeletes.filter(value=>String(value)!==id);
    },
    syncAllWithSupabase:async()=>{
      legacySyncCalls+=1;
      legacySnapshots.push(clone(syncState));
      if(options.legacyClears!==false) syncState.editalUpserts={};
      return {legacy:true};
    },
    runSupabaseRequest:factory=>factory(),
    supabaseClient:{from:table=>({upsert:async(payload,config)=>{
      authorityRemoteCalls+=1;
      remotePayloads.push({table,payload:clone(payload),config:clone(config)});
      if(typeof options.onRemote==='function') await options.onRemote({payload,syncState,setSyncState:value=>{syncState=clone(value);}});
      if(options.remoteError) return {error:new Error(options.remoteError)};
      return {error:null,data:payload};
    }})}
  };
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(outboxSource,context,{filename:'offline-outbox-store.js'});
  vm.runInContext(shadowSource,context,{filename:'offline-sync-shadow.js'});
  vm.runInContext(authoritySource,context,{filename:'offline-sync-authority.js'});
  return {
    context,events,getState:()=>clone(syncState),setState:value=>{syncState=clone(value);},
    getLegacySyncCalls:()=>legacySyncCalls,getAuthorityRemoteCalls:()=>authorityRemoteCalls,
    getLegacySnapshots:()=>clone(legacySnapshots),getRemotePayloads:()=>clone(remotePayloads)
  };
}

function baseTopic(overrides={}){
  return {id:'topic-1',materia:'Direito',assunto:'Constitucional',prioridade:2,assunto_prioridade:3,
    concurso:'Concurso Geral',teoria:true,questoes:false,videoaula:false,metodo_conteudo:'automatico',
    rev_24h:false,rev_7d:true,rev_30d:false,...overrides};
}
function tick(ms=10){return new Promise(resolve=>setTimeout(resolve,ms));}
async function waitForShadowUpsert(env,id='topic-1'){
  for(let attempt=0;attempt<30;attempt++){
    const rows=await env.context.OfflineOutboxStore.list('user-authority-test',{limit:100});
    const row=rows.find(operation=>operation.entity==='edital-topic'&&operation.action==='upsert'&&String(operation.entityId)===String(id));
    if(row) return row;
    await tick();
  }
  assert.fail(`shadow upsert ${id} não ficou pronto dentro do timeout do teste`);
}
async function qualifyCanary(env){
  env.context.queueEditalUpsert(baseTopic());
  const shadow=await waitForShadowUpsert(env);
  assert.equal(shadow.status,'shadow');
  for(let i=0;i<8;i++) await env.context.OfflineSyncShadow.recordParitySnapshot(`qualify-${i}`);
  assert.equal(env.context.OfflineSyncAuthority.getEligibility().eligible,true);
}

test('autoridade nasce opt-in e bloqueia ativação sem histórico de paridade suficiente',async()=>{
  const env=makeContext();
  env.context.queueEditalUpsert(baseTopic());
  await waitForShadowUpsert(env);
  assert.equal(env.context.OfflineSyncAuthority.getEligibility().eligible,false);
  assert.equal(env.context.OfflineSyncAuthority.setEnabled(true),false);
  assert.equal(env.context.OfflineSyncAuthority.isEnabled(),false);
  await env.context.syncAllWithSupabase();
  assert.equal(env.getLegacySyncCalls(),1);
  assert.equal(env.getAuthorityRemoteCalls(),0);
});

test('canário habilita somente após 8 amostras saudáveis e envia apenas edital upsert',async()=>{
  const env=makeContext({legacyClears:false});
  env.setState({metadataDirty:true,flashcardsDirty:{'Concurso Geral':true},editalUpserts:{},editalDeletes:['delete-1'],flashcardDeletes:[],concursoDeletes:[]});
  await qualifyCanary(env);
  assert.equal(env.context.OfflineSyncAuthority.setEnabled(true),true);
  await env.context.syncAllWithSupabase();

  assert.equal(env.getAuthorityRemoteCalls(),1);
  assert.equal(env.getLegacySyncCalls(),1);
  const payload=env.getRemotePayloads()[0];
  assert.equal(payload.table,'edital');
  assert.deepEqual(payload.config,{onConflict:'id'});
  assert.deepEqual(payload.payload[0],{
    id:'topic-1',user_id:'user-authority-test',materia:'Direito',assunto:'Constitucional',prioridade:2,
    assunto_prioridade:3,concurso:'Concurso Geral',teoria:true,questoes:false,videoaula:false,
    metodo_conteudo:'automatico',rev_24h:false,rev_7d:true,rev_30d:false
  });
  const legacySnapshot=env.getLegacySnapshots()[0];
  assert.deepEqual(legacySnapshot.editalUpserts,{});
  assert.deepEqual(legacySnapshot.editalDeletes,['delete-1']);
  assert.equal(legacySnapshot.metadataDirty,true);
  assert.equal(legacySnapshot.flashcardsDirty['Concurso Geral'],true);
  const diag=env.context.OfflineSyncAuthority.getDiagnostics();
  assert.equal(diag.enabled,true);
  assert.equal(diag.budget.batches,1);
  assert.equal(diag.budget.items,1);
});

test('falha remota abre circuito, desliga opt-in e entrega pendência intacta ao legado',async()=>{
  const env=makeContext({remoteError:'falha canário'});
  await qualifyCanary(env);
  assert.equal(env.context.OfflineSyncAuthority.setEnabled(true),true);
  await env.context.syncAllWithSupabase();
  assert.equal(env.getAuthorityRemoteCalls(),1);
  assert.equal(env.getLegacySyncCalls(),1);
  assert.equal(Object.keys(env.getLegacySnapshots()[0].editalUpserts).length,1);
  assert.equal(env.context.OfflineSyncAuthority.isEnabled(),false);
  assert.equal(env.context.OfflineSyncAuthority.isOptedIn(),false);
  assert.match(env.context.OfflineSyncAuthority.getCircuit().error,/falha canário/);
  assert.ok(env.events.some(event=>event.type==='offline-sync-authority:fallback'));
});

test('kill switch força caminho legado e encerra sessão canário',async()=>{
  const env=makeContext();
  await qualifyCanary(env);
  assert.equal(env.context.OfflineSyncAuthority.setEnabled(true),true);
  env.context.OfflineSyncAuthority.setKillSwitch(true);
  assert.equal(env.context.OfflineSyncAuthority.isHardKilled(),true);
  assert.equal(env.context.OfflineSyncAuthority.isEnabled(),false);
  assert.equal(env.context.OfflineSyncAuthority.getCanarySession().stopReason,'kill-switch');
  await env.context.syncAllWithSupabase();
  assert.equal(env.getAuthorityRemoteCalls(),0);
  assert.equal(env.getLegacySyncCalls(),1);
});

test('mudança concorrente durante envio não é apagada pela confirmação da versão antiga',async()=>{
  const env=makeContext({legacyClears:false,onRemote:async({syncState,setSyncState})=>{
    const next=clone(syncState);next.editalUpserts['topic-1']={...next.editalUpserts['topic-1'],questoes:true};setSyncState(next);
  }});
  await qualifyCanary(env);
  assert.equal(env.context.OfflineSyncAuthority.setEnabled(true),true);
  await env.context.syncAllWithSupabase();
  assert.equal(env.getAuthorityRemoteCalls(),1);
  assert.equal(env.getLegacySnapshots()[0].editalUpserts['topic-1'].questoes,true);
});

test('operação synced é reaproveitada idempotentemente sem segundo write remoto',async()=>{
  const env=makeContext({legacyClears:false});
  await qualifyCanary(env);
  assert.equal(env.context.OfflineSyncAuthority.setEnabled(true),true);
  await env.context.OfflineSyncAuthority.flushAuthorizedEditalUpserts();
  assert.equal(env.getAuthorityRemoteCalls(),1);
  env.context.queueEditalUpsert(baseTopic());
  await waitForShadowUpsert(env);
  await env.context.OfflineSyncAuthority.flushAuthorizedEditalUpserts();
  assert.equal(env.getAuthorityRemoteCalls(),1);
  assert.deepEqual(env.getState().editalUpserts,{});
});

test('orçamento limita canário a 3 batches ou 50 itens e desliga automaticamente',async()=>{
  const env=makeContext({legacyClears:false});
  await qualifyCanary(env);
  assert.equal(env.context.OfflineSyncAuthority.setEnabled(true),true);
  for(let batch=0;batch<3;batch++){
    const items={};
    for(let i=0;i<25;i++){
      const n=batch*25+i;
      items[`topic-${n}`]=baseTopic({id:`topic-${n}`,assunto:`Assunto ${n}`});
    }
    env.setState({metadataDirty:false,flashcardsDirty:{},editalUpserts:items,editalDeletes:[],flashcardDeletes:[],concursoDeletes:[]});
    await env.context.OfflineSyncAuthority.flushAuthorizedEditalUpserts();
    if(!env.context.OfflineSyncAuthority.isEnabled()) break;
  }
  const budget=env.context.OfflineSyncAuthority.getBudget();
  assert.equal(budget.exhausted,true);
  assert.equal(budget.items,50,'limite de itens encerra antes de exceder o orçamento');
  assert.equal(env.context.OfflineSyncAuthority.isOptedIn(),false);
  assert.equal(env.context.OfflineSyncAuthority.getCanarySession().stopReason,'budget-exhausted');
  assert.ok(env.events.some(event=>event.type==='offline-sync-authority:canary-stopped'));
});

test('AppState carrega autoridade depois de outbox e shadow na release v10.39.0',()=>{
  assert.match(appStateSource,/offline-outbox-store\.js\?v=10\.39\.0/);
  assert.match(appStateSource,/offline-sync-shadow\.js\?v=10\.39\.0/);
  assert.match(appStateSource,/offline-sync-authority\.js\?v=10\.39\.0/);
  assert.ok(appStateSource.indexOf('offline-sync-authority.js')>appStateSource.indexOf('offline-sync-shadow.js'));
});

test('guardrails são locais, bounded e o escopo remoto continua estritamente edital upsert',()=>{
  assert.match(swSource,/\.\/js\/core\/offline-sync-authority\.js/);
  assert.match(manifestSource,/"\/js\/core\/offline-sync-authority\.js"/);
  assert.match(authoritySource,/ELIGIBILITY_MIN_SAMPLES = 8/);
  assert.match(authoritySource,/MAX_CANARY_BATCHES = 3/);
  assert.match(authoritySource,/MAX_CANARY_ITEMS = 50/);
  assert.match(authoritySource,/scope:Object\.freeze\(\['edital-topic:upsert'\]\)/);
  assert.match(authoritySource,/from\('edital'\)\.upsert/);
  assert.doesNotMatch(authoritySource,/\.delete\s*\(/);
  assert.doesNotMatch(authoritySource,/\.insert\s*\(/);
  assert.doesNotMatch(authoritySource,/\bfetch\s*\(/);
  assert.match(authoritySource,/legacySyncAllWithSupabase\.apply/);
  assert.match(authoritySource,/tripCircuit/);
  assert.match(authoritySource,/KILL_SWITCH_KEY/);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const outboxSource=fs.readFileSync('public/js/core/offline-outbox-store.js','utf8');
const shadowSource=fs.readFileSync('public/js/core/offline-sync-shadow.js','utf8');
const deleteAuthoritySource=fs.readFileSync('public/js/core/offline-sync-delete-authority.js','utf8');

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
function tick(ms=10){return new Promise(resolve=>setTimeout(resolve,ms));}

function makeContext(options={}){
  let syncState={metadataDirty:false,flashcardsDirty:{},editalUpserts:{},editalDeletes:[],flashcardDeletes:[],concursoDeletes:[]};
  let legacySyncCalls=0;
  let deleteRemoteCalls=0;
  const deleteRemotePayloads=[];
  const legacySnapshots=[];
  const events=[];
  const localStorage=makeStorage();

  const context={
    console,setTimeout,clearTimeout,Promise,Date,Math,JSON,Object,Array,String,Number,Boolean,Set,Map,
    localStorage,indexedDB:undefined,navigator:{onLine:true},
    crypto:{randomUUID:()=>`device-${Math.random().toString(36).slice(2)}`},
    CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},
    dispatchEvent:event=>{events.push(event);return true;},addEventListener:()=>{},
    currentUser:{id:'user-delete-authority'},
    getSyncState:()=>clone(syncState),
    saveSyncState:state=>{syncState=clone(state);},
    queueEditalUpsert:item=>{
      const id=String(item.id);
      syncState.editalUpserts[id]={...item,id};
      syncState.editalDeletes=syncState.editalDeletes.filter(value=>String(value)!==id);
    },
    queueEditalDelete:id=>{
      const key=String(id);
      delete syncState.editalUpserts[key];
      if(!syncState.editalDeletes.some(value=>String(value)===key)) syncState.editalDeletes.push(key);
    },
    syncAllWithSupabase:async()=>{
      legacySyncCalls+=1;
      legacySnapshots.push(clone(syncState));
      if(options.legacyClears!==false) syncState.editalDeletes=[];
      return {legacy:true};
    },
    runSupabaseRequest:factory=>factory(),
    supabaseClient:{
      from:table=>({
        delete:()=>({
          in:(column,ids)=>({
            eq:async(eqColumn,userId)=>{
              deleteRemoteCalls+=1;
              deleteRemotePayloads.push({table,column,ids:[...ids],eqColumn,userId});
              if(typeof options.onRemote==='function') await options.onRemote({ids:[...ids],syncState,setSyncState:value=>{syncState=clone(value);}});
              if(options.remoteError) return {error:new Error(options.remoteError)};
              return {error:null};
            }
          })
        })
      })
    }
  };
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(outboxSource,context,{filename:'offline-outbox-store.js'});
  vm.runInContext(shadowSource,context,{filename:'offline-sync-shadow.js'});
  vm.runInContext(deleteAuthoritySource,context,{filename:'offline-sync-delete-authority.js'});
  return {
    context,events,
    getState:()=>clone(syncState),setState:value=>{syncState=clone(value);},
    getLegacySyncCalls:()=>legacySyncCalls,
    getDeleteRemoteCalls:()=>deleteRemoteCalls,
    getDeleteRemotePayloads:()=>clone(deleteRemotePayloads),
    getLegacySnapshots:()=>clone(legacySnapshots)
  };
}

async function waitForDeleteShadow(env,id='topic-delete-1'){
  for(let attempt=0;attempt<30;attempt++){
    const rows=await env.context.OfflineOutboxStore.list('user-delete-authority',{limit:100});
    const row=rows.find(operation=>operation.entity==='edital-topic'&&operation.action==='delete'&&String(operation.entityId)===String(id));
    if(row) return row;
    await tick();
  }
  assert.fail(`shadow delete ${id} não ficou pronto dentro do timeout do teste`);
}

async function qualifyDeleteCanary(env,id='topic-delete-1'){
  env.context.queueEditalDelete(id);
  const shadow=await waitForDeleteShadow(env,id);
  assert.equal(shadow.status,'shadow');
  for(let i=0;i<8;i++) await env.context.OfflineSyncShadow.recordDeleteParitySnapshot(`qualify-delete-${i}`);
  assert.equal(env.context.OfflineSyncDeleteAuthority.getEligibility().eligible,true);
}

test('delete authority nasce desligada e exige 8 amostras próprias de paridade',async()=>{
  const env=makeContext();
  env.context.queueEditalDelete('topic-delete-1');
  await waitForDeleteShadow(env);
  assert.equal(env.context.OfflineSyncDeleteAuthority.getEligibility().eligible,false);
  assert.equal(env.context.OfflineSyncDeleteAuthority.setEnabled(true),false);
  await env.context.syncAllWithSupabase();
  assert.equal(env.getDeleteRemoteCalls(),0);
  assert.equal(env.getLegacySyncCalls(),1);
});

test('canário de delete usa filtro id + user_id e remove somente deletes confirmados antes do legado',async()=>{
  const env=makeContext({legacyClears:false});
  await qualifyDeleteCanary(env);
  assert.equal(env.context.OfflineSyncDeleteAuthority.setEnabled(true),true);
  await env.context.syncAllWithSupabase();

  assert.equal(env.getDeleteRemoteCalls(),1);
  assert.deepEqual(env.getDeleteRemotePayloads()[0],{
    table:'edital',column:'id',ids:['topic-delete-1'],eqColumn:'user_id',userId:'user-delete-authority'
  });
  assert.equal(env.getLegacySyncCalls(),1);
  assert.deepEqual(env.getLegacySnapshots()[0].editalDeletes,[]);
  const diag=env.context.OfflineSyncDeleteAuthority.getDiagnostics();
  assert.deepEqual([...diag.scope],['edital-topic:delete']);
  assert.equal(diag.budget.batches,1);
  assert.equal(diag.budget.items,1);
});

test('falha remota abre circuito e entrega delete intacto ao legado',async()=>{
  const env=makeContext({remoteError:'falha delete canário'});
  await qualifyDeleteCanary(env);
  assert.equal(env.context.OfflineSyncDeleteAuthority.setEnabled(true),true);
  await env.context.syncAllWithSupabase();

  assert.equal(env.getDeleteRemoteCalls(),1);
  assert.equal(env.getLegacySyncCalls(),1);
  assert.deepEqual(env.getLegacySnapshots()[0].editalDeletes,['topic-delete-1']);
  assert.equal(env.context.OfflineSyncDeleteAuthority.isEnabled(),false);
  assert.equal(env.context.OfflineSyncDeleteAuthority.isOptedIn(),false);
  assert.match(env.context.OfflineSyncDeleteAuthority.getCircuit().error,/falha delete canário/);
  assert.ok(env.events.some(event=>event.type==='offline-sync-delete-authority:fallback'));
});

test('delete synced é idempotente e não gera segundo delete remoto',async()=>{
  const env=makeContext({legacyClears:false});
  await qualifyDeleteCanary(env);
  assert.equal(env.context.OfflineSyncDeleteAuthority.setEnabled(true),true);
  await env.context.OfflineSyncDeleteAuthority.flushAuthorizedEditalDeletes();
  assert.equal(env.getDeleteRemoteCalls(),1);

  env.context.queueEditalDelete('topic-delete-1');
  await waitForDeleteShadow(env);
  await env.context.OfflineSyncDeleteAuthority.flushAuthorizedEditalDeletes();
  assert.equal(env.getDeleteRemoteCalls(),1);
  assert.deepEqual(env.getState().editalDeletes,[]);
});

test('upsert concorrente durante delete remoto não é apagado da fila legada',async()=>{
  const env=makeContext({legacyClears:false,onRemote:async({syncState,setSyncState})=>{
    const next=clone(syncState);
    next.editalDeletes=next.editalDeletes.filter(id=>String(id)!=='topic-delete-1');
    next.editalUpserts['topic-delete-1']={id:'topic-delete-1',materia:'Direito',assunto:'Recriado'};
    setSyncState(next);
  }});
  await qualifyDeleteCanary(env);
  assert.equal(env.context.OfflineSyncDeleteAuthority.setEnabled(true),true);
  await env.context.syncAllWithSupabase();

  assert.equal(env.getDeleteRemoteCalls(),1);
  const legacy=env.getLegacySnapshots()[0];
  assert.deepEqual(legacy.editalDeletes,[]);
  assert.equal(legacy.editalUpserts['topic-delete-1'].assunto,'Recriado');
});

test('orçamento do delete é separado e encerra em no máximo 2 batches ou 20 itens',async()=>{
  const env=makeContext({legacyClears:false});
  await qualifyDeleteCanary(env);
  assert.equal(env.context.OfflineSyncDeleteAuthority.setEnabled(true),true);

  const ids=Array.from({length:25},(_,i)=>`delete-${i}`);
  env.setState({metadataDirty:false,flashcardsDirty:{},editalUpserts:{},editalDeletes:ids,flashcardDeletes:[],concursoDeletes:[]});
  await env.context.OfflineSyncDeleteAuthority.flushAuthorizedEditalDeletes();

  const budget=env.context.OfflineSyncDeleteAuthority.getBudget();
  assert.equal(budget.exhausted,true);
  assert.equal(budget.batches,2);
  assert.equal(budget.items,20);
  assert.equal(env.context.OfflineSyncDeleteAuthority.isOptedIn(),false);
  assert.equal(env.context.OfflineSyncDeleteAuthority.getCanarySession().stopReason,'budget-exhausted');
  assert.equal(env.getDeleteRemoteCalls(),2);
  assert.equal(env.getState().editalDeletes.length,5);
});

test('kill switch global desliga delete canário e preserva caminho legado',async()=>{
  const env=makeContext();
  await qualifyDeleteCanary(env);
  assert.equal(env.context.OfflineSyncDeleteAuthority.setEnabled(true),true);
  env.context.OfflineSyncDeleteAuthority.setKillSwitch(true);
  assert.equal(env.context.OfflineSyncDeleteAuthority.isHardKilled(),true);
  assert.equal(env.context.OfflineSyncDeleteAuthority.isEnabled(),false);
  await env.context.syncAllWithSupabase();
  assert.equal(env.getDeleteRemoteCalls(),0);
  assert.equal(env.getLegacySyncCalls(),1);
});

test('módulo remoto permanece estritamente limitado a DELETE edital com user_id e fallback',()=>{
  assert.match(deleteAuthoritySource,/scope:Object\.freeze\(\['edital-topic:delete'\]\)/);
  assert.match(deleteAuthoritySource,/from\('edital'\)\.delete\(\)\.in\('id', ids\)\.eq\('user_id', userId\)/);
  assert.match(deleteAuthoritySource,/BATCH_SIZE = 10/);
  assert.match(deleteAuthoritySource,/MAX_CANARY_BATCHES = 2/);
  assert.match(deleteAuthoritySource,/MAX_CANARY_ITEMS = 20/);
  assert.doesNotMatch(deleteAuthoritySource,/\.upsert\s*\(/);
  assert.doesNotMatch(deleteAuthoritySource,/\.insert\s*\(/);
  assert.doesNotMatch(deleteAuthoritySource,/\bfetch\s*\(/);
  assert.match(deleteAuthoritySource,/legacySyncAllWithSupabase\.apply/);
  assert.match(deleteAuthoritySource,/getDeleteParityReport/);
});

(function(global){
'use strict';

const STATUS_DB='estudo-adaptativo-pdf-offline-integrity';
const STATUS_DB_VERSION=1;
const STATUS_STORE='pdf_status';
const STORE_DB='estudo-adaptativo-offline-pdf-store';
const STORE_RECORDS='pdf_records';
const STATES=Object.freeze({
  READY:'OFFLINE_READY',
  STALE:'STALE',
  ERROR:'ERROR',
  EVICTED:'EVICTED',
  UNVERIFIED:'UNVERIFIED_LARGE'
});
const MOBILE_HASH_SOFT_LIMIT=128*1024*1024;
const PRESSURE_USAGE_RATIO=0.82;
const TARGET_USAGE_RATIO=0.72;
const MIN_SAFE_FREE=512*1024*1024;
let auditRunning=false,cleanupRunning=false,libraryWrapped=false;

const isMobile=()=>{try{return global.matchMedia?.('(max-width: 700px)')?.matches||/Android|iPhone|iPad|iPod/i.test(global.navigator?.userAgent||'')}catch(_){return false}};
const key=(userId,pdfId)=>`${String(userId)}:${String(pdfId)}`;
const now=()=>Date.now();

function openDb(name,version,onUpgrade){
  if(!global.indexedDB)return Promise.resolve(null);
  return new Promise(resolve=>{
    let settled=false;const done=v=>{if(!settled){settled=true;resolve(v)}};
    try{
      const req=version?global.indexedDB.open(name,version):global.indexedDB.open(name);
      if(onUpgrade)req.onupgradeneeded=()=>onUpgrade(req.result);
      req.onsuccess=()=>done(req.result);req.onerror=()=>done(null);req.onblocked=()=>done(null);
    }catch(_){done(null)}
  });
}
function openStatusDb(){return openDb(STATUS_DB,STATUS_DB_VERSION,db=>{if(!db.objectStoreNames.contains(STATUS_STORE)){const s=db.createObjectStore(STATUS_STORE,{keyPath:'key'});s.createIndex('by_user','userId',{unique:false});s.createIndex('by_access','lastAccessedAt',{unique:false})}})}
function getRecord(db,store,keyValue){
  if(!db||!db.objectStoreNames.contains(store))return Promise.resolve(null);
  return new Promise(resolve=>{try{const r=db.transaction(store,'readonly').objectStore(store).get(keyValue);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>resolve(null)}catch(_){resolve(null)}})
}
function putRecord(db,store,value){
  if(!db||!db.objectStoreNames.contains(store))return Promise.resolve(false);
  return new Promise(resolve=>{try{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false)}catch(_){resolve(false)}})
}
function listByUser(db,store,userId){
  if(!db||!db.objectStoreNames.contains(store))return Promise.resolve([]);
  return new Promise(resolve=>{try{const objectStore=db.transaction(store,'readonly').objectStore(store);const index=objectStore.indexNames.contains('by_user')?objectStore.index('by_user'):null;if(!index)return resolve([]);const r=index.getAll(String(userId));r.onsuccess=()=>resolve(Array.isArray(r.result)?r.result:[]);r.onerror=()=>resolve([])}catch(_){resolve([])}})
}
async function authUser(){return global.PdfStudyCore?.getAuthenticatedUser?.()||null}
function emit(type,detail={}){try{global.dispatchEvent(new CustomEvent('pdf-offline-integrity',{detail:{type,...detail}}))}catch(_){}}

async function sha256(blob){
  if(!blob?.size||!global.crypto?.subtle)return'';
  const buffer=await blob.arrayBuffer();
  const digest=await global.crypto.subtle.digest('SHA-256',buffer);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
async function readStatus(userId,pdfId){const db=await openStatusDb();return getRecord(db,STATUS_STORE,key(userId,pdfId))}
async function writeStatus(userId,doc,state,extra={}){
  const db=await openStatusDb();if(!db||!userId||!doc?.id)return false;
  const previous=await getRecord(db,STATUS_STORE,key(userId,doc.id));
  return putRecord(db,STATUS_STORE,{
    key:key(userId,doc.id),userId:String(userId),pdfId:String(doc.id),state,
    sha256:String(doc.sha256||previous?.sha256||''),updatedAt:String(doc.updated_at||previous?.updatedAt||''),
    size:Number(extra.size??previous?.size??doc.file_size??0),isFavorite:!!(doc.is_favorite??previous?.isFavorite),
    verifiedAt:Number(extra.verifiedAt??previous?.verifiedAt??0),lastAccessedAt:now(),
    error:String(extra.error||''),actualSha256:String(extra.actualSha256||previous?.actualSha256||''),
    backend:String(extra.backend||previous?.backend||'')
  })
}
async function validateBlob(userId,doc,blob,{force=false}={}){
  if(!userId||!doc?.id||!blob?.size)return{ok:false,state:STATES.ERROR,reason:'Arquivo local vazio.'};
  const expected=String(doc.sha256||'').trim().toLowerCase();
  const existing=await readStatus(userId,doc.id);
  const sameVersion=existing?.state===STATES.READY&&String(existing.sha256||'').toLowerCase()===expected&&String(existing.updatedAt||'')===String(doc.updated_at||'')&&Number(existing.size||0)===Number(blob.size||0);
  if(sameVersion&&!force){await writeStatus(userId,doc,STATES.READY,{size:blob.size,verifiedAt:existing.verifiedAt,actualSha256:existing.actualSha256});return{ok:true,state:STATES.READY,cachedVerification:true}}

  if(expected&&global.crypto?.subtle){
    if(isMobile()&&blob.size>MOBILE_HASH_SOFT_LIMIT&&!force){
      await writeStatus(userId,doc,STATES.UNVERIFIED,{size:blob.size});
      emit('unverified-large',{pdfId:doc.id,size:blob.size});
      return{ok:true,state:STATES.UNVERIFIED,reason:'PDF grande: validação SHA-256 adiada para proteger a memória do celular.'};
    }
    try{
      const actual=await sha256(blob);
      if(actual!==expected){
        await global.OfflinePdfStore?.remove?.(userId,doc.id).catch?.(()=>false);
        await writeStatus(userId,doc,STATES.ERROR,{size:blob.size,actualSha256:actual,error:'SHA-256 divergente'});
        emit('integrity-error',{pdfId:doc.id,expected,actual});
        return{ok:false,state:STATES.ERROR,reason:'A cópia local falhou na verificação de integridade SHA-256.'};
      }
      await writeStatus(userId,doc,STATES.READY,{size:blob.size,actualSha256:actual,verifiedAt:now()});
      return{ok:true,state:STATES.READY,sha256:actual};
    }catch(error){
      await writeStatus(userId,doc,STATES.ERROR,{size:blob.size,error:error?.message||'Falha ao calcular SHA-256'});
      return{ok:false,state:STATES.ERROR,reason:'Não foi possível validar a integridade da cópia local.'};
    }
  }
  await writeStatus(userId,doc,STATES.READY,{size:blob.size,verifiedAt:now()});
  return{ok:true,state:STATES.READY,sizeOnly:true};
}
async function markError(userId,doc,error){if(userId&&doc?.id)await writeStatus(userId,doc,STATES.ERROR,{error:error?.message||String(error||'Falha')})}

async function inspectDocument(userId,doc){
  const status=await readStatus(userId,doc.id);
  const blob=await global.OfflinePdfStore?.get?.(userId,doc,{migrateLegacy:false}).catch?.(()=>null);
  if(!blob?.size){
    if(status?.state===STATES.EVICTED)return{...status,state:STATES.EVICTED};
    return{...(status||{}),state:'REMOTE_ONLY',pdfId:String(doc.id)};
  }
  const hashChanged=!!(doc.sha256&&status?.sha256&&String(doc.sha256).toLowerCase()!==String(status.sha256).toLowerCase());
  const updatedChanged=!doc.sha256&&!!(doc.updated_at&&status?.updatedAt&&String(doc.updated_at)!==String(status.updatedAt));
  if(hashChanged||updatedChanged){await writeStatus(userId,doc,STATES.STALE,{size:blob.size});return{...(status||{}),state:STATES.STALE,pdfId:String(doc.id)}}
  return{...(status||{}),state:status?.state||STATES.READY,pdfId:String(doc.id),size:blob.size};
}
async function auditLibrary(docs){
  if(auditRunning||!global.navigator.onLine)return null;auditRunning=true;
  try{
    const u=await authUser();if(!u?.id)return null;
    const list=Array.isArray(docs)?docs:await global.PdfStudyLibrary?.list?.({scope:'global'});
    const summary={ready:0,stale:0,error:0,remoteOnly:0,unverified:0,evicted:0,total:(list||[]).length};
    for(const doc of (list||[])){
      const s=await inspectDocument(u.id,doc);
      if(s.state===STATES.READY)summary.ready++;
      else if(s.state===STATES.STALE)summary.stale++;
      else if(s.state===STATES.ERROR)summary.error++;
      else if(s.state===STATES.UNVERIFIED)summary.unverified++;
      else if(s.state===STATES.EVICTED)summary.evicted++;
      else summary.remoteOnly++;
      await new Promise(r=>setTimeout(r,0));
    }
    emit('audit-complete',{summary});return summary;
  }catch(error){emit('audit-error',{error:error?.message||'Falha na auditoria'});return null}
  finally{auditRunning=false}
}

async function listStoreRecords(userId){const db=await openDb(STORE_DB);return listByUser(db,STORE_RECORDS,userId)}
async function storagePressure(){
  const estimate=await global.OfflinePdfStore?.getStorageEstimate?.()||await global.navigator?.storage?.estimate?.()||{};
  const usage=Number(estimate.usage||0),quota=Number(estimate.quota||0),available=Math.max(0,Number(estimate.available??quota-usage));
  const ratio=quota>0?usage/quota:0;const minFree=Math.max(MIN_SAFE_FREE,quota*0.20);
  return{usage,quota,available,ratio,minFree,pressured:!!quota&&(ratio>=PRESSURE_USAGE_RATIO||available<minFree)};
}
async function cleanupLRU({force=false}={}){
  if(cleanupRunning)return{removed:0,reason:'already-running'};cleanupRunning=true;
  try{
    const u=await authUser();if(!u?.id)return{removed:0,reason:'no-user'};
    const pressure=await storagePressure();if(!force&&!pressure.pressured)return{removed:0,reason:'not-needed',pressure};
    const settings=await global.PdfOfflineLibraryManager?.getSettings?.().catch?.(()=>({mode:'opened'}))||{mode:'opened'};
    if(settings.mode==='all'&&!force){emit('storage-pressure',{pressure,protectedMode:'all'});return{removed:0,reason:'library-all-protected',pressure}}
    const [records,statusDb]=await Promise.all([listStoreRecords(u.id),openStatusDb()]);
    const statuses=await listByUser(statusDb,STATUS_STORE,u.id);const statusMap=new Map(statuses.map(s=>[String(s.pdfId),s]));
    const candidates=(records||[]).map(r=>({...r,status:statusMap.get(String(r.pdfId))||null}))
      .filter(r=>!r.status?.isFavorite)
      .sort((a,b)=>Number(a.lastAccessedAt||a.savedAt||0)-Number(b.lastAccessedAt||b.savedAt||0));
    let removed=0,reclaimed=0;
    for(const record of candidates){
      const current=await storagePressure();
      if(!force&&current.ratio<=TARGET_USAGE_RATIO&&current.available>=current.minFree)break;
      await global.OfflinePdfStore?.remove?.(u.id,record.pdfId);
      reclaimed+=Number(record.size||0);removed++;
      await writeStatus(u.id,{id:record.pdfId,sha256:record.status?.sha256||'',updated_at:record.status?.updatedAt||'',file_size:record.size,is_favorite:false},STATES.EVICTED,{size:record.size});
      emit('evicted',{pdfId:record.pdfId,size:Number(record.size||0)});
      if(isMobile())await new Promise(r=>setTimeout(r,80));
    }
    const after=await storagePressure();emit('cleanup-complete',{removed,reclaimed,after});return{removed,reclaimed,after};
  }finally{cleanupRunning=false}
}

async function wrapLibrary(){
  if(libraryWrapped)return true;
  const library=global.PdfStudyLibrary;if(!library?.downloadBlob)return false;
  const originalDownload=library.downloadBlob.bind(library);
  const originalForget=library.forgetDocuments?.bind(library);
  async function downloadBlob(doc){
    const u=await authUser();
    try{
      const blob=await originalDownload(doc);
      if(u?.id&&blob?.size){const check=await validateBlob(u.id,doc,blob);if(!check.ok)throw new Error(check.reason);setTimeout(()=>cleanupLRU().catch(()=>{}),250)}
      return blob;
    }catch(error){if(u?.id)await markError(u.id,doc,error);throw error}
  }
  async function forgetDocuments(ids){
    const result=originalForget?await originalForget(ids):undefined;const u=await authUser();
    if(u?.id){const db=await openStatusDb();for(const id of (Array.isArray(ids)?ids:[ids]).filter(Boolean)){const s=await getRecord(db,STATUS_STORE,key(u.id,id));if(s)await putRecord(db,STATUS_STORE,{...s,state:STATES.EVICTED,lastAccessedAt:now()})}}
    return result;
  }
  global.PdfStudyLibrary=Object.freeze({...library,downloadBlob,forgetDocuments,
    getOfflineIntegrityState:async doc=>{const u=await authUser();return u?.id?inspectDocument(u.id,doc):{state:'REMOTE_ONLY'}},
    auditOfflineLibrary:auditLibrary,cleanupOfflineLRU:cleanupLRU,
    __offlineIntegrityIntegrated:true});
  libraryWrapped=true;return true;
}

function boot(){
  let attempts=0;const timer=setInterval(()=>{attempts++;if(wrapLibrary().then(ok=>{if(ok){clearInterval(timer);if(global.navigator.onLine)setTimeout(()=>auditLibrary().catch(()=>{}),3500)}}),attempts>80)clearInterval(timer)},100);
}
global.addEventListener('online',()=>setTimeout(()=>auditLibrary().catch(()=>{}),1800));
global.addEventListener('pdf-offline-library',event=>{if(event.detail?.type==='downloaded')setTimeout(()=>cleanupLRU().catch(()=>{}),300)});

global.PdfOfflineIntegrity=Object.freeze({STATES,sha256,validateBlob,inspectDocument,auditLibrary,cleanupLRU,storagePressure,readStatus});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);

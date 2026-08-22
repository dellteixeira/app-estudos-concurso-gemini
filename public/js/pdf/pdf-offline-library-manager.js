(function(global){
'use strict';

const MODES=new Set(['opened','favorites','all']);
const DEFAULT_LIMIT_MB_MOBILE=2048;
const DEFAULT_LIMIT_MB_DESKTOP=5120;
const MIN_FREE_RESERVE_BYTES=256*1024*1024;
const FREE_RESERVE_RATIO=0.20;
const SETTINGS_PREFIX='pdfOfflineLibrarySettings:';
let running=false,paused=false,cancelled=false,queue=[],completed=0,failed=0,current=null,lastError='';

const isMobile=()=>{try{return global.matchMedia?.('(max-width: 700px)')?.matches||/Android|iPhone|iPad|iPod/i.test(global.navigator?.userAgent||'')}catch(_){return false}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const bytesLabel=n=>{n=Math.max(0,Number(n)||0);if(n<1024*1024)return `${Math.round(n/1024)} KB`;if(n<1024*1024*1024)return `${(n/1024/1024).toFixed(n>=100*1024*1024?0:1)} MB`;return `${(n/1024/1024/1024).toFixed(1)} GB`};

async function user(){return global.PdfStudyCore?.getAuthenticatedUser?.()||null}
function settingsKey(userId){return `${SETTINGS_PREFIX}${userId}`}
function defaults(){return{mode:'opened',limitMb:isMobile()?DEFAULT_LIMIT_MB_MOBILE:DEFAULT_LIMIT_MB_DESKTOP,wifiOnly:false,updatedAt:Date.now()}}
async function getSettings(){
  const u=await user();if(!u?.id)return defaults();
  try{const raw=JSON.parse(localStorage.getItem(settingsKey(u.id))||'null');return{...defaults(),...(raw&&typeof raw==='object'?raw:{})}}catch(_){return defaults()}
}
async function saveSettings(next){
  const u=await user();if(!u?.id)return defaults();
  const current=await getSettings();const value={...current,...next,mode:MODES.has(next?.mode)?next.mode:current.mode,updatedAt:Date.now()};
  try{localStorage.setItem(settingsKey(u.id),JSON.stringify(value))}catch(_){}
  emit('settings',value);return value;
}
function emit(type,detail={}){try{global.dispatchEvent(new CustomEvent('pdf-offline-library',{detail:{type,...detail,state:getStateSync()}}))}catch(_){} }
function getStateSync(){return{running,paused,cancelled,total:queue.length+completed+failed,remaining:queue.length,completed,failed,currentId:current?.id||'',lastError}}
async function capabilities(){return global.PdfStudyLibrary?.getOfflineCapabilities?.()||global.OfflinePdfStore?.capabilities?.()||{storage:{usage:0,quota:0,available:0,usageRatio:0},persistence:{supported:false,persisted:false},preferredBackend:'none'}}
async function budget(){
  const [caps,s]=await Promise.all([capabilities(),getSettings()]);
  const quota=Number(caps?.storage?.quota||0),usage=Number(caps?.storage?.usage||0),available=Math.max(0,Number(caps?.storage?.available||quota-usage||0));
  const reserve=Math.max(MIN_FREE_RESERVE_BYTES,Math.floor(quota*FREE_RESERVE_RATIO));
  const safeAvailable=Math.max(0,available-reserve);
  const configured=Number(s.limitMb)>0?Number(s.limitMb)*1024*1024:Number.POSITIVE_INFINITY;
  const appBudget=Math.min(safeAvailable||configured,configured);
  return{quota,usage,available,reserve,safeAvailable,configured,appBudget,caps,settings:s};
}
function connectionAllowed(settings){
  if(!settings?.wifiOnly)return true;
  const c=global.navigator?.connection;
  if(!c)return true;
  const type=String(c.type||'').toLowerCase();
  return !type||type==='wifi'||type==='ethernet';
}
async function listTargets(mode){
  if(mode==='opened')return[];
  if(!global.navigator.onLine)throw new Error('Conecte-se à internet para preparar novos PDFs offline.');
  const docs=await global.PdfStudyLibrary.list({scope:'global'});
  return mode==='favorites'?(docs||[]).filter(d=>d.is_favorite):(docs||[]);
}
async function buildQueue(mode){
  const u=await user();if(!u?.id)throw new Error('Sessão inválida.');
  const docs=await listTargets(mode);const pending=[];let already=0,totalBytes=0;
  for(const doc of docs){
    const has=await global.PdfStudyLibrary.hasOfflineCopy?.(doc).catch?.(()=>false);
    if(has){already++;continue}
    pending.push(doc);totalBytes+=Math.max(0,Number(doc.file_size)||0);
  }
  return{docs,pending,already,totalBytes};
}
async function preflight(mode){
  const [plan,b]=await Promise.all([buildQueue(mode),budget()]);
  if(mode!=='opened'&&plan.totalBytes>b.appBudget&&Number.isFinite(b.appBudget)){
    return{ok:false,reason:`Os PDFs pendentes somam ${bytesLabel(plan.totalBytes)}, mas o limite seguro disponível é ${bytesLabel(b.appBudget)}. Aumente o limite local ou libere espaço.`,plan,budget:b};
  }
  return{ok:true,plan,budget:b};
}
async function ensurePersistence(){
  try{
    const caps=await capabilities();
    if(caps?.persistence?.persisted)return caps.persistence;
    const store=global.OfflinePdfStore;
    if(store?.requestPersistence)return await store.requestPersistence();
  }catch(_){}
  return{supported:false,persisted:false};
}
async function downloadOne(doc){
  const before=await budget();
  const expected=Math.max(0,Number(doc.file_size)||0);
  if(Number.isFinite(before.appBudget)&&expected>before.appBudget)throw new Error(`Sem espaço seguro para ${doc.title||doc.original_file_name||'este PDF'}.`);
  const blob=await global.PdfStudyLibrary.downloadBlob(doc);
  if(!blob?.size)throw new Error('O PDF baixado está vazio.');
  return blob;
}
async function worker(){
  while(queue.length&&!cancelled){
    while(paused&&!cancelled)await sleep(250);
    if(cancelled)break;
    const s=await getSettings();
    if(!global.navigator.onLine){paused=true;lastError='Fila pausada: dispositivo offline.';emit('paused',{reason:lastError});break}
    if(!connectionAllowed(s)){paused=true;lastError='Fila pausada: aguardando Wi-Fi.';emit('paused',{reason:lastError});break}
    current=queue.shift();emit('progress',{document:current});
    try{await downloadOne(current);completed++;emit('downloaded',{document:current})}
    catch(error){failed++;lastError=error?.message||'Falha ao preparar PDF offline.';emit('error',{document:current,error:lastError})}
    current=null;
    if(isMobile())await sleep(180);
  }
}
async function start(mode){
  mode=MODES.has(mode)?mode:(await getSettings()).mode;
  await saveSettings({mode});
  if(mode==='opened'){cancel();emit('complete',{message:'Modo “Apenas PDFs que eu abrir” ativo.'});return{mode,queued:0}}
  if(running)return getStateSync();
  const check=await preflight(mode);
  if(!check.ok){lastError=check.reason;emit('blocked',{reason:check.reason,plan:check.plan});return{...check,mode}}
  await ensurePersistence();
  queue=[...check.plan.pending];completed=0;failed=0;cancelled=false;paused=false;lastError='';
  if(!queue.length){emit('complete',{message:'Todos os PDFs desta política já estão disponíveis offline.'});return{mode,queued:0,already:check.plan.already}}
  running=true;emit('start',{mode,queued:queue.length,totalBytes:check.plan.totalBytes,already:check.plan.already});
  try{
    const concurrency=isMobile()?1:2;
    await Promise.all(Array.from({length:Math.min(concurrency,queue.length)},()=>worker()));
  }finally{
    running=false;current=null;
    if(!paused&&!cancelled)emit('complete',{mode,completed,failed});
  }
  return getStateSync();
}
function pause(){if(!running)return false;paused=true;emit('paused',{reason:'Download pausado pelo usuário.'});return true}
function resume(){if(!running||!paused)return false;paused=false;lastError='';emit('resumed',{});return true}
function cancel(){cancelled=true;paused=false;queue=[];emit('cancelled',{});return true}
async function syncCurrentPolicy(){const s=await getSettings();return start(s.mode)}
async function setMode(mode){if(!MODES.has(mode))throw new Error('Modo offline inválido.');return start(mode)}
async function setLimitMb(limitMb){const n=Number(limitMb);return saveSettings({limitMb:Number.isFinite(n)&&n>=0?n:0})}
async function setWifiOnly(value){return saveSettings({wifiOnly:!!value})}
async function getStatus(){return{...getStateSync(),settings:await getSettings(),budget:await budget()}}

// Retoma políticas gerenciadas quando a rede retorna, sem atuar no modo "opened".
global.addEventListener('online',()=>{getSettings().then(s=>{if(s.mode!=='opened'&&!running)setTimeout(()=>syncCurrentPolicy().catch(()=>{}),1200)})});

global.PdfOfflineLibraryManager=Object.freeze({getSettings,setMode,setLimitMb,setWifiOnly,start,pause,resume,cancel,syncCurrentPolicy,getStatus,preflight,bytesLabel});
})(window);

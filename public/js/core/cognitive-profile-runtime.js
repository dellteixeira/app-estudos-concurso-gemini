(function installCognitiveProfileRuntime(global){
'use strict';
if(global.AppCognitiveProfileRuntime)return;

const WRAPPED=Symbol('cognitive-profile-wrapped');
const REFRESH_DELAY_MS=80;
const INSTALL_RETRY_MS=250;
const INSTALL_MAX_ATTEMPTS=80;
let refreshTimer=null;
let installAttempts=0;
let installed=false;
let lastFingerprint='';

function readSourceSnapshot(){
  try{
    const snapshot=global.AppCognitiveDataSource?.snapshot?.();
    return snapshot&&typeof snapshot==='object'?snapshot:null;
  }catch(_){return null}
}

function decodeJwtSubject(token){
  try{
    const part=String(token||'').split('.')[1];
    if(!part)return '';
    const normalized=part.replace(/-/g,'+').replace(/_/g,'/');
    const padded=normalized+'='.repeat((4-normalized.length%4)%4);
    const payload=JSON.parse(global.atob(padded));
    return String(payload?.sub||'');
  }catch(_){return ''}
}

function resolveUserId(){
  const sourceUser=String(readSourceSnapshot()?.userId||'').trim();
  if(sourceUser)return sourceUser;
  try{
    for(let index=0;index<global.localStorage.length;index++){
      const key=global.localStorage.key(index);
      if(!/^sb-.+-auth-token$/.test(String(key||'')))continue;
      const raw=global.localStorage.getItem(key);
      if(!raw)continue;
      const parsed=JSON.parse(raw);
      const direct=parsed?.user?.id||parsed?.currentSession?.user?.id||parsed?.session?.user?.id;
      if(direct)return String(direct);
      const token=parsed?.access_token||parsed?.currentSession?.access_token||parsed?.session?.access_token;
      const subject=decodeJwtSubject(token);
      if(subject)return subject;
    }
  }catch(_){}
  return '';
}

function resolveContest(){
  const sourceContest=String(readSourceSnapshot()?.contest||'').trim();
  if(sourceContest)return sourceContest;
  const select=document.getElementById('concursoSelect');
  const selected=String(select?.value||'').trim();
  if(selected)return selected;
  try{
    const title=String(document.getElementById('edital-title')?.textContent||'').trim();
    const match=title.match(/^Edital:\s*(.+)$/i);
    if(match?.[1])return match[1].trim();
  }catch(_){}
  return 'Concurso Geral';
}

function getMetadata(){
  try{
    if(typeof global.getConcursosMetadata==='function'){
      const value=global.getConcursosMetadata();
      return value&&typeof value==='object'?value:{};
    }
  }catch(_){}
  return {};
}

function calculateRetention(state){
  try{
    if(typeof global.calculateRetentionFromState==='function'){
      const value=Number(global.calculateRetentionFromState(state,new Date()));
      if(Number.isFinite(value))return value;
    }
  }catch(_){}
  const fallback=Number(state?.retention);
  return Number.isFinite(fallback)?fallback:null;
}

function buildRows(contestMeta){
  const topics=contestMeta?.retentionEngine?.topics;
  if(!topics||typeof topics!=='object')return [];
  return Object.values(topics).filter(Boolean).map(state=>({
    materia:String(state?.materia||''),
    assunto:String(state?.assunto||''),
    retention:calculateRetention(state),
    questionAccuracy:Number.isFinite(Number(state?.questionStats?.averageAccuracy))
      ?Number(state.questionStats.averageAccuracy)
      :state?.questionStats?.lastAccuracy,
    state
  }));
}

function resolveInputSnapshot(){
  const source=readSourceSnapshot();
  if(source){
    return {
      userId:String(source.userId||'').trim(),
      contest:String(source.contest||'Concurso Geral').trim()||'Concurso Geral',
      rows:Array.isArray(source.rows)?source.rows:[],
      sessions:Array.isArray(source.sessions)?source.sessions:[]
    };
  }
  const userId=resolveUserId();
  const contest=resolveContest();
  const metadata=getMetadata();
  const contestMeta=metadata?.[contest]||{};
  return {
    userId,
    contest,
    rows:buildRows(contestMeta),
    sessions:Array.isArray(contestMeta?.studySessions)?contestMeta.studySessions:[]
  };
}

function fingerprintInput(userId,contest,rows,sessions){
  const lastSession=sessions[sessions.length-1];
  const lastRow=rows[rows.length-1];
  return [
    userId,contest,rows.length,sessions.length,
    lastSession?.id||'',lastSession?.createdAt||'',
    lastRow?.state?.updatedAt||'',lastRow?.state?.questionStats?.lastAt||'',
    lastRow?.retention??''
  ].join('|');
}

function refresh(options={}){
  const profileApi=global.AppCognitiveProfile;
  if(!profileApi?.refresh)return null;
  const {userId,contest,rows,sessions}=resolveInputSnapshot();
  if(!userId)return null;
  const fingerprint=fingerprintInput(userId,contest,rows,sessions);
  if(!options.force&&fingerprint===lastFingerprint)return profileApi.read?.(userId,contest)||null;
  lastFingerprint=fingerprint;
  const profile=profileApi.refresh({userId,contest,rows,sessions});
  try{
    global.dispatchEvent(new CustomEvent('app:cognitive-profile-updated',{detail:{
      userId,contest,updatedAt:profile?.updatedAt||null,metrics:profile?.metrics||null
    }}));
  }catch(_){}
  return profile;
}

function scheduleRefresh(options={}){
  global.clearTimeout(refreshTimer);
  refreshTimer=global.setTimeout(()=>refresh(options),Math.max(0,Number(options.delay)||REFRESH_DELAY_MS));
}

function wrapFunction(name,{after=true}={}){
  const original=global[name];
  if(typeof original!=='function'||original[WRAPPED])return false;
  const wrapped=function(...args){
    const result=original.apply(this,args);
    if(result&&typeof result.then==='function'){
      return result.then(value=>{
        if(after)scheduleRefresh({force:true});
        return value;
      });
    }
    if(after)scheduleRefresh({force:true});
    return result;
  };
  Object.defineProperty(wrapped,WRAPPED,{value:true});
  Object.defineProperty(wrapped,'name',{value:original.name||name,configurable:true});
  global[name]=wrapped;
  return true;
}

function installHooks(){
  const names=[
    'loadData',
    'syncAllWithSupabase',
    'changeConcurso',
    'recordStudyMinutesForContext',
    'submitQuestionPerformance',
    'submitAdaptiveReviewFeedback',
    'rebuildRetentionEngineForContest',
    'renderRetentionDiagnostics',
    'filterDataByConcurso'
  ];
  names.forEach(name=>wrapFunction(name));

  const selector=document.getElementById('concursoSelect');
  if(selector&&!selector.dataset.cognitiveProfileBound){
    selector.dataset.cognitiveProfileBound='1';
    selector.addEventListener('change',()=>scheduleRefresh({force:true}),{passive:true});
  }

  if(!installed){
    global.addEventListener('storage',event=>{
      if(String(event?.key||'').startsWith('concursos_metadata_'))scheduleRefresh({force:true});
    });
    global.addEventListener('pageshow',()=>scheduleRefresh({force:false}),{passive:true});
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden)scheduleRefresh({force:false});
    },{passive:true});
  }
  installed=true;
  scheduleRefresh({force:true,delay:20});
  return true;
}

function bootstrap(){
  if(global.AppCognitiveProfile&&global.AppCognitiveDataSource)return installHooks();
  if(++installAttempts>=INSTALL_MAX_ATTEMPTS)return installHooks();
  global.setTimeout(bootstrap,INSTALL_RETRY_MS);
}

global.AppCognitiveProfileRuntime=Object.freeze({
  readSourceSnapshot,
  resolveUserId,
  resolveContest,
  buildRows,
  resolveInputSnapshot,
  refresh,
  scheduleRefresh,
  installHooks,
  isInstalled:()=>installed
});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootstrap,{once:true});
else bootstrap();
})(window);

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

function editalItems(){
  try{
    if(Array.isArray(global.editalItems))return global.editalItems;
    if(Array.isArray(global.allEditalItems))return global.allEditalItems;
    return global.AppState?.getEdital?.({all:true})||[];
  }catch(_){return []}
}

function priorityForTopic(materia,assunto){
  try{
    const indexed=global.AppCognitiveDataSource?.priorityForTopic?.(materia,assunto);
    if(indexed)return indexed;
  }catch(_){}
  const item=editalItems().find(candidate=>String(candidate?.materia||'').trim()===String(materia||'').trim()&&String(candidate?.assunto||'').trim()===String(assunto||'').trim());
  if(!item)return {editalPriority:null,topicPriority:null};
  const editalPriority=Number(item.prioridade);
  const topicPriority=Number(item.assunto_prioridade);
  return {
    editalPriority:Number.isFinite(editalPriority)?editalPriority:null,
    topicPriority:Number.isFinite(topicPriority)?topicPriority:null
  };
}

function buildRows(contestMeta){
  const topics=contestMeta?.retentionEngine?.topics;
  if(!topics||typeof topics!=='object')return [];
  return Object.values(topics).filter(Boolean).map(state=>{
    const priority=priorityForTopic(state?.materia,state?.assunto);
    return {
      materia:String(state?.materia||''),
      assunto:String(state?.assunto||''),
      retention:calculateRetention(state),
      questionAccuracy:Number.isFinite(Number(state?.questionStats?.averageAccuracy))
        ?Number(state.questionStats.averageAccuracy)
        :state?.questionStats?.lastAccuracy,
      editalPriority:priority.editalPriority,
      topicPriority:priority.topicPriority,
      state
    };
  });
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

function hashText(text){
  let hash=2166136261;
  for(let index=0;index<text.length;index++){
    hash^=text.charCodeAt(index);
    hash=Math.imul(hash,16777619);
  }
  return (hash>>>0).toString(36);
}

function fingerprintInput(userId,contest,rows,sessions){
  const compactRows=rows.map(row=>[
    row?.state?.key||`${row?.materia||''}::${row?.assunto||''}`,
    row?.state?.updatedAt||'',row?.state?.lastStudyAt||'',row?.state?.questionStats?.lastAt||'',
    row?.retention??'',row?.questionAccuracy??'',row?.state?.lapseCount??'',row?.state?.reviewCount??'',
    row?.state?.sessionCount??'',row?.state?.totalMinutes??'',row?.editalPriority??'',row?.topicPriority??''
  ]);
  const compactSessions=sessions.map(session=>[
    session?.id||'',session?.createdAt||session?.dateKey||'',session?.minutes??session?.durationMinutes??'',
    session?.materia||'',session?.assunto||'',session?.activityType||''
  ]);
  return `${userId}|${contest}|${hashText(JSON.stringify([compactRows,compactSessions]))}`;
}

function readMethodEffectiveness(userId,contest){
  try{return global.AppInterventionEffectiveness?.aggregate?.(userId,contest)||undefined}catch(_){return undefined}
}

function applyErrorIntelligence(profile){
  try{
    const engine=global.AppErrorIntelligence;
    const profileApi=global.AppCognitiveProfile;
    if(!profile||!engine?.recurringErrors||!profileApi?.write)return profile;
    const recurringErrors=engine.recurringErrors(profile);
    const next={...profile,recurringErrors,errorIntelligence:engine.aggregate(recurringErrors)};
    profileApi.write(next);
    return next;
  }catch(_){return profile}
}

function refresh(options={}){
  const profileApi=global.AppCognitiveProfile;
  if(!profileApi?.refresh)return null;
  const {userId,contest,rows,sessions}=resolveInputSnapshot();
  if(!userId)return null;
  const fingerprint=fingerprintInput(userId,contest,rows,sessions);
  if(!options.force&&fingerprint===lastFingerprint)return profileApi.read?.(userId,contest)||null;
  lastFingerprint=fingerprint;
  const methodEffectiveness=readMethodEffectiveness(userId,contest);
  let profile=profileApi.refresh({userId,contest,rows,sessions,methodEffectiveness});
  profile=applyErrorIntelligence(profile);
  try{
    global.dispatchEvent(new CustomEvent('app:cognitive-profile-updated',{detail:{
      userId,contest,updatedAt:profile?.updatedAt||null,metrics:profile?.metrics||null,
      recurringErrors:profile?.recurringErrors?.length||0
    }}));
  }catch(_){}
  return profile;
}

function scheduleRefresh(options={}){
  global.clearTimeout(refreshTimer);
  refreshTimer=global.setTimeout(()=>refresh(options),Math.max(0,Number(options.delay)||REFRESH_DELAY_MS));
}

function topicHintFromArgs(args=[]){
  for(const arg of args){
    if(!arg||typeof arg!=='object')continue;
    const materia=arg.materia||arg.subject;
    const assunto=arg.assunto||arg.topic;
    const topicId=arg.topicId||arg.topicKey||arg.key;
    if(topicId||(materia&&assunto))return {topicId,materia,assunto};
  }
  return null;
}
function scheduleAfterMutation(args=[]){
  const hint=topicHintFromArgs(args);
  if(hint&&global.AppCognitiveProfile?.patchTopic&&global.AppCognitiveDataSource?.topicSnapshot){
    global.setTimeout(()=>{
      try{
        const row=global.AppCognitiveDataSource.topicSnapshot(hint);
        if(row){
          const source=readSourceSnapshot();
          const profile=global.AppCognitiveProfile.patchTopic({userId:source?.userId||resolveUserId(),contest:source?.contest||resolveContest(),row});
          global.dispatchEvent(new CustomEvent('app:cognitive-profile-updated',{detail:{userId:profile?.userId,contest:profile?.contest,updatedAt:profile?.updatedAt,revision:profile?.revision,incremental:true}}));
        }
      }catch(_){}
      scheduleRefresh({force:false,delay:420});
    },0);
    return;
  }
  scheduleRefresh({force:false});
}

function wrapFunction(name){
  const original=global[name];
  if(typeof original!=='function'||original[WRAPPED])return false;
  const wrapped=function(...args){
    const result=original.apply(this,args);
    if(result&&typeof result.then==='function'){
      return result.then(value=>{
        scheduleAfterMutation(args);
        return value;
      });
    }
    scheduleAfterMutation(args);
    return result;
  };
  Object.defineProperty(wrapped,WRAPPED,{value:true});
  Object.defineProperty(wrapped,'name',{value:original.name||name,configurable:true});
  global[name]=wrapped;
  return true;
}

function installHooks(){
  // Somente mutações/fontes de dados podem invalidar o Student Model.
  // Funções puramente de renderização ficam explicitamente fora deste contrato.
  const names=[
    'loadData',
    'syncAllWithSupabase',
    'changeConcurso',
    'recordStudyMinutesForContext',
    'submitQuestionPerformance',
    'submitAdaptiveReviewFeedback',
    'rebuildRetentionEngineForContest',
    'filterDataByConcurso'
  ];
  names.forEach(name=>wrapFunction(name));

  const selector=document.getElementById('concursoSelect');
  if(selector&&!selector.dataset.cognitiveProfileBound){
    selector.dataset.cognitiveProfileBound='1';
    selector.addEventListener('change',()=>scheduleRefresh({force:false}),{passive:true});
  }

  if(!installed){
    global.addEventListener('storage',event=>{
      if(String(event?.key||'').startsWith('concursos_metadata_'))scheduleRefresh({force:false});
    });
    global.addEventListener('app:intervention-effectiveness-event',()=>scheduleRefresh({force:false}));
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
  priorityForTopic,
  topicHintFromArgs,
  scheduleAfterMutation,
  resolveInputSnapshot,
  fingerprintInput,
  readMethodEffectiveness,
  applyErrorIntelligence,
  refresh,
  scheduleRefresh,
  installHooks,
  isInstalled:()=>installed
});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootstrap,{once:true});
else bootstrap();
})(window);
(function installCognitiveProfileSource(global){
'use strict';
if(global.AppCognitiveDataSource)return;

function safeCurrentUserId(){
  try{return String(currentUser?.id||'')}catch(_){return ''}
}

function safeCurrentContest(){
  try{return String(currentConcurso||'Concurso Geral')}catch(_){return 'Concurso Geral'}
}

function safeMetadata(){
  try{
    const value=typeof getConcursosMetadata==='function'?getConcursosMetadata():{};
    return value&&typeof value==='object'?value:{};
  }catch(_){return {}}
}

function retentionForState(state){
  try{
    if(typeof calculateRetentionFromState==='function'){
      const value=Number(calculateRetentionFromState(state,new Date()));
      if(Number.isFinite(value))return value;
    }
  }catch(_){}
  const fallback=Number(state?.retention);
  return Number.isFinite(fallback)?fallback:null;
}

function snapshot(){
  const userId=safeCurrentUserId();
  const contest=safeCurrentContest();
  const metadata=safeMetadata();
  const contestMeta=metadata?.[contest]||{};
  const sessions=Array.isArray(contestMeta?.studySessions)?contestMeta.studySessions:[];
  const topics=contestMeta?.retentionEngine?.topics;
  const rows=topics&&typeof topics==='object'
    ?Object.values(topics).filter(Boolean).map(state=>({
      materia:String(state?.materia||''),
      assunto:String(state?.assunto||''),
      retention:retentionForState(state),
      questionAccuracy:Number.isFinite(Number(state?.questionStats?.averageAccuracy))
        ?Number(state.questionStats.averageAccuracy)
        :state?.questionStats?.lastAccuracy,
      state
    }))
    :[];
  return Object.freeze({userId,contest,rows,sessions});
}

global.AppCognitiveDataSource=Object.freeze({snapshot});
})(window);

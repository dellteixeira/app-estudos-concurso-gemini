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

function safeEdital(){
  try{
    if(Array.isArray(editalItems))return editalItems;
    if(Array.isArray(allEditalItems))return allEditalItems;
  }catch(_){}
  try{return global.AppState?.getEdital?.({all:true})||[]}catch(_){return []}
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

function priorityForTopic(materia,assunto){
  const item=safeEdital().find(candidate=>
    String(candidate?.materia||'').trim()===String(materia||'').trim()&&
    String(candidate?.assunto||'').trim()===String(assunto||'').trim()
  );
  if(!item)return {editalPriority:null,topicPriority:null};
  const editalPriority=Number(item.prioridade);
  const topicPriority=Number(item.assunto_prioridade);
  return {
    editalPriority:Number.isFinite(editalPriority)?editalPriority:null,
    topicPriority:Number.isFinite(topicPriority)?topicPriority:null
  };
}

function snapshot(){
  const userId=safeCurrentUserId();
  const contest=safeCurrentContest();
  const metadata=safeMetadata();
  const contestMeta=metadata?.[contest]||{};
  const sessions=Array.isArray(contestMeta?.studySessions)?contestMeta.studySessions:[];
  const topics=contestMeta?.retentionEngine?.topics;
  const rows=topics&&typeof topics==='object'
    ?Object.values(topics).filter(Boolean).map(state=>{
      const priority=priorityForTopic(state?.materia,state?.assunto);
      return {
        materia:String(state?.materia||''),
        assunto:String(state?.assunto||''),
        retention:retentionForState(state),
        questionAccuracy:Number.isFinite(Number(state?.questionStats?.averageAccuracy))
          ?Number(state.questionStats.averageAccuracy)
          :state?.questionStats?.lastAccuracy,
        editalPriority:priority.editalPriority,
        topicPriority:priority.topicPriority,
        state
      };
    })
    :[];
  return Object.freeze({userId,contest,rows,sessions});
}

global.AppCognitiveDataSource=Object.freeze({snapshot,priorityForTopic});
})(window);

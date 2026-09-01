(function installCognitiveProfileSource(global){
'use strict';
if(global.AppCognitiveDataSource)return;

let editalIndex=null;
let editalIndexBuilds=0;
let editalIndexLookups=0;
let topicIndex=new Map();
let topicIndexBuilds=0;
const normalizeKey=(materia,assunto)=>`${String(materia||'').trim()}::${String(assunto||'').trim()}`.toLowerCase();

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

function buildEditalIndex(items=safeEdital()){
  const byTopic=new Map();
  const byMateria=new Map();
  (Array.isArray(items)?items:[]).forEach((item,canonicalIndex)=>{
    const materia=String(item?.materia||'').trim();
    const assunto=String(item?.assunto||'').trim();
    const key=normalizeKey(materia,assunto);
    if(key!=='::'&&!byTopic.has(key))byTopic.set(key,{item,canonicalIndex});
    const materiaKey=materia.toLowerCase();
    if(materiaKey){
      const list=byMateria.get(materiaKey)||[];
      list.push({item,canonicalIndex});
      byMateria.set(materiaKey,list);
    }
  });
  editalIndex={items,byTopic,byMateria};
  editalIndexBuilds+=1;
  return editalIndex;
}

function getEditalIndex(){return editalIndex||buildEditalIndex()}
function invalidateEditalIndex(){editalIndex=null}
function findEditalItem(context={}){
  const index=getEditalIndex();
  editalIndexLookups+=1;
  const topicId=String(context.topicId||'').trim().toLowerCase();
  if(topicId){
    const direct=index.byTopic.get(topicId);
    if(direct)return direct.item;
  }
  const materia=String(context.materia||'').trim();
  const assunto=String(context.assunto||'').trim();
  if(materia||assunto){
    const direct=index.byTopic.get(normalizeKey(materia,assunto));
    if(direct)return direct.item;
  }
  return null;
}

function priorityForTopic(materia,assunto){
  const item=findEditalItem({materia,assunto});
  if(!item)return {editalPriority:null,topicPriority:null};
  const editalPriority=Number(item.prioridade);
  const topicPriority=Number(item.assunto_prioridade);
  return {
    editalPriority:Number.isFinite(editalPriority)?editalPriority:null,
    topicPriority:Number.isFinite(topicPriority)?topicPriority:null
  };
}

function buildTopicIndex(topics){
  const next=new Map();
  if(topics&&typeof topics==='object')Object.values(topics).filter(Boolean).forEach(state=>{
    const key=String(state?.key||normalizeKey(state?.materia,state?.assunto)).toLowerCase();
    if(key&&!next.has(key))next.set(key,state);
  });
  topicIndex=next;
  topicIndexBuilds+=1;
  return topicIndex;
}
function topicSnapshot(context={}){
  const key=String(context.topicId||normalizeKey(context.materia,context.assunto)).toLowerCase();
  const state=topicIndex.get(key);
  if(!state)return null;
  const priority=priorityForTopic(state?.materia,state?.assunto);
  return {materia:String(state?.materia||''),assunto:String(state?.assunto||''),retention:retentionForState(state),questionAccuracy:Number.isFinite(Number(state?.questionStats?.averageAccuracy))?Number(state.questionStats.averageAccuracy):state?.questionStats?.lastAccuracy,editalPriority:priority.editalPriority,topicPriority:priority.topicPriority,state};
}

function snapshot(){
  // Um único O(n) por snapshot substitui N buscas lineares durante o rebuild.
  buildEditalIndex(safeEdital());
  const userId=safeCurrentUserId();
  const contest=safeCurrentContest();
  const metadata=safeMetadata();
  const contestMeta=metadata?.[contest]||{};
  const sessions=Array.isArray(contestMeta?.studySessions)?contestMeta.studySessions:[];
  const topics=contestMeta?.retentionEngine?.topics;
  buildTopicIndex(topics);
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

global.AppCognitiveDataSource=Object.freeze({snapshot,topicSnapshot,buildTopicIndex,priorityForTopic,findEditalItem,buildEditalIndex,getEditalIndex,invalidateEditalIndex,indexDiagnostics:()=>Object.freeze({builds:editalIndexBuilds,lookups:editalIndexLookups,size:editalIndex?.byTopic?.size||0,topicBuilds:topicIndexBuilds,topicSize:topicIndex.size})});
})(window);

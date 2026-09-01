(function installStudyGuidanceEngine(global){
'use strict';
if(global.AppStudyGuidance)return;

const SCHEMA_VERSION=1;
const DEFAULT_TIMEOUT_MS=6500;
const providers=new Map();
let requestSequence=0;
let lastGuidance=null;

const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
const clean=(value,max=480)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const finite=value=>value==null||value===''?null:(Number.isFinite(Number(value))?Number(value):null);

function scope(context={}){
  let snapshot=null;
  try{snapshot=global.AppState?.getSnapshot?.('study-guidance')||null}catch(_){}
  return {
    userId:clean(context.userId||snapshot?.user?.id||global.currentUser?.id||'guest',120),
    contest:clean(context.contest||snapshot?.currentContest||global.currentConcurso||'Concurso Geral',180),
    snapshot
  };
}
function topicKey(item={}){
  if(item.topicId)return clean(item.topicId,640).toLowerCase();
  return `${clean(item.materia,180)}::${clean(item.assunto,400)}`.toLowerCase();
}
function readProfile(context={}){
  const current=scope(context);
  try{return global.AppCognitiveProfile?.read?.(current.userId,current.contest)||null}catch(_){return null}
}
function readEdital(){
  try{
    const fromState=global.AppState?.getEdital?.({all:true});
    if(Array.isArray(fromState))return fromState;
  }catch(_){}
  try{if(Array.isArray(global.allEditalItems))return [...global.allEditalItems]}catch(_){}
  try{if(Array.isArray(global.editalItems))return [...global.editalItems]}catch(_){}
  return [];
}
function findEditalItem(context={}){
  const items=readEdital();
  const requestedId=clean(context.topicId,640).toLowerCase();
  const requestedMateria=clean(context.materia,180).toLowerCase();
  const requestedAssunto=clean(context.assunto,400).toLowerCase();
  const filtered=items.filter(item=>{
    if(requestedId&&topicKey(item)!==requestedId)return false;
    if(requestedMateria&&clean(item?.materia,180).toLowerCase()!==requestedMateria)return false;
    if(requestedAssunto&&clean(item?.assunto,400).toLowerCase()!==requestedAssunto)return false;
    return true;
  });
  const source=filtered.length?filtered:items;
  return [...source].sort((a,b)=>{
    const pa=finite(a?.prioridade)??999;
    const pb=finite(b?.prioridade)??999;
    if(pa!==pb)return pa-pb;
    const ta=finite(a?.assunto_prioridade)??999;
    const tb=finite(b?.assunto_prioridade)??999;
    if(ta!==tb)return ta-tb;
    const wa=finite(a?.peso)??0;
    const wb=finite(b?.peso)??0;
    return wb-wa;
  })[0]||null;
}
function actionFromEdital(item={}){
  if(item.questoes)return 'questions';
  if(item.lei_seca)return 'lei_seca';
  if(item.videoaula)return 'videoaula';
  return 'teoria';
}
function normalizeRecommendation(recommendation,source='local_engine'){
  if(!recommendation)return null;
  const action=clean(recommendation.action||recommendation.method||recommendation.recommendedAction,80);
  const materia=clean(recommendation.materia,180);
  const assunto=clean(recommendation.assunto,400);
  if(!action||(!materia&&!assunto))return null;
  return {
    schemaVersion:SCHEMA_VERSION,
    source,
    authority:clean(recommendation.authority||'study-guidance',80),
    topicId:clean(recommendation.topicId||topicKey({materia,assunto}),640),
    materia,
    assunto,
    action,
    actionLabel:clean(recommendation.actionLabel||recommendation.methodLabel||action,120),
    suggestedMinutes:Math.max(5,Math.min(180,Number(recommendation.suggestedMinutes||recommendation.durationMinutes||25)||25)),
    confidence:clamp(recommendation.confidence??recommendation.priorityScore??50,0,100),
    editalPriority:finite(recommendation.editalPriority),
    topicPriority:finite(recommendation.topicPriority),
    recommendationScore:finite(recommendation.priorityScore??recommendation.recommendationScore),
    reasons:(Array.isArray(recommendation.reasons)?recommendation.reasons:[]).slice(0,6).map(value=>clean(value,220)).filter(Boolean),
    boardEvidence:recommendation.boardEvidence||null,
    errorType:clean(recommendation.errorType,100)||null,
    errorLabel:clean(recommendation.errorLabel,140)||null,
    fallbackReason:recommendation.fallbackReason?clean(recommendation.fallbackReason,240):null,
    aiUsed:Boolean(recommendation.aiUsed),
    provider:recommendation.provider?clean(recommendation.provider,120):null
  };
}
function cognitiveRecommendation(context={}){
  const profile=readProfile(context);
  const engine=global.AppNextBestStudyAction;
  if(!profile||!engine)return null;
  try{
    if(context.topicId&&typeof engine.scoreTopic==='function'){
      const state=profile.topicState?.[context.topicId]||Object.entries(profile.topicState||{}).find(([key])=>key===clean(context.topicId,640).toLowerCase())?.[1];
      if(state){
        const scored=engine.scoreTopic(profile,context.topicId,state,Date.now());
        return normalizeRecommendation({
          ...scored,
          priorityScore:scored.score,
          suggestedMinutes:engine.suggestedMinutes?.(profile,scored.score)||25,
          reasons:scored.factors,
          editalPriority:state.editalPriority,
          topicPriority:state.topicPriority,
          authority:'cognitive-profile'
        },'local_engine');
      }
    }
    const recommended=engine.recommend?.(profile)||engine.latest?.();
    if(!recommended)return null;
    const state=profile.topicState?.[recommended.topicId]||{};
    return normalizeRecommendation({
      ...recommended,
      editalPriority:recommended.editalPriority??state.editalPriority,
      topicPriority:recommended.topicPriority??state.topicPriority,
      authority:'cognitive-profile'
    },'local_engine');
  }catch(_){return null}
}
function advisorEnrichment(guidance){
  if(!guidance||!global.AppLearningAdvisor?.localIntervention)return guidance;
  try{
    const candidates=global.AppLearningAdvisor.collectCandidates?.(5)||[];
    const candidate=candidates.find(item=>item.topicId===guidance.topicId);
    if(!candidate)return guidance;
    const intervention=global.AppLearningAdvisor.localIntervention(candidate);
    if(!intervention)return guidance;
    return normalizeRecommendation({
      ...guidance,
      action:intervention.recommendedAction||guidance.action,
      actionLabel:intervention.recommendedAction||guidance.actionLabel,
      suggestedMinutes:intervention.suggestedMinutes||guidance.suggestedMinutes,
      reasons:[intervention.rationale,...(guidance.reasons||[])],
      authority:'learning-advisor-local'
    },guidance.source);
  }catch(_){return guidance}
}
function editalBaseline(context={}){
  const item=findEditalItem(context);
  if(!item)return null;
  const prioridade=finite(item.prioridade);
  const assuntoPrioridade=finite(item.assunto_prioridade);
  const peso=finite(item.peso);
  const reasons=[];
  if(prioridade!=null)reasons.push(`prioridade ${prioridade} no edital importado`);
  if(assuntoPrioridade!=null)reasons.push(`ordem ${assuntoPrioridade} dentro da matéria`);
  if(peso!=null)reasons.push(`peso ${peso}`);
  return normalizeRecommendation({
    topicId:topicKey(item),
    materia:item.materia,
    assunto:item.assunto,
    action:actionFromEdital(item),
    suggestedMinutes:25,
    confidence:prioridade===1?78:prioridade===2?68:58,
    editalPriority:prioridade,
    topicPriority:assuntoPrioridade,
    reasons:reasons.length?reasons:['ordem estratégica preservada do JSON importado'],
    authority:'imported-edital-json'
  },'json_baseline');
}
function contextualFallback(context={}){
  const materia=clean(context.materia,180);
  const assunto=clean(context.assunto,400);
  if(!materia&&!assunto)return null;
  return normalizeRecommendation({
    materia,
    assunto,
    action:clean(context.preferredAction||'short_review',80),
    suggestedMinutes:Number(context.availableMinutes)||15,
    confidence:35,
    reasons:['contexto atual preservado enquanto dados adaptativos estão indisponíveis'],
    authority:'current-study-context'
  },'context_fallback');
}
function local(context={}){
  return advisorEnrichment(cognitiveRecommendation(context))||editalBaseline(context)||contextualFallback(context);
}
function registerAiProvider(name,provider,options={}){
  if(typeof provider!=='function')throw new TypeError('AI provider must be a function');
  const key=clean(name||`provider-${providers.size+1}`,80);
  providers.set(key,{name:key,provider,priority:Number(options.priority)||0});
  return ()=>providers.delete(key);
}
function selectProvider(preferred){
  if(preferred&&providers.has(preferred))return providers.get(preferred);
  return [...providers.values()].sort((a,b)=>b.priority-a.priority)[0]||null;
}
function withTimeout(promise,timeoutMs){
  const timeout=Math.max(250,Number(timeoutMs)||DEFAULT_TIMEOUT_MS);
  return new Promise((resolve,reject)=>{
    const timer=global.setTimeout(()=>reject(new Error('ai_timeout')),timeout);
    Promise.resolve(promise).then(value=>{global.clearTimeout(timer);resolve(value)},error=>{global.clearTimeout(timer);reject(error)});
  });
}
function emit(name,detail){
  try{return global.AppStudyEvents?.emit?.(name,detail,{source:'study-guidance'})||null}catch(_){return null}
}
async function guide(context={},options={}){
  const requestId=`guidance-${Date.now().toString(36)}-${(++requestSequence).toString(36)}`;
  const baseline=local(context);
  const events=global.AppStudyEvents?.EVENTS||{};
  emit(events.GUIDANCE_REQUESTED||'study:guidance-requested',{requestId,context:{surface:clean(context.surface,80),topicId:clean(context.topicId,640),materia:clean(context.materia,180),assunto:clean(context.assunto,400)}});
  const finish=result=>{
    const finalResult=Object.freeze({...result,requestId,generatedAt:new Date().toISOString()});
    lastGuidance=finalResult;
    emit(events.GUIDANCE_RESOLVED||'study:guidance-resolved',finalResult);
    return finalResult;
  };
  const directProvider=typeof options.aiProvider==='function'?{name:clean(options.providerName||'inline-ai',80),provider:options.aiProvider}:selectProvider(options.provider);
  if(options.ai===false||!directProvider){
    if(!baseline)return finish({schemaVersion:SCHEMA_VERSION,source:'none',aiUsed:false,provider:null,fallbackReason:options.ai===false?'ai_disabled':'ai_provider_unavailable',reasons:[]});
    return finish({...baseline,aiUsed:false,provider:null,fallbackReason:options.ai===false?'ai_disabled':'ai_provider_unavailable'});
  }
  try{
    const current=scope(context);
    const raw=await withTimeout(directProvider.provider({context:{...context},baseline,current,profile:readProfile(context)}),options.timeoutMs);
    const normalized=normalizeRecommendation({...raw,aiUsed:true,provider:directProvider.name},'ai');
    if(!normalized)throw new Error('ai_invalid_payload');
    return finish({...normalized,aiUsed:true,provider:directProvider.name,fallbackReason:null});
  }catch(error){
    const reason=clean(error?.message||error||'ai_failure',180)||'ai_failure';
    if(!baseline)return finish({schemaVersion:SCHEMA_VERSION,source:'none',aiUsed:false,provider:directProvider.name,fallbackReason:reason,reasons:[]});
    return finish({...baseline,source:'local_fallback',aiUsed:false,provider:directProvider.name,fallbackReason:reason});
  }
}
function guideSync(context={}){
  const result=local(context);
  if(!result)return null;
  lastGuidance=Object.freeze({...result,aiUsed:false,provider:null,generatedAt:new Date().toISOString()});
  return lastGuidance;
}
function diagnostics(){
  return Object.freeze({schemaVersion:SCHEMA_VERSION,registeredProviders:[...providers.keys()],requests:requestSequence,lastSource:lastGuidance?.source||null,lastFallbackReason:lastGuidance?.fallbackReason||null});
}

global.AppStudyGuidance=Object.freeze({schemaVersion:SCHEMA_VERSION,local,guide,guideSync,registerAiProvider,normalizeRecommendation,findEditalItem,editalBaseline,diagnostics,last:()=>lastGuidance});
global.dispatchEvent?.(new CustomEvent('study:guidance-ready',{detail:{schemaVersion:SCHEMA_VERSION}}));
})(window);

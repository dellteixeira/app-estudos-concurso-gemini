(function installLearningAdvisorHeadless(global){
'use strict';
if(global.AppLearningAdvisorHeadless)return;

const ACTIONS=new Set(['active_recall','short_review','questions','focused_restudy']);
const SEVERITIES=new Set(['low','medium','high']);
const DIAGNOSIS_TYPES=new Set(['acquisition','retention','application','persistent','false_mastery','mixed']);
const TIMEOUT_MS=8000;
const FAILURE_WINDOW_MS=5*60*1000;
const COOLDOWN_MS=2*60*1000;
const FAILURE_THRESHOLD=3;
let failureTimes=[];
let blockedUntil=0;
let lastReason='';

function safe(value,max=500){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0))}
function getContest(){try{return typeof currentConcurso!=='undefined'?safe(currentConcurso,120):'Concurso Geral'}catch(_){return'Concurso Geral'}}
async function authToken(){try{const result=await global.supabaseClient?.auth?.getSession?.();return result?.data?.session?.access_token||''}catch(_){return''}}
function compactCandidate(candidate={}){return {topicId:safe(candidate.topicId,600),materia:safe(candidate.materia,180),assunto:safe(candidate.assunto,300),prioridade:clamp(candidate.prioridade,1,4),assuntoPrioridade:clamp(candidate.assuntoPrioridade,1,20),frictionScore:clamp(candidate.frictionScore,0,100),metrics:candidate.metrics||{},recommendationHistory:Array.isArray(candidate.recommendationHistory)?candidate.recommendationHistory.slice(-8):[]}}
function sanitizeIntervention(raw,candidate,local){
  if(!raw||safe(raw.topicId,600)!==safe(candidate.topicId,600))return local;
  const action=ACTIONS.has(raw.recommendedAction)?raw.recommendedAction:local.recommendedAction;
  return {topicId:candidate.topicId,recommendedAction:action,diagnosisType:DIAGNOSIS_TYPES.has(raw.diagnosisType)?raw.diagnosisType:local.diagnosisType,severity:SEVERITIES.has(raw.severity)?raw.severity:local.severity,suggestedMinutes:Math.round(clamp(raw.suggestedMinutes||local.suggestedMinutes,5,90)),rationale:safe(raw.rationale||local.rationale,500),method:safe(raw.method||local.method,500)};
}
function emitState(state,reason='',extra={}){try{global.dispatchEvent(new CustomEvent('adaptive-ai-provider-state',{detail:{state,reason:safe(reason,40),...extra}}))}catch(_){}}
function trimFailures(now=Date.now()){failureTimes=failureTimes.filter(at=>now-at<=FAILURE_WINDOW_MS)}
function providerState(){const now=Date.now();trimFailures(now);return {status:blockedUntil>now?'cooldown':'ready',blockedUntil:blockedUntil>now?blockedUntil:0,recentFailures:failureTimes.length,lastReason}}
function recordFailure(reason){const now=Date.now();trimFailures(now);failureTimes.push(now);lastReason=reason;if(reason==='rate_limited'||failureTimes.length>=FAILURE_THRESHOLD)blockedUntil=Math.max(blockedUntil,now+COOLDOWN_MS);emitState(blockedUntil>now?'cooldown':'fallback',reason,{blockedUntil:blockedUntil>now?blockedUntil:0,recentFailures:failureTimes.length})}
function recordSuccess(provider){failureTimes=[];blockedUntil=0;lastReason='';emitState('ready','',{provider:safe(provider,40)})}
function classifyFailure(error,response){
  if(error?.name==='AbortError')return'timeout';
  const status=Number(response?.status)||0;
  if(status===401||status===403)return'auth';
  if(status===429)return'rate_limited';
  if(status>=500)return'server';
  if(status>=400)return'http';
  return'network';
}
function localResult(reason,interventions,extra={}){return {aiUsed:false,provider:'local',fallbackReason:reason,interventions,...extra}}
async function recommend(options={}){
  const advisor=global.AppLearningAdvisor;
  if(!advisor?.collectCandidates||!advisor?.localIntervention)return localResult('advisor_unavailable',[]);
  let candidates=advisor.collectCandidates(options.limit||5)||[];
  if(options.topicId)candidates=candidates.filter(item=>safe(item.topicId,600)===safe(options.topicId,600));
  const local=candidates.map(candidate=>advisor.localIntervention(candidate)).filter(Boolean);
  if(!candidates.length)return localResult('no_candidates',[]);
  const now=Date.now();
  if(blockedUntil>now)return localResult('cooldown',local,{providerState:providerState()});
  const token=await authToken();
  if(!token)return localResult('session_unavailable',local);
  let response=null;
  const controller=typeof AbortController!=='undefined'?new AbortController():null;
  const timer=controller?setTimeout(()=>controller.abort(),TIMEOUT_MS):null;
  try{
    response=await fetch('/api/ai/learning-diagnosis',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${token}`},body:JSON.stringify({contest:getContest(),topics:candidates.map(compactCandidate)}),signal:controller?.signal});
    const data=await response.json().catch(()=>null);
    if(!response.ok){const reason=classifyFailure(null,response);recordFailure(reason);return localResult(reason,local,{status:Number(response.status)||0,providerState:providerState()})}
    if(!data||!Array.isArray(data.interventions)){recordFailure('invalid_response');return localResult('invalid_response',local,{providerState:providerState()})}
    const returned=data.interventions;
    let validCount=0;
    const interventions=candidates.map((candidate,index)=>{
      const raw=returned.find(item=>safe(item?.topicId,600)===safe(candidate.topicId,600));
      if(raw)validCount+=1;
      return sanitizeIntervention(raw,candidate,local[index]);
    }).filter(Boolean);
    if(validCount===0){recordFailure('invalid_response');return localResult('invalid_response',local,{providerState:providerState()})}
    const provider=safe(data?.provider||'gemini',40);
    recordSuccess(provider);
    return {aiUsed:Boolean(data?.aiUsed??true),provider,interventions,degraded:validCount<candidates.length,fallbackCount:Math.max(0,candidates.length-validCount)};
  }catch(error){const reason=classifyFailure(error,response);recordFailure(reason);return localResult(reason,local,{providerState:providerState()})}
  finally{if(timer)clearTimeout(timer)}
}
global.AppLearningAdvisorHeadless=Object.freeze({recommend,getProviderState:providerState,TIMEOUT_MS,FAILURE_THRESHOLD,COOLDOWN_MS});
})(window);

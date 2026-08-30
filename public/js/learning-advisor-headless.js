(function installLearningAdvisorHeadless(global){
'use strict';
if(global.AppLearningAdvisorHeadless)return;

const ACTIONS=new Set(['active_recall','short_review','questions','focused_restudy']);
const SEVERITIES=new Set(['low','medium','high']);
const DIAGNOSIS_TYPES=new Set(['acquisition','retention','application','persistent','false_mastery','mixed']);
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
async function recommend(options={}){
  const advisor=global.AppLearningAdvisor;
  if(!advisor?.collectCandidates||!advisor?.localIntervention)return {aiUsed:false,provider:'local',fallbackReason:'advisor indisponível',interventions:[]};
  let candidates=advisor.collectCandidates(options.limit||5)||[];
  if(options.topicId)candidates=candidates.filter(item=>safe(item.topicId,600)===safe(options.topicId,600));
  const local=candidates.map(candidate=>advisor.localIntervention(candidate)).filter(Boolean);
  if(!candidates.length)return {aiUsed:false,provider:'local',fallbackReason:'sem candidatos',interventions:[]};
  const token=await authToken();
  if(!token)return {aiUsed:false,provider:'local',fallbackReason:'sessão indisponível',interventions:local};
  try{
    const response=await fetch('/api/ai/learning-diagnosis',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${token}`},body:JSON.stringify({contest:getContest(),topics:candidates.map(compactCandidate)})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error('provider-unavailable');
    const returned=Array.isArray(data?.interventions)?data.interventions:[];
    const interventions=candidates.map((candidate,index)=>sanitizeIntervention(returned.find(item=>safe(item?.topicId,600)===safe(candidate.topicId,600)),candidate,local[index])).filter(Boolean);
    return {aiUsed:Boolean(data?.aiUsed??true),provider:safe(data?.provider||'gemini',40),interventions};
  }catch(_){return {aiUsed:false,provider:'local',fallbackReason:'consulta indisponível',interventions:local}}
}
global.AppLearningAdvisorHeadless=Object.freeze({recommend});
})(window);

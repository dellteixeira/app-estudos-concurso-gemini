const DEFAULT_PRIMARY_MODEL='gemini-3.6-flash';
const TASK_PROFILES={
  learning_diagnosis:{defaultTier:'fast',maxTier:'standard'},
  contextual_tutor:{defaultTier:'standard',maxTier:'reasoning'}
};
const TIER_ORDER={fast:0,standard:1,reasoning:2};
const clean=(value,max=240)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const clampTier=(tier,maxTier)=>TIER_ORDER[tier]<=TIER_ORDER[maxTier]?tier:maxTier;

function configuredModels(env={}){
  const primary=clean(env.GEMINI_PRIMARY_MODEL||DEFAULT_PRIMARY_MODEL,120)||DEFAULT_PRIMARY_MODEL;
  return {
    fast:clean(env.GEMINI_FAST_MODEL,120)||primary,
    standard:clean(env.GEMINI_STANDARD_MODEL,120)||primary,
    reasoning:clean(env.GEMINI_REASONING_MODEL,120)||primary,
    primary
  };
}

function hasFreshnessOrAuthorityRisk(text=''){
  return /\b(atual|hoje|recente|jurisprud[eê]ncia|s[uú]mula|lei|artigo|decreto|resolu[cç][aã]o|edital|banca|fonte|precedente|stf|stj|tst|tse|cnj)\b/i.test(text);
}

function contextualComplexity(question,context={}){
  let score=0;
  const q=clean(question,1600);
  if(q.length>=500)score+=2;else if(q.length>=240)score+=1;
  if(/\b(compare|diferencie|explique por que|fundamente|analise|relacione|pegadinha|caso concreto)\b/i.test(q))score+=1;
  if(hasFreshnessOrAuthorityRisk(q))score+=2;
  if(context?.recurringError?.severity>=70)score+=1;
  if(context?.nextBestAction?.score>=80)score+=1;
  if(Array.isArray(context?.methodEvidence)&&context.methodEvidence.length>=4)score+=1;
  if(context?.boardEvidence?.sampleSize>=50)score+=1;
  return score;
}

export function routeAiModel(env,task,input={}){
  const profile=TASK_PROFILES[task]||{defaultTier:'standard',maxTier:'standard'};
  const models=configuredModels(env);
  let tier=profile.defaultTier;
  let reason='default-task-profile';
  let risk='normal';

  if(task==='learning_diagnosis'){
    const topicCount=Array.isArray(input?.topics)?input.topics.length:0;
    const highFriction=(Array.isArray(input?.topics)?input.topics:[]).filter(topic=>Number(topic?.frictionScore)>=70).length;
    if(topicCount>=4&&highFriction>=2){tier='standard';reason='multi-topic-high-friction'}
    else{tier='fast';reason='bounded-classification-task'}
  }else if(task==='contextual_tutor'){
    const score=contextualComplexity(input?.question,input?.context);
    if(score>=5){tier='reasoning';reason='high-context-complexity'}
    else if(score>=2){tier='standard';reason='moderate-context-complexity'}
    else{tier='fast';reason='simple-contextual-question'}
    if(hasFreshnessOrAuthorityRisk(input?.question)){risk='source-sensitive';reason=`${reason}+source-sensitive`}
  }

  tier=clampTier(tier,profile.maxTier);
  const model=models[tier]||models.primary;
  const configuredAlternative=model!==models.primary;
  return {
    routerVersion:'1.0.0',task,tier,model,reason,risk,
    configuredAlternative,
    fallbackModel:models.primary,
    authority:'retention-engine',
    autoSchedule:false
  };
}

export function modelEndpoint(model){
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(clean(model,120)||DEFAULT_PRIMARY_MODEL)}:generateContent`;
}

export const AI_ROUTER_DEFAULT_MODEL=DEFAULT_PRIMARY_MODEL;

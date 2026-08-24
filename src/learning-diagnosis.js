const GEMINI_MODEL='gemini-3.6-flash';
const MAX_TOPICS=5;
const MAX_BODY_BYTES=32*1024;
const TIMEOUT_MS=10000;
const DIAGNOSIS_TYPES=new Set(['acquisition','retention','application','persistent','false_mastery','mixed']);
const SEVERITIES=new Set(['low','medium','high']);
const ACTIONS=new Set(['active_recall','short_review','questions','focused_restudy','flashcards','compare_map','law_reading']);

const clean=(value,max=500)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
function responseJson(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...headers}})}

async function authenticate(request,env){
  const authorization=request.headers.get('authorization')||'';
  if(!authorization.startsWith('Bearer ')||!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY)return null;
  const response=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{authorization,apikey:env.SUPABASE_ANON_KEY}});
  if(!response.ok)return null;
  return response.json();
}

function sanitizeTopic(raw){
  const topicId=clean(raw?.topicId,600),materia=clean(raw?.materia,180),assunto=clean(raw?.assunto,300);
  if(!topicId||!materia||!assunto)return null;
  const m=raw?.metrics||{};
  return {
    topicId,materia,assunto,
    prioridade:clamp(raw?.prioridade,1,4)||2,
    assuntoPrioridade:clamp(raw?.assuntoPrioridade,1,20)||1,
    frictionScore:clamp(raw?.frictionScore,0,100),
    metrics:{
      retention:clamp(m.retention,0,100),
      accuracy:m.accuracy==null?null:clamp(m.accuracy,0,100),
      confidence:clamp(m.confidence,0,1),
      lapseCount:clamp(m.lapseCount,0,30),
      reviewCount:clamp(m.reviewCount,0,60),
      sessionCount:clamp(m.sessionCount,0,120),
      totalMinutes:clamp(m.totalMinutes,0,20000),
      difficulty:clamp(m.difficulty,1,10)||5,
      forgot:Boolean(m.forgot),
      acquired:Boolean(m.acquired)
    }
  };
}

function deterministicIntervention(topic){
  const m=topic.metrics;
  let diagnosisType='mixed',recommendedAction='active_recall',method='Explique o assunto sem consultar material e depois confira as lacunas.',minutes=10;
  if((m.forgot||m.retention<42)&&m.reviewCount>=2){diagnosisType='persistent';recommendedAction='focused_restudy';method='Reconstrua somente os conceitos que continuam falhando e teste a recuperação logo depois.';minutes=30}
  else if(m.acquired&&m.accuracy!=null&&m.accuracy<55&&m.confidence>=.2){diagnosisType='application';recommendedAction='questions';method='Resolva uma bateria curta de questões comentadas, classificando o motivo de cada erro.';minutes=25}
  else if(m.acquired&&m.accuracy!=null&&m.accuracy<50&&m.retention>=70){diagnosisType='false_mastery';recommendedAction='questions';method='Troque leitura passiva por questões e recuperação ativa até o desempenho acompanhar a retenção estimada.';minutes=25}
  else if(m.retention<65){diagnosisType='retention';recommendedAction=m.sessionCount>=3?'active_recall':'short_review';method=m.sessionCount>=3?'Use recuperação ativa espaçada em vez de repetir a mesma leitura.':'Faça uma revisão curta e imediatamente tente recuperar sem consulta.';minutes=15}
  else if(!m.acquired||m.sessionCount<=1){diagnosisType='acquisition';recommendedAction='focused_restudy';method='Faça uma primeira construção conceitual focalizada e finalize com recuperação sem consulta.';minutes=25}
  const severity=topic.frictionScore>=70?'high':topic.frictionScore>=50?'medium':'low';
  return {topicId:topic.topicId,diagnosisType,severity,recommendedAction,suggestedMinutes:minutes,method,rationale:`Fricção ${Math.round(topic.frictionScore)}/100; retenção ${Math.round(m.retention)}%${m.accuracy==null?'':`; questões ${Math.round(m.accuracy)}%`}. A recomendação é consultiva e deve ser validada pelo motor local.`};
}

function validateIntervention(raw,topic){
  if(!raw||clean(raw.topicId,600)!==topic.topicId)return deterministicIntervention(topic);
  const fallback=deterministicIntervention(topic);
  return {
    topicId:topic.topicId,
    diagnosisType:DIAGNOSIS_TYPES.has(raw.diagnosisType)?raw.diagnosisType:fallback.diagnosisType,
    severity:SEVERITIES.has(raw.severity)?raw.severity:fallback.severity,
    recommendedAction:ACTIONS.has(raw.recommendedAction)?raw.recommendedAction:fallback.recommendedAction,
    suggestedMinutes:Math.round(clamp(raw.suggestedMinutes,5,45)||fallback.suggestedMinutes),
    method:clean(raw.method,360)||fallback.method,
    rationale:clean(raw.rationale,420)||fallback.rationale
  };
}

function parseGemini(payload){
  const candidates=Array.isArray(payload?.candidates)?payload.candidates:[];
  for(const candidate of candidates){
    const text=(Array.isArray(candidate?.content?.parts)?candidate.content.parts:[]).map(p=>typeof p?.text==='string'?p.text:'').join('\n').trim();
    if(!text)continue;
    try{return JSON.parse(text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''))}catch(_){}
  }
  return null;
}

async function runGemini(env,contest,topics){
  if(!env.GEMINI_API_KEY)throw new Error('GEMINI_API_KEY não configurada');
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const system=`Você é um consultor pedagógico para preparação de concursos públicos. Você NÃO controla o cronograma, NÃO altera prioridades, NÃO cria assuntos e NÃO diagnostica condições médicas. O Retention Engine determinístico é a autoridade. Sua única função é interpretar métricas já calculadas e sugerir UMA intervenção de estudo por tópico. Seja conservador, objetivo e use somente os dados fornecidos. Nunca recomende excluir conteúdo. Retorne apenas JSON no schema solicitado.`;
  const body={systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:`Concurso: ${clean(contest,180)||'não informado'}\nTópicos já selecionados pelo Retention Engine:\n${JSON.stringify(topics)}\n\nClassifique o tipo de dificuldade e sugira a mudança de método com maior utilidade provável. Não modifique topicId.`}]}],generationConfig:{temperature:.1,maxOutputTokens:2200,responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{interventions:{type:'ARRAY',items:{type:'OBJECT',properties:{topicId:{type:'STRING'},diagnosisType:{type:'STRING',enum:[...DIAGNOSIS_TYPES]},severity:{type:'STRING',enum:[...SEVERITIES]},recommendedAction:{type:'STRING',enum:[...ACTIONS]},suggestedMinutes:{type:'INTEGER',minimum:5,maximum:45},method:{type:'STRING'},rationale:{type:'STRING'}},required:['topicId','diagnosisType','severity','recommendedAction','suggestedMinutes','method','rationale']}}},required:['interventions']},thinkingConfig:{thinkingLevel:'LOW'}}};
  try{
    const response=await fetch(endpoint,{method:'POST',signal:controller.signal,headers:{'content-type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify(body)});
    if(!response.ok)throw new Error(`Gemini HTTP ${response.status}`);
    const parsed=parseGemini(await response.json());
    if(!parsed||!Array.isArray(parsed.interventions))throw new Error('Resposta Gemini inválida');
    return parsed.interventions;
  }finally{clearTimeout(timeout)}
}

export async function handleLearningDiagnosis(request,env){
  if(request.method!=='POST')return responseJson({error:'Método não permitido.'},405);
  const user=await authenticate(request,env);
  if(!user?.id)return responseJson({error:'Sessão inválida ou expirada.'},401);
  if(env.AI_RATE_LIMITER?.limit){const {success}=await env.AI_RATE_LIMITER.limit({key:`${user.id}:learning-diagnosis`});if(!success)return responseJson({error:'Muitas análises em sequência. Aguarde um minuto.'},429,{'retry-after':'60'})}
  const declared=Number(request.headers.get('content-length')||0);if(declared>MAX_BODY_BYTES)return responseJson({error:'Requisição excede o limite de segurança.'},413);
  let body;try{const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)return responseJson({error:'Requisição excede o limite de segurança.'},413);body=JSON.parse(raw)}catch(_){return responseJson({error:'Corpo JSON inválido.'},400)}
  const topics=(Array.isArray(body?.topics)?body.topics:[]).slice(0,MAX_TOPICS).map(sanitizeTopic).filter(Boolean);
  if(!topics.length)return responseJson({error:'Nenhum ponto crítico válido foi enviado.'},422);
  const fallback=topics.map(deterministicIntervention);
  let interventions=fallback,aiUsed=false;
  try{
    const raw=await runGemini(env,body?.contest,topics);
    const byId=new Map(raw.map(item=>[clean(item?.topicId,600),item]));
    interventions=topics.map(topic=>validateIntervention(byId.get(topic.topicId),topic));
    aiUsed=true;
  }catch(error){console.warn('Learning Advisor Gemini fallback:',error?.message||error)}
  return responseJson({advisorVersion:'1.0.0',advisorRole:'auxiliary',authority:'retention-engine',autoSchedule:false,provider:aiUsed?'gemini':'local-deterministic',model:aiUsed?GEMINI_MODEL:'local',aiUsed,interventions});
}

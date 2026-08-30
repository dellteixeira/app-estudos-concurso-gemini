import { classifyAiError, createAiObservationTimer } from './ai-observability.js';

const GEMINI_MODEL='gemini-3.6-flash';
const MAX_TOPICS=5;
const MAX_BODY_BYTES=32*1024;
const TIMEOUT_MS=10000;
const DIAGNOSIS_TYPES=new Set(['acquisition','retention','application','persistent','false_mastery','mixed']);
const SEVERITIES=new Set(['low','medium','high']);
const SELECTOR_ACTIONS=new Set(['active_recall','short_review','questions','focused_restudy']);

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

function sanitizeRecommendationHistory(raw){
  return (Array.isArray(raw)?raw:[]).slice(-8).map(item=>({
    action:SELECTOR_ACTIONS.has(item?.action)?item.action:'',
    at:clean(item?.at,40),
    source:clean(item?.source,30)||'advisor'
  })).filter(item=>item.action);
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
    recommendationHistory:sanitizeRecommendationHistory(raw?.recommendationHistory),
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

const ACTION_METHODS={
  active_recall:{minutes:12,method:'Explique o assunto sem consultar material, liste as lacunas e só então confira a fonte.'},
  short_review:{minutes:15,method:'Faça uma revisão curta dos pontos-chave e imediatamente tente recuperar o conteúdo sem consulta.'},
  questions:{minutes:25,method:'Resolva uma bateria curta de questões comentadas e classifique o motivo de cada erro antes de revisar.'},
  focused_restudy:{minutes:30,method:'Reconstrua apenas os conceitos que continuam falhando e finalize com um teste de recuperação sem consulta.'}
};

function actionScores(topic){
  const m=topic.metrics;
  const scores={active_recall:26,short_review:22,questions:20,focused_restudy:20};
  if(m.sessionCount>=2)scores.active_recall+=14;
  if(m.retention>=45&&m.retention<82)scores.active_recall+=14;
  if(m.reviewCount>=2)scores.active_recall+=6;
  if(m.retention<68)scores.short_review+=18;
  if(m.sessionCount<=2)scores.short_review+=10;
  if(!m.forgot)scores.short_review+=4;
  if(m.accuracy!=null)scores.questions+=(100-m.accuracy)*0.34;
  if(m.acquired)scores.questions+=8;
  if(m.confidence>=.2&&m.accuracy!=null&&m.accuracy<60)scores.questions+=8;
  if(m.forgot)scores.focused_restudy+=22;
  if(m.retention<45)scores.focused_restudy+=18;
  if(m.reviewCount>=2&&m.retention<65)scores.focused_restudy+=10;
  if(!m.acquired)scores.focused_restudy+=12;
  if(m.lapseCount>=2)scores.focused_restudy+=8;
  const now=Date.now();
  topic.recommendationHistory.forEach((entry,index,history)=>{
    const age=Date.parse(entry.at);
    const ageHours=Number.isFinite(age)?Math.max(0,(now-age)/36e5):999;
    let penalty=ageHours<24?24:ageHours<72?14:7;
    if(index===history.length-1)penalty+=34;
    scores[entry.action]-=penalty;
  });
  return scores;
}

function diagnosisForAction(topic,action){
  const m=topic.metrics;
  if((m.forgot||m.retention<42)&&m.reviewCount>=2)return'persistent';
  if(m.acquired&&m.accuracy!=null&&m.accuracy<55&&m.confidence>=.2)return m.retention>=70?'false_mastery':'application';
  if(action==='questions')return'application';
  if(action==='focused_restudy'&&(!m.acquired||m.sessionCount<=1))return'acquisition';
  if(m.retention<70)return'retention';
  return'mixed';
}

function deterministicIntervention(topic){
  const scores=actionScores(topic);
  const ranked=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
  const lastAction=topic.recommendationHistory.at(-1)?.action||'';
  let selected=ranked[0]?.[0]||'active_recall';
  if(lastAction&&selected===lastAction){const alternate=ranked.find(([action])=>action!==lastAction);if(alternate)selected=alternate[0]}
  const preset=ACTION_METHODS[selected]||ACTION_METHODS.active_recall;
  const m=topic.metrics;
  const diagnosisType=diagnosisForAction(topic,selected);
  const severity=topic.frictionScore>=70?'high':topic.frictionScore>=50?'medium':'low';
  const prior=lastAction?` O último método sugerido foi ${lastAction}; a repetição imediata recebeu penalidade.`:'';
  return {topicId:topic.topicId,diagnosisType,severity,recommendedAction:selected,suggestedMinutes:preset.minutes,method:preset.method,rationale:`Fricção ${Math.round(topic.frictionScore)}/100; retenção ${Math.round(m.retention)}%${m.accuracy==null?'':`; questões ${Math.round(m.accuracy)}%`}.${prior}`};
}

function validateIntervention(raw,topic){
  const fallback=deterministicIntervention(topic);
  if(!raw||clean(raw.topicId,600)!==topic.topicId)return fallback;
  const lastAction=topic.recommendationHistory.at(-1)?.action||'';
  const aiAction=SELECTOR_ACTIONS.has(raw.recommendedAction)?raw.recommendedAction:fallback.recommendedAction;
  if(lastAction&&aiAction===lastAction)return fallback;
  return {topicId:topic.topicId,diagnosisType:DIAGNOSIS_TYPES.has(raw.diagnosisType)?raw.diagnosisType:fallback.diagnosisType,severity:SEVERITIES.has(raw.severity)?raw.severity:fallback.severity,recommendedAction:aiAction,suggestedMinutes:Math.round(clamp(raw.suggestedMinutes,5,45)||fallback.suggestedMinutes),method:clean(raw.method,360)||fallback.method,rationale:clean(raw.rationale,420)||fallback.rationale};
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
  const system=`Você é o seletor pedagógico auxiliar do Estudo Adaptativo Inteligente. O Retention Engine determinístico continua sendo a autoridade sobre risco, prioridade e cronograma. A IA NÃO controla o cronograma. Para cada tópico, escolha exatamente UM entre quatro métodos existentes: active_recall, short_review, questions ou focused_restudy. Use retenção, desempenho em questões, lapsos, esforço, aquisição e recommendationHistory. NÃO repita o método mais recente do histórico quando houver alternativa pedagogicamente adequada. A recomendação já exibida conta como histórico mesmo que o usuário não tenha iniciado a sessão. Você NÃO cria assuntos, NÃO altera prioridades, NÃO agenda revisões e NÃO diagnostica condições médicas. Retorne apenas JSON no schema solicitado.`;
  const body={systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:`Concurso: ${clean(contest,180)||'não informado'}\nTópicos já selecionados pelo Retention Engine:\n${JSON.stringify(topics)}\n\nEscolha a intervenção com maior utilidade provável, levando em conta explicitamente o histórico de recomendações. Não modifique topicId.`}]}],generationConfig:{temperature:.25,maxOutputTokens:2200,responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{interventions:{type:'ARRAY',items:{type:'OBJECT',properties:{topicId:{type:'STRING'},diagnosisType:{type:'STRING',enum:[...DIAGNOSIS_TYPES]},severity:{type:'STRING',enum:[...SEVERITIES]},recommendedAction:{type:'STRING',enum:[...SELECTOR_ACTIONS]},suggestedMinutes:{type:'INTEGER',minimum:5,maximum:45},method:{type:'STRING'},rationale:{type:'STRING'}},required:['topicId','diagnosisType','severity','recommendedAction','suggestedMinutes','method','rationale']}}},required:['interventions']},thinkingConfig:{thinkingLevel:'LOW'}}};
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
  const finishObservation=createAiObservationTimer({feature:'learning-advisor',provider:'gemini',model:GEMINI_MODEL,itemCount:topics.length});
  let interventions=fallback,aiUsed=false,observation;
  try{
    const raw=await runGemini(env,body?.contest,topics);
    const byId=new Map(raw.map(item=>[clean(item?.topicId,600),item]));
    interventions=topics.map(topic=>validateIntervention(byId.get(topic.topicId),topic));
    aiUsed=true;
    observation=finishObservation({outcome:'success',fallback:'none',errorClass:'none'});
  }catch(error){
    const errorClass=classifyAiError(error);
    const fallbackType=errorClass==='timeout'?'timeout-fallback':'local-deterministic';
    observation=finishObservation({outcome:'fallback',fallback:fallbackType,errorClass});
    console.warn('Learning Advisor Gemini fallback:',errorClass);
  }
  return responseJson({advisorVersion:'1.3.0',advisorRole:'auxiliary',authority:'retention-engine',autoSchedule:false,provider:aiUsed?'gemini':'local-deterministic',model:aiUsed?GEMINI_MODEL:'local',aiUsed,antiRepeat:true,observability:observation,interventions});
}

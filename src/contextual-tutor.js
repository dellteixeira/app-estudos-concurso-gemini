import { routeAiModel, modelEndpoint } from './ai-model-router.js';

const MAX_BODY_BYTES=32*1024;
const TIMEOUT_MS=10000;
const clean=(value,max=500)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});

async function authenticate(request,env){
  const authorization=request.headers.get('authorization')||'';
  if(!authorization.startsWith('Bearer ')||!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY)return null;
  const response=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{authorization,apikey:env.SUPABASE_ANON_KEY}});
  if(!response.ok)return null;
  return response.json();
}
function sanitizeContext(raw){
  const topic=raw?.topic||{};
  const sanitized={
    schemaVersion:1,tutorRole:'advisory',authority:'retention-engine',autoSchedule:false,
    contest:clean(raw?.contest,180),
    topic:{
      topicId:clean(topic.topicId,600),materia:clean(topic.materia,180),assunto:clean(topic.assunto,300),
      retention:clamp(topic.retention,0,100),accuracy:topic.accuracy==null?null:clamp(topic.accuracy,0,100),confidence:clamp(topic.confidence,0,1),
      lapseCount:clamp(topic.lapseCount,0,30),reviewCount:clamp(topic.reviewCount,0,60),difficulty:clamp(topic.difficulty,1,10)||5,lastRating:clean(topic.lastRating,30)
    },
    recurringError:null,nextBestAction:null,boardEvidence:null,methodEvidence:[]
  };
  if(raw?.recurringError)sanitized.recurringError={type:clean(raw.recurringError.type,40),severity:clamp(raw.recurringError.severity,0,100),reason:clean(raw.recurringError.reason,360)};
  if(raw?.nextBestAction)sanitized.nextBestAction={score:clamp(raw.nextBestAction.score,0,100),method:clean(raw.nextBestAction.method,80),minutes:clamp(raw.nextBestAction.minutes,0,180),reasons:(Array.isArray(raw.nextBestAction.reasons)?raw.nextBestAction.reasons:[]).slice(0,6).map(v=>clean(v,220))};
  if(raw?.boardEvidence?.source)sanitized.boardEvidence={board:clean(raw.boardEvidence.board,80),incidence:clamp(raw.boardEvidence.incidence,0,100),confidence:clamp(raw.boardEvidence.confidence,0,1),sampleSize:clamp(raw.boardEvidence.sampleSize,0,100000),source:clean(raw.boardEvidence.source,240),asOf:clean(raw.boardEvidence.asOf,40)};
  sanitized.methodEvidence=(Array.isArray(raw?.methodEvidence)?raw.methodEvidence:[]).slice(0,8).map(item=>({method:clean(item?.method,60),score:clamp(item?.score,0,100),sampleSize:clamp(item?.sampleSize,0,10000)})).filter(item=>item.method);
  if(!sanitized.topic.topicId||(!sanitized.topic.materia&&!sanitized.topic.assunto))return null;
  return sanitized;
}
function fallbackAnswer(question,context){
  const t=context.topic,e=context.recurringError,a=context.nextBestAction;
  const signals=[];
  if(t.retention||t.retention===0)signals.push(`retenção ${Math.round(t.retention)}%`);
  if(t.accuracy!=null)signals.push(`acerto em questões ${Math.round(t.accuracy)}%`);
  if(e?.type)signals.push(`padrão de erro ${e.type}`);
  if(a?.method)signals.push(`método prioritário ${a.method}`);
  const guidance=e?.type==='application'?'Faça 3 a 5 questões e explique por que cada alternativa está certa ou errada.':e?.type==='forgetting'?'Tente recuperar os pontos principais sem consulta; só depois confira a fonte e corrija as lacunas.':e?.type==='false_mastery'||e?.type==='overconfidence'?'Teste o conteúdo com questões antes de reler a teoria; use os erros para localizar o falso domínio.':e?.type==='persistent'?'Reestude apenas o subponto que continua falhando e finalize com um teste de recuperação.':'Comece com recuperação ativa curta e valide em questões.';
  return `Para ${t.materia?`${t.materia} — `:''}${t.assunto}, os sinais disponíveis são: ${signals.join(', ')||'contexto ainda limitado'}. ${guidance} Sua pergunta foi: “${clean(question,300)}”. O Tutor não altera o cronograma; a prioridade continua sob autoridade do Retention Engine.`;
}
function parseGemini(payload){
  for(const candidate of Array.isArray(payload?.candidates)?payload.candidates:[]){
    const text=(Array.isArray(candidate?.content?.parts)?candidate.content.parts:[]).map(p=>typeof p?.text==='string'?p.text:'').join('\n').trim();
    if(text)return clean(text,6000);
  }
  return'';
}
async function runGeminiModel(env,question,context,model){
  if(!env.GEMINI_API_KEY)throw new Error('GEMINI_API_KEY não configurada');
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  const system=`Você é o Tutor Contextual do Estudo Adaptativo. Use somente o contexto JSON fornecido e conhecimento geral estável necessário para explicar o assunto solicitado. Não invente métricas, histórico de banca, jurisprudência, lei, estatística, fonte ou dado pessoal. Se o usuário pedir fato atual, jurisprudência específica, literalidade legal ou informação que não esteja no contexto, diga que o contexto não é suficiente e peça fonte/consulta apropriada em vez de inventar. O Retention Engine é a autoridade sobre prioridade e cronograma: você nunca agenda, remarca, altera retenção, prioridade ou datas. Explique de modo didático, destaque o padrão de erro medido quando existir e proponha no máximo uma microintervenção compatível com o nextBestAction e methodEvidence. Não diagnostique condições médicas ou psicológicas. Responda em português do Brasil, de forma objetiva.`;
  const body={systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:`Pergunta: ${question}\nContexto medido pelo app:\n${JSON.stringify(context)}`}]}],generationConfig:{temperature:.2,maxOutputTokens:1200}};
  try{
    const response=await fetch(modelEndpoint(model),{method:'POST',signal:controller.signal,headers:{'content-type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify(body)});
    if(!response.ok)throw new Error(`Gemini HTTP ${response.status}`);
    const answer=parseGemini(await response.json());if(!answer)throw new Error('Resposta Gemini vazia');return answer;
  }finally{clearTimeout(timeout)}
}
async function runRoutedGemini(env,question,context,route){
  try{return {answer:await runGeminiModel(env,question,context,route.model),model:route.model,modelFallback:false}}
  catch(error){
    if(route.model===route.fallbackModel)throw error;
    console.warn('Contextual Tutor model fallback:',error?.message||error);
    return {answer:await runGeminiModel(env,question,context,route.fallbackModel),model:route.fallbackModel,modelFallback:true};
  }
}
export async function handleContextualTutor(request,env){
  if(request.method!=='POST')return json({error:'Método não permitido.'},405);
  const user=await authenticate(request,env);if(!user?.id)return json({error:'Sessão inválida ou expirada.'},401);
  if(env.AI_RATE_LIMITER?.limit){const {success}=await env.AI_RATE_LIMITER.limit({key:`${user.id}:contextual-tutor`});if(!success)return json({error:'Muitas consultas em sequência. Aguarde um minuto.'},429)}
  const declared=Number(request.headers.get('content-length')||0);if(declared>MAX_BODY_BYTES)return json({error:'Requisição excede o limite de segurança.'},413);
  let body;try{const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)return json({error:'Requisição excede o limite de segurança.'},413);body=JSON.parse(raw)}catch(_){return json({error:'Corpo JSON inválido.'},400)}
  const question=clean(body?.question,1200),context=sanitizeContext(body?.context);if(!question||!context)return json({error:'Pergunta ou contexto inválido.'},422);
  const routing=routeAiModel(env,'contextual_tutor',{question,context});
  let answer,aiUsed=false,usedModel='local',modelFallback=false;
  try{const result=await runRoutedGemini(env,question,context,routing);answer=result.answer;usedModel=result.model;modelFallback=result.modelFallback;aiUsed=true}catch(error){console.warn('Contextual Tutor fallback:',error?.message||error);answer=fallbackAnswer(question,context)}
  return json({tutorVersion:'1.1.0',tutorRole:'advisory',authority:'retention-engine',autoSchedule:false,provider:aiUsed?'gemini':'local-deterministic',model:aiUsed?usedModel:'local',aiUsed,modelFallback,route:{tier:routing.tier,reason:routing.reason,risk:routing.risk,routerVersion:routing.routerVersion},answer,contextAccepted:true});
}
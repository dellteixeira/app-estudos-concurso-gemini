const ALLOWED_FEATURES=new Set(['learning-advisor','flashcards','edital-analysis','unknown']);
const ALLOWED_PROVIDERS=new Set(['gemini','workers-ai','local-deterministic','unknown']);
const ALLOWED_OUTCOMES=new Set(['success','fallback','error']);
const ALLOWED_FALLBACKS=new Set(['none','local-deterministic','provider-fallback','validation-fallback','timeout-fallback']);

const clampText=(value,max=80)=>String(value??'').replace(/[^a-zA-Z0-9._:/-]/g,'_').slice(0,max)||'unknown';
const clampMs=value=>Math.max(0,Math.min(120000,Math.round(Number(value)||0)));

export function classifyAiError(error){
  const message=String(error?.message||error||'').toLowerCase();
  if(error?.name==='AbortError'||message.includes('abort')||message.includes('timeout'))return'timeout';
  if(message.includes('429')||message.includes('rate'))return'rate_limited';
  if(message.includes('401')||message.includes('403')||message.includes('api_key'))return'auth_or_config';
  if(message.includes('invalid')||message.includes('inválid')||message.includes('schema')||message.includes('parse'))return'invalid_response';
  if(message.includes('http_5')||message.includes('http 5'))return'provider_5xx';
  if(message.includes('http_4')||message.includes('http 4'))return'provider_4xx';
  return'provider_error';
}

export function buildAiObservation(input={}){
  const feature=ALLOWED_FEATURES.has(input.feature)?input.feature:'unknown';
  const provider=ALLOWED_PROVIDERS.has(input.provider)?input.provider:'unknown';
  const outcome=ALLOWED_OUTCOMES.has(input.outcome)?input.outcome:'error';
  const fallback=ALLOWED_FALLBACKS.has(input.fallback)?input.fallback:'none';
  return Object.freeze({
    schemaVersion:1,
    feature,
    provider,
    model:clampText(input.model,80),
    outcome,
    fallback,
    latencyMs:clampMs(input.latencyMs),
    errorClass:outcome==='error'||outcome==='fallback'?clampText(input.errorClass||'none',48):'none',
    attempt:Math.max(1,Math.min(8,Math.round(Number(input.attempt)||1))),
    itemCount:Math.max(0,Math.min(100,Math.round(Number(input.itemCount)||0)))
  });
}

export function emitAiObservation(input={},logger=console){
  const event=buildAiObservation(input);
  const sink=event.outcome==='error'?(logger?.warn||logger?.log):(logger?.info||logger?.log);
  if(typeof sink==='function')sink.call(logger,'AI_OBSERVABILITY',event);
  return event;
}

export function createAiObservationTimer(base={}){
  const startedAt=Date.now();
  return (result={})=>emitAiObservation({...base,...result,latencyMs:Date.now()-startedAt});
}

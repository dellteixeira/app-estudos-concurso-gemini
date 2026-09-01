(function installContextualAiTutor(global){
'use strict';
if(global.AppContextualAiTutor)return;

const VERSION='1.0.1';
const MAX_QUESTION=1200;
const clean=(value,max=500)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));

function scope(){
  const userId=clean(global.currentUser?.id||'guest',120);
  const contest=clean(global.currentConcurso||'Concurso Geral',180);
  return {userId,contest};
}
function currentProfile(){
  try{
    const current=scope();
    return global.AppCognitiveProfile?.read?.(current.userId,current.contest)||null;
  }catch(_){return null}
}
function topicFromProfile(topicId,profile=currentProfile()){
  const state=profile?.topicState?.[topicId]||null;
  if(!state)return null;
  return {
    topicId:clean(topicId,600),
    materia:clean(state.materia||state.subject,180),
    assunto:clean(state.assunto||state.topic,300),
    retention:clamp(state.retention,0,100),
    accuracy:state.accuracy==null?null:clamp(state.accuracy,0,100),
    confidence:clamp(state.confidence,0,1),
    lapseCount:clamp(state.lapseCount,0,30),
    reviewCount:clamp(state.reviewCount,0,60),
    difficulty:clamp(state.difficulty,1,10)||5,
    lastRating:clean(state.lastRating,30),
    lastStudyAt:clean(state.lastStudyAt,60)
  };
}
function recurringError(topicId,profile=currentProfile()){
  const entries=Array.isArray(profile?.recurringErrors)?profile.recurringErrors:[];
  const found=entries.find(item=>clean(item?.topicId,600)===clean(topicId,600));
  if(!found)return null;
  return {type:clean(found.type,40),severity:clamp(found.severity,0,100),reason:clean(found.reason,360)};
}
function methodEvidence(profile=currentProfile()){
  const source=profile?.methodEffectiveness||{};
  return Object.entries(source).slice(0,8).map(([method,value])=>({
    method:clean(method,60),
    score:value?.score==null?null:clamp(value.score,0,100),
    sampleSize:clamp(value?.samples,0,10000),
    gain24h:value?.gain24h==null?null:Number(value.gain24h),
    gain7d:value?.gain7d==null?null:Number(value.gain7d)
  })).filter(item=>item.method);
}
function boardEvidence(topic,profile=currentProfile()){
  try{
    const engine=global.AppExamBoardIntelligence;
    const contest=clean(profile?.contest||scope().contest,180);
    if(!engine||!topic?.materia||!topic?.assunto)return null;
    const signal=engine.signalForTopic?.(contest,topic.materia,topic.assunto)||null;
    if(!signal)return null;
    const source=signal.source||{};
    return {
      board:clean(signal.board,80),
      incidence:clamp(signal.priority,0,100),
      confidence:clamp(signal.confidence,0,100),
      questions:clamp(signal.questions,0,100000),
      years:clamp(signal.years,0,100),
      source:{title:clean(source.title,240),type:clean(source.type,80),url:clean(source.url,640)},
      asOf:clean(signal.asOf||source.asOf,40)
    };
  }catch(_){return null}
}
function nextAction(topicId,profile=currentProfile()){
  try{
    const engine=global.AppNextBestStudyAction;
    const state=profile?.topicState?.[topicId];
    if(!engine||!state)return null;
    const scored=engine.scoreTopic?.(profile,topicId,state);
    if(!scored)return null;
    return {
      score:clamp(scored.score,0,100),
      method:clean(scored.method,80),
      methodLabel:clean(scored.methodLabel,120),
      minutes:clamp(engine.suggestedMinutes?.(profile,scored.score),0,180),
      reasons:(Array.isArray(scored.factors)?scored.factors:[]).slice(0,6).map(v=>clean(v,220))
    };
  }catch(_){return null}
}

function buildContext(topicId,extra={}){
  const profile=currentProfile();
  const topic=topicFromProfile(topicId,profile)||{
    topicId:clean(topicId,600),
    materia:clean(extra.materia,180),
    assunto:clean(extra.assunto,300)
  };
  if(!topic.topicId||(!topic.materia&&!topic.assunto))throw new Error('Tópico contextual inválido.');
  const current=scope();
  return Object.freeze({
    schemaVersion:1,
    tutorRole:'advisory',
    authority:'retention-engine',
    autoSchedule:false,
    contest:clean(profile?.contest||current.contest,180),
    topic,
    recurringError:recurringError(topic.topicId,profile),
    nextBestAction:nextAction(topic.topicId,profile),
    boardEvidence:boardEvidence(topic,profile),
    methodEvidence:methodEvidence(profile)
  });
}
async function authToken(){
  try{const result=await global.supabaseClient?.auth?.getSession?.();return result?.data?.session?.access_token||''}catch(_){return''}
}
async function ask(topicId,question,extra={}){
  const prompt=clean(question,MAX_QUESTION);
  if(!prompt)throw new Error('Digite uma pergunta para o Tutor.');
  const token=await authToken();
  if(!token)throw new Error('Sessão expirada. Entre novamente para usar o Tutor.');
  const context=buildContext(topicId,extra);
  const response=await fetch('/api/ai/contextual-tutor',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${token}`},body:JSON.stringify({question:prompt,context})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error||`Falha no Tutor (${response.status}).`);
  return data;
}

function ensureDialog(){
  let overlay=document.getElementById('contextualTutorOverlay');
  if(overlay)return overlay;
  overlay=document.createElement('div');overlay.id='contextualTutorOverlay';overlay.className='learning-advisor-overlay';overlay.setAttribute('aria-hidden','true');
  overlay.innerHTML='<section class="learning-advisor-dialog" role="dialog" aria-modal="true" aria-labelledby="contextualTutorTitle"><div class="learning-advisor-dialog-head"><div><span class="learning-advisor-kicker">Tutor contextual</span><h3 id="contextualTutorTitle">Entender este ponto</h3><p>A IA usa apenas o contexto medido pelo app e não altera seu cronograma.</p></div><button class="learning-advisor-close" type="button" aria-label="Fechar">×</button></div><div class="learning-advisor-body"><div id="contextualTutorTopic" class="learning-advisor-action"></div><label>O que você quer entender?<textarea id="contextualTutorQuestion" rows="4" maxlength="1200" placeholder="Ex.: explique por que estou errando este assunto e proponha um exercício de recuperação ativa."></textarea></label><div id="contextualTutorStatus" class="learning-advisor-status" role="status" aria-live="polite"></div><div id="contextualTutorAnswer" class="learning-advisor-results"></div></div><div class="learning-advisor-footer"><button id="contextualTutorAsk" class="btn btn-primary" type="button">Perguntar ao Tutor</button></div></section>';
  document.body.appendChild(overlay);
  const close=()=>{overlay.classList.remove('is-open');overlay.setAttribute('aria-hidden','true')};
  overlay.querySelector('.learning-advisor-close')?.addEventListener('click',close);overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
  return overlay;
}
function open(topicId,extra={}){
  const overlay=ensureDialog();overlay.dataset.topicId=clean(topicId,600);overlay.dataset.materia=clean(extra.materia,180);overlay.dataset.assunto=clean(extra.assunto,300);
  const topic=topicFromProfile(topicId)||extra;
  const topicBox=overlay.querySelector('#contextualTutorTopic');if(topicBox){topicBox.textContent='';const strong=document.createElement('strong');strong.textContent=clean(topic?.materia,180);const span=document.createElement('span');span.textContent=clean(topic?.assunto,300);topicBox.append(strong,span)}
  const status=overlay.querySelector('#contextualTutorStatus');const answer=overlay.querySelector('#contextualTutorAnswer');if(status)status.textContent='';if(answer)answer.textContent='';
  overlay.classList.add('is-open');overlay.setAttribute('aria-hidden','false');setTimeout(()=>overlay.querySelector('#contextualTutorQuestion')?.focus(),0);
}
function installUiHook(){
  if(document.documentElement.dataset.contextualTutorHook==='1')return;document.documentElement.dataset.contextualTutorHook='1';
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-contextual-tutor]');if(!button)return;
    const card=button.closest('[data-topic-id]');open(card?.dataset.topicId||button.dataset.topicId,{materia:card?.querySelector('.learning-advisor-subject')?.textContent||button.dataset.materia,assunto:card?.querySelector('.learning-advisor-card-top strong')?.textContent||button.dataset.assunto});
  });
  const inject=()=>document.querySelectorAll('.learning-advisor-card[data-topic-id]').forEach(card=>{
    if(card.querySelector('[data-contextual-tutor]'))return;
    const controls=card.querySelector('.learning-advisor-controls');if(!controls)return;
    const button=document.createElement('button');button.type='button';button.className='btn btn-secondary btn-sm';button.dataset.contextualTutor='1';button.textContent='Perguntar ao Tutor';controls.insertBefore(button,controls.lastElementChild||null);
  });
  new MutationObserver(inject).observe(document.documentElement,{childList:true,subtree:true});inject();
  ensureDialog().querySelector('#contextualTutorAsk')?.addEventListener('click',async()=>{
    const overlay=ensureDialog(),status=overlay.querySelector('#contextualTutorStatus'),answer=overlay.querySelector('#contextualTutorAnswer'),question=overlay.querySelector('#contextualTutorQuestion')?.value||'';
    if(status)status.textContent='Analisando o contexto medido pelo app…';if(answer)answer.textContent='';
    try{const data=await ask(overlay.dataset.topicId,question,{materia:overlay.dataset.materia,assunto:overlay.dataset.assunto});if(status)status.textContent=data.aiUsed?'Resposta contextual gerada pela IA.':'Fallback pedagógico determinístico aplicado.';if(answer)answer.textContent=clean(data.answer,6000)}catch(error){if(status)status.textContent=error?.message||'Não foi possível consultar o Tutor.'}
  });
}

global.AppContextualAiTutor=Object.freeze({version:VERSION,scope,currentProfile,buildContext,ask,open,installUiHook});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installUiHook,{once:true});else installUiHook();
})(window);

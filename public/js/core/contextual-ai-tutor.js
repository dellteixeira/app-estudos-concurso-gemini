(function installContextualAiTutor(global){
'use strict';
if(global.AppContextualAiTutor)return;

const VERSION='1.0.0';
const MAX_QUESTION=1200;
const clean=(value,max=500)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));

function contestName(){
  try{return typeof currentConcurso!=='undefined'?clean(currentConcurso,180):'Concurso Geral'}catch(_){return'Concurso Geral'}
}
function currentProfile(){
  try{return global.AppCognitiveProfile?.read?.()||null}catch(_){return null}
}
function topicFromProfile(topicId){
  const profile=currentProfile();
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
    lastRating:clean(state.lastRating,30)
  };
}
function recurringError(topicId){
  const profile=currentProfile();
  const entries=Array.isArray(profile?.recurringErrors)?profile.recurringErrors:[];
  const found=entries.find(item=>clean(item?.topicId,600)===clean(topicId,600));
  if(!found)return null;
  return {type:clean(found.type,40),severity:clamp(found.severity,0,100),reason:clean(found.reason,360)};
}
function methodEvidence(){
  try{
    const source=global.AppInterventionEffectiveness?.aggregate?.();
    const byMethod=source?.byMethod||source?.methods||{};
    return Object.entries(byMethod).slice(0,8).map(([method,value])=>({method:clean(method,60),score:clamp(value?.score??value?.effectiveness,0,100),sampleSize:clamp(value?.sampleSize??value?.count,0,10000)}));
  }catch(_){return[]}
}
function boardEvidence(topicId){
  try{
    const engine=global.AppExamBoardIntelligence;
    if(!engine)return null;
    const signal=engine.signalForTopic?.(topicId)||engine.getTopicSignal?.(topicId)||null;
    if(!signal)return null;
    return {
      board:clean(signal.board||signal.banca,80),
      incidence:clamp(signal.incidence??signal.priority,0,100),
      confidence:clamp(signal.confidence,0,1),
      sampleSize:clamp(signal.sampleSize??signal.sample,0,100000),
      source:clean(signal.source,240),
      asOf:clean(signal.asOf,40)
    };
  }catch(_){return null}
}
function nextAction(topicId){
  try{
    const engine=global.AppNextBestStudyAction;
    const profile=currentProfile();
    const ranked=engine?.rankCandidates?.(profile,{limit:10})||[];
    const found=ranked.find(item=>clean(item?.topicId,600)===clean(topicId,600));
    if(!found)return null;
    return {score:clamp(found.score,0,100),method:clean(found.method||found.recommendedMethod,80),minutes:clamp(found.minutes||found.suggestedMinutes,0,180),reasons:(Array.isArray(found.reasons)?found.reasons:[]).slice(0,6).map(v=>clean(v,220))};
  }catch(_){return null}
}

function buildContext(topicId,extra={}){
  const topic=topicFromProfile(topicId)||{
    topicId:clean(topicId,600),
    materia:clean(extra.materia,180),
    assunto:clean(extra.assunto,300)
  };
  if(!topic.topicId||(!topic.materia&&!topic.assunto))throw new Error('Tópico contextual inválido.');
  return Object.freeze({
    schemaVersion:1,
    tutorRole:'advisory',
    authority:'retention-engine',
    autoSchedule:false,
    contest:contestName(),
    topic,
    recurringError:recurringError(topic.topicId),
    nextBestAction:nextAction(topic.topicId),
    boardEvidence:boardEvidence(topic.topicId),
    methodEvidence:methodEvidence()
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
  const topicBox=overlay.querySelector('#contextualTutorTopic');if(topicBox)topicBox.innerHTML=`<strong>${clean(topic?.materia,180)}</strong><span>${clean(topic?.assunto,300)}</span>`;
  const status=overlay.querySelector('#contextualTutorStatus');const answer=overlay.querySelector('#contextualTutorAnswer');if(status)status.textContent='';if(answer)answer.textContent='';
  overlay.classList.add('is-open');overlay.setAttribute('aria-hidden','false');setTimeout(()=>overlay.querySelector('#contextualTutorQuestion')?.focus(),0);
}
function installUiHook(){
  if(document.documentElement.dataset.contextualTutorHook==='1')return;document.documentElement.dataset.contextualTutorHook='1';
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-contextual-tutor]');if(!button)return;
    const card=button.closest('[data-topic-id]');open(card?.dataset.topicId||button.dataset.topicId,{materia:button.dataset.materia,assunto:button.dataset.assunto});
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

global.AppContextualAiTutor=Object.freeze({version:VERSION,buildContext,ask,open,installUiHook});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installUiHook,{once:true});else installUiHook();
})(window);

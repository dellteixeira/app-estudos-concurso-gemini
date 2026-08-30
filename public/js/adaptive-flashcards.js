(function installAdaptiveFlashcards(global){
'use strict';
if(global.AppAdaptiveFlashcards)return;

const RETENTION_THRESHOLD=60;
const MAX_SUGGESTIONS=5;
let currentSuggestions=[];

function safe(value,max=180){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0))}
function activeErrors(topicId){return global.AppIntelligentErrorNotebook?.getTopicEntries?.(topicId)?.filter(item=>item?.status!=='resolved')||[]}
function shouldSuggest(candidate,advisor){
  const metrics=candidate?.metrics||{};
  const intervention=advisor?.localIntervention?.(candidate)||{};
  const errors=activeErrors(candidate?.topicId);
  const lowRetention=clamp(metrics.retention,0,100)<RETENTION_THRESHOLD;
  const persistent=intervention?.diagnosisType==='persistent';
  return {eligible:Boolean(errors.length||lowRetention||persistent),errors,lowRetention,persistent,diagnosis:safe(intervention?.diagnosisType,40)||'mixed'};
}
function buildSuggestions(){
  const advisor=global.AppLearningAdvisor;
  if(!advisor?.collectCandidates||!advisor?.localIntervention)return [];
  const candidates=advisor.collectCandidates?.(MAX_SUGGESTIONS)||[];
  currentSuggestions=[];
  for(const candidate of candidates){
    const signal=shouldSuggest(candidate,advisor);if(!signal.eligible)continue;
    currentSuggestions.push({topicId:safe(candidate?.topicId,600),materia:safe(candidate?.materia,100),assunto:safe(candidate?.assunto,160),retention:clamp(candidate?.metrics?.retention,0,100),diagnosis:signal.diagnosis,activeErrorCount:signal.errors.length,reason:signal.errors.length?'active-error':signal.lowRetention?'low-retention':'persistent-difficulty',authority:'pedagogical-method-only'});
  }
  return currentSuggestions;
}
function findItem(suggestion){
  try{if(Array.isArray(global.editalItems))return global.editalItems.find(item=>item?.materia===suggestion?.materia&&item?.assunto===suggestion?.assunto)||null}catch(_){}
  return null;
}
function emitLaunch(suggestion){
  const detail={topicId:safe(suggestion?.topicId,600),reason:safe(suggestion?.reason,40),source:'adaptive-flashcards'};
  global.dispatchEvent(new CustomEvent('adaptive-flashcard-launched',{detail}));
  global.dispatchEvent(new CustomEvent('adaptive-flashcards-started',{detail}));
}
function start(index=0){
  const suggestion=currentSuggestions[index]||buildSuggestions()[index];if(!suggestion)return false;
  const item=findItem(suggestion);
  if(typeof global.openActiveRecallGuide!=='function')return false;
  global.openActiveRecallGuide({kind:'study',materia:suggestion.materia,assunto:suggestion.assunto,itemId:item?.id,isRevision:true,minutes:10,activityType:'revisao_ativa',method:'flashcards_adaptativos',methodLabel:'Flashcards adaptativos',source:'adaptive_flashcards'});
  emitLaunch(suggestion);
  return true;
}
function ensurePanel(){
  const host=document.getElementById('weaknessMapV2')||document.getElementById('adaptiveAiExperience');if(!host)return null;
  let panel=document.getElementById('adaptiveFlashcards');if(panel)return panel;
  panel=document.createElement('section');panel.id='adaptiveFlashcards';panel.className='adaptive-flashcards';
  panel.innerHTML='<div class="adaptive-session-head"><span class="dashboard-v2-section-label">Flashcards adaptativos</span><span class="adaptive-session-authority">recuperação ativa, sem reordenar prioridades</span></div><div id="adaptiveFlashcardsSummary" class="adaptive-session-summary">Os flashcards aparecem quando houver evidência de que recuperação ativa é útil.</div><div id="adaptiveFlashcardsList" class="weakness-map-topics"></div>';
  host.appendChild(panel);return panel;
}
function render(){
  ensurePanel();const rows=buildSuggestions();const summary=document.getElementById('adaptiveFlashcardsSummary');const list=document.getElementById('adaptiveFlashcardsList');if(!summary||!list)return rows;
  if(!rows.length){summary.textContent='Nenhum tópico pede flashcards neste momento.';list.replaceChildren();return rows;}
  summary.textContent=`${rows.length} tópico${rows.length===1?'':'s'} com indicação de recuperação ativa.`;
  list.innerHTML=rows.map((row,index)=>`<button type="button" class="weakness-map-topic" data-flashcard-index="${index}"><span class="weakness-map-rank">${index+1}</span><div><strong>${safe(row.materia,90)} — ${safe(row.assunto,140)}</strong><span>Retenção ${row.retention}% · ${row.activeErrorCount} erro${row.activeErrorCount===1?'':'s'} ativo${row.activeErrorCount===1?'':'s'}</span></div><span class="adaptive-session-use">Praticar</span></button>`).join('');
  list.querySelectorAll('[data-flashcard-index]').forEach(button=>button.addEventListener('click',()=>start(Number(button.dataset.flashcardIndex))));
  global.dispatchEvent(new CustomEvent('adaptive-flashcards-rendered',{detail:{count:rows.length}}));return rows;
}
function init(){ensurePanel();global.addEventListener('intelligent-error-notebook-changed',()=>render());global.addEventListener('adaptive-plan-changed',()=>render());if(global.AppLearningAdvisor)render();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
global.AppAdaptiveFlashcards=Object.freeze({buildSuggestions,render,start,emitLaunch,getSuggestions:()=>currentSuggestions,RETENTION_THRESHOLD});
})(window);

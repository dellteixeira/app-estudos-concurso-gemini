(function installExamProximityStrategy(global){
'use strict';
if(global.AppExamProximityStrategy)return;

const STORAGE_KEY='adaptive_exam_strategy_v1';
const PHASES={
  foundation:{minDays:91,label:'Construção de base'},
  consolidation:{minDays:31,label:'Consolidação'},
  intensification:{minDays:8,label:'Intensificação'},
  final:{minDays:0,label:'Reta final'}
};
const ACTIONS={
  foundation:{acquisition:'focused_restudy',retention:'active_recall',application:'questions',persistent:'focused_restudy',false_mastery:'questions',mixed:'active_recall'},
  consolidation:{acquisition:'short_review',retention:'active_recall',application:'questions',persistent:'active_recall',false_mastery:'questions',mixed:'questions'},
  intensification:{acquisition:'short_review',retention:'active_recall',application:'questions',persistent:'questions',false_mastery:'questions',mixed:'questions'},
  final:{acquisition:'short_review',retention:'active_recall',application:'questions',persistent:'questions',false_mastery:'questions',mixed:'questions'}
};

function safe(value,max=40){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').trim().slice(0,max)}
function read(){try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return value&&typeof value==='object'?value:{}}catch(_){return{}}}
function write(value){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(value));return true}catch(_){return false}}
function parseDate(value){const text=safe(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;const date=new Date(`${text}T12:00:00`);return Number.isFinite(date.getTime())?date:null}
function daysUntilExam(reference=new Date()){
  const exam=parseDate(read().examDate);if(!exam)return null;
  const today=new Date(reference.getFullYear(),reference.getMonth(),reference.getDate(),12);
  return Math.max(0,Math.ceil((exam-today)/(24*60*60*1000)));
}
function phaseForDays(days){
  if(days==null)return null;
  if(days>=PHASES.foundation.minDays)return 'foundation';
  if(days>=PHASES.consolidation.minDays)return 'consolidation';
  if(days>=PHASES.intensification.minDays)return 'intensification';
  return 'final';
}
function getContext(reference=new Date()){
  const days=daysUntilExam(reference);const phase=phaseForDays(days);
  return {examDate:safe(read().examDate,10),days,phase,label:phase?PHASES[phase].label:'Data da prova não definida',authority:'pedagogical-composition-only'};
}
function setExamDate(value){
  const date=parseDate(value);if(!date)return false;
  write({version:1,examDate:safe(value,10),updatedAt:new Date().toISOString()});
  global.dispatchEvent(new CustomEvent('adaptive-exam-date-changed',{detail:getContext()}));
  return true;
}
function adapt(intervention){
  if(!intervention?.recommendedAction)return intervention;
  const context=getContext();if(!context.phase)return intervention;
  const diagnosis=safe(intervention.diagnosisType,40)||'mixed';
  const preferred=ACTIONS[context.phase]?.[diagnosis]||intervention.recommendedAction;
  return {...intervention,recommendedAction:preferred,examStrategy:{applied:preferred!==intervention.recommendedAction,phase:context.phase,daysUntilExam:context.days,authority:'pedagogical-composition-only'}};
}
function ensureControl(){
  const panel=document.getElementById('dailyAdaptivePlanner');if(!panel||document.getElementById('adaptiveExamStrategyControl'))return;
  const control=document.createElement('div');control.id='adaptiveExamStrategyControl';control.className='adaptive-exam-strategy-control';
  const context=getContext();
  control.innerHTML=`<label for="adaptiveExamDate">Data da prova</label><input id="adaptiveExamDate" type="date" value="${context.examDate||''}"><span id="adaptiveExamPhase">${context.phase?`${context.label} · ${context.days} dias`:'Defina a data para adaptar a estratégia'}</span>`;
  panel.querySelector('.adaptive-session-head')?.after(control);
  const input=document.getElementById('adaptiveExamDate');input?.addEventListener('change',()=>{if(setExamDate(input.value)){const next=getContext();const phase=document.getElementById('adaptiveExamPhase');if(phase)phase.textContent=`${next.label} · ${next.days} dias`;}});
}
function init(){ensureControl();global.addEventListener('adaptive-day-plan-rendered',ensureControl)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
global.AppExamProximityStrategy=Object.freeze({adapt,setExamDate,getContext,daysUntilExam,phaseForDays});
})(window);

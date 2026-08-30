(function installWeaknessMapV2(global){
'use strict';
if(global.AppWeaknessMapV2)return;

const TYPE_LABELS={retention:'Retenção',application:'Aplicação',persistent:'Persistente',false_mastery:'Falsa maestria',acquisition:'Aquisição',mixed:'Mista'};
const ERROR_LABELS={knowledge:'Conhecimento',application:'Aplicação',interpretation:'Interpretação',distraction:'Distração',recurrence:'Recorrência'};
let currentSnapshot=null;

function safe(value,max=180){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0))}
function ensureStyle(){
  if(document.querySelector('link[data-weakness-map-v2-style]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='./css/weakness-map-v2.css?v=20260830';link.dataset.weaknessMapV2Style='1';document.head.appendChild(link);
}
function ensureQuestionPerformance(){
  if(global.AppQuestionPerformanceIntelligence||document.querySelector('script[data-question-performance-intelligence]'))return;
  const script=document.createElement('script');script.src='./js/question-performance-intelligence.js?v=20260830';script.defer=true;script.dataset.questionPerformanceIntelligence='1';script.onerror=()=>console.warn('Não foi possível carregar a inteligência de desempenho em questões.');document.head.appendChild(script);
}
function ensureAdaptiveFlashcards(){
  if(global.AppAdaptiveFlashcards||document.querySelector('script[data-adaptive-flashcards]'))return;
  const script=document.createElement('script');script.src='./js/adaptive-flashcards.js?v=20260830';script.defer=true;script.dataset.adaptiveFlashcards='1';script.onerror=()=>console.warn('Não foi possível carregar os flashcards adaptativos.');document.head.appendChild(script);
}
function classify(candidate,advisor){
  const intervention=advisor?.localIntervention?.(candidate)||{};
  const m=candidate?.metrics||{};
  const errorProfile=global.AppQuestionPerformanceIntelligence?.getTopicProfile?.(candidate?.topicId)||null;
  return {
    topicId:safe(candidate?.topicId,600),
    materia:safe(candidate?.materia,100),
    assunto:safe(candidate?.assunto,160),
    friction:clamp(candidate?.frictionScore,0,100),
    retention:clamp(m.retention,0,100),
    accuracy:m.accuracy==null?null:clamp(m.accuracy,0,100),
    lapses:clamp(m.lapseCount,0,99),
    reviews:clamp(m.reviewCount,0,999),
    diagnosis:safe(intervention?.diagnosisType,40)||'mixed',
    severity:safe(intervention?.severity,20)||'low',
    errorType:safe(errorProfile?.dominantType,40),
    errorCount:clamp(errorProfile?.count,0,999)
  };
}
function buildSnapshot(){
  const advisor=global.AppLearningAdvisor;
  if(!advisor?.collectCandidates||!advisor?.localIntervention)return null;
  const candidates=advisor.collectCandidates?.(5)||[];
  const topics=candidates.map(candidate=>classify(candidate,advisor));
  const subjects=[];const bySubject=new Map();
  topics.forEach(topic=>{
    let bucket=bySubject.get(topic.materia);
    if(!bucket){bucket={materia:topic.materia,count:0,frictionTotal:0,retentionTotal:0,accuracyTotal:0,accuracyCount:0,lapses:0,diagnoses:{},errors:{}};bySubject.set(topic.materia,bucket);subjects.push(bucket);}
    bucket.count+=1;bucket.frictionTotal+=topic.friction;bucket.retentionTotal+=topic.retention;bucket.lapses+=topic.lapses;
    if(topic.accuracy!=null){bucket.accuracyTotal+=topic.accuracy;bucket.accuracyCount+=1;}
    bucket.diagnoses[topic.diagnosis]=(bucket.diagnoses[topic.diagnosis]||0)+1;
    if(topic.errorType)bucket.errors[topic.errorType]=(bucket.errors[topic.errorType]||0)+topic.errorCount;
  });
  const matterRows=subjects.map(bucket=>({
    materia:bucket.materia,
    count:bucket.count,
    averageFriction:Number((bucket.frictionTotal/bucket.count).toFixed(1)),
    averageRetention:Number((bucket.retentionTotal/bucket.count).toFixed(1)),
    averageAccuracy:bucket.accuracyCount?Number((bucket.accuracyTotal/bucket.accuracyCount).toFixed(1)):null,
    lapses:bucket.lapses,
    diagnoses:bucket.diagnoses,
    errors:bucket.errors
  }));
  currentSnapshot={topics,subjects:matterRows,authority:'diagnostic-only'};
  return currentSnapshot;
}
function ensurePanel(){
  const host=document.getElementById('adaptiveAiExperience')||document.getElementById('dashboardV2NextAction')?.closest('.dashboard-v2-next');
  if(!host)return null;
  let panel=document.getElementById('weaknessMapV2');if(panel)return panel;
  panel=document.createElement('section');panel.id='weaknessMapV2';panel.className='weakness-map-v2';
  panel.innerHTML='<div class="adaptive-session-head"><span class="dashboard-v2-section-label">Mapa de fragilidades</span><span class="adaptive-session-authority">diagnóstico, sem reordenar prioridades</span></div><div id="weaknessMapSummary" class="adaptive-session-summary">Calcule um plano para atualizar o diagnóstico.</div><div id="weaknessMapSubjects" class="weakness-map-subjects"></div><div id="weaknessMapTopics" class="weakness-map-topics"></div>';
  host.appendChild(panel);return panel;
}
function render(snapshot=buildSnapshot()){
  ensureStyle();ensurePanel();
  const summary=document.getElementById('weaknessMapSummary');const subjects=document.getElementById('weaknessMapSubjects');const topics=document.getElementById('weaknessMapTopics');
  if(!summary||!subjects||!topics)return snapshot;
  if(!snapshot?.topics?.length){summary.textContent='Nenhuma fragilidade relevante detectada nos dados atuais.';subjects.replaceChildren();topics.replaceChildren();return snapshot;}
  summary.textContent=`${snapshot.topics.length} tópico${snapshot.topics.length===1?'':'s'} crítico${snapshot.topics.length===1?'':'s'} em ${snapshot.subjects.length} matéria${snapshot.subjects.length===1?'':'s'}.`;
  subjects.innerHTML=snapshot.subjects.map(row=>`<article class="weakness-map-subject"><strong>${safe(row.materia,100)}</strong><span>Fricção ${row.averageFriction}/100 · Retenção ${row.averageRetention}%${row.averageAccuracy==null?'':` · Acerto ${row.averageAccuracy}%`} · Lapsos ${row.lapses}</span></article>`).join('');
  topics.innerHTML=snapshot.topics.map((topic,index)=>`<article class="weakness-map-topic" data-severity="${safe(topic.severity,20)}"><span class="weakness-map-rank">${index+1}</span><div><strong>${safe(topic.materia,90)} — ${safe(topic.assunto,140)}</strong><span>${TYPE_LABELS[topic.diagnosis]||'Mista'} · Fricção ${topic.friction}/100 · Retenção ${topic.retention}%${topic.accuracy==null?'':` · Acerto ${topic.accuracy}%`} · ${topic.lapses} lapso${topic.lapses===1?'':'s'}${topic.errorType?` · Erro dominante: ${ERROR_LABELS[topic.errorType]||safe(topic.errorType,40)} (${topic.errorCount})`:''}</span></div></article>`).join('');
  global.dispatchEvent(new CustomEvent('weakness-map-rendered',{detail:{topics:snapshot.topics.length,subjects:snapshot.subjects.length}}));
  return snapshot;
}
function init(){ensureStyle();ensureQuestionPerformance();ensureAdaptiveFlashcards();ensurePanel();global.addEventListener('adaptive-plan-changed',()=>render());global.addEventListener('adaptive-feedback-evaluated',()=>render());global.addEventListener('question-performance-classified',()=>render());if(global.AppLearningAdvisor)render();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
global.AppWeaknessMapV2=Object.freeze({buildSnapshot,render,getSnapshot:()=>currentSnapshot});
})(window);

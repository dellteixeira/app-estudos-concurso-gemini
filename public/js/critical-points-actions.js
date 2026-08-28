(function installCriticalPointActions(global){
'use strict';
if(global.CriticalPointActions)return;

const VERSION='1.0.1';
const SNOOZE_HOURS=24;
const ENHANCED_CLASS='critical-actions-enabled';
let observer=null;
let refreshTimer=null;

const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));

function advisorReady(){return typeof global.AppLearningAdvisor?.snoozeTopic==='function'&&typeof global.AppLearningAdvisor?.computeLearningFriction==='function'}
function getRows(){
  try{return typeof retentionDiagnosticRows!=='undefined'&&Array.isArray(retentionDiagnosticRows)?retentionDiagnosticRows:[]}catch(_){return[]}
}
function getItems(){
  try{return typeof editalItems!=='undefined'&&Array.isArray(editalItems)?editalItems:[]}catch(_){return[]}
}
function getTopicKey(item,row){
  if(row?.state?.key)return String(row.state.key);
  try{if(typeof getStudyTopicKey==='function')return getStudyTopicKey(item?.materia,item?.assunto)}catch(_){}
  return `${String(item?.materia||'').trim()}::${String(item?.assunto||'').trim()}`.toLowerCase();
}
function findItem(row){
  const key=getTopicKey(null,row);
  return getItems().find(item=>{
    try{return typeof getStudyTopicKey==='function'?getStudyTopicKey(item?.materia,item?.assunto)===key:false}catch(_){return false}
  })||getItems().find(item=>item?.materia===row?.state?.materia&&item?.assunto===row?.state?.assunto)||null;
}
function priorityRisk(item){
  const priority=clamp(item?.prioridade||2,1,4);
  return ((5-priority)/4)*10;
}
function overdueRisk(row){
  if(row?.overdue||row?.scheduledOverdue){
    const days=Math.max(0,Number(row?.overdueDays??row?.scheduledOverdueDays)||0);
    return Math.min(20,12+days*1.5);
  }
  return row?.retentionDue?8:0;
}
function persistentRisk(row,item){
  try{return clamp(global.AppLearningAdvisor?.computeLearningFriction?.(row,item)?.score||0,0,100)*0.15}catch(_){return 0}
}
function computeGlobalRisk(row,item){
  const retention=clamp(row?.retention??row?.state?.retention??100,0,100);
  const rawAccuracy=Number(row?.questionAccuracy??row?.state?.questionStats?.lastAccuracy);
  const accuracy=Number.isFinite(rawAccuracy)?clamp(rawAccuracy,0,100):null;
  const retentionComponent=(100-retention)*0.30;
  const questionsComponent=accuracy==null?0:(100-accuracy)*0.25;
  const overdueComponent=overdueRisk(row);
  const persistenceComponent=persistentRisk(row,item);
  const priorityComponent=priorityRisk(item);
  const raw=Math.round(retentionComponent+questionsComponent+overdueComponent+persistenceComponent+priorityComponent);
  const score=clamp(Math.max(35,raw),0,100);
  return {
    score,
    level:score>=70?'high':score>=50?'medium':'low',
    label:score>=70?'Alto':score>=50?'Médio':'Baixo',
    components:{retention:retentionComponent,questions:questionsComponent,overdue:overdueComponent,persistence:persistenceComponent,priority:priorityComponent}
  };
}
function retentionText(row){return `${Math.round(clamp(row?.retention??row?.state?.retention??0,0,100))}%`}
function accuracyText(row){
  const value=Number(row?.questionAccuracy??row?.state?.questionStats?.lastAccuracy);
  return Number.isFinite(value)?`${Math.round(clamp(value,0,100))}%`:'—';
}
function findRow(index){return getRows()[Number(index)]||null}

function enhanceCard(card){
  if(!advisorReady()||!card||card.classList.contains(ENHANCED_CLASS))return;
  const index=Number(card.dataset.reviewIndex);
  const row=findRow(index);
  if(!row?.state)return;
  const item=findItem(row);
  const topicId=getTopicKey(item,row);
  if(!topicId)return;
  if(global.AppLearningAdvisor.isSnoozed?.(topicId)){
    card.remove();
    return;
  }
  const risk=computeGlobalRisk(row,item);
  const article=document.createElement('article');
  article.className=`${card.className} ${ENHANCED_CLASS}`.replace(/\brisk-(?:high|medium|low)\b/g,'').replace(/\s+/g,' ').trim()+` risk-${risk.level}`;
  article.dataset.reviewIndex=String(index);
  article.dataset.topicId=topicId;
  article.setAttribute('aria-label',`Ponto crítico: ${row.state.materia||'Matéria'} — ${row.state.assunto||'Assunto'}. Risco global ${risk.score} de 100. Retenção ${retentionText(row)}. Questões ${accuracyText(row)}.`);
  article.innerHTML=card.innerHTML;

  const badge=article.querySelector('.retention-risk-badge');
  if(badge){
    badge.classList.remove('high','medium','low');
    badge.classList.add(risk.level);
    badge.textContent=risk.label;
    badge.title=`Risco global ${risk.score}/100`;
  }
  const value=article.querySelector('.retention-risk-value');
  if(value)value.innerHTML=`<span class="critical-retention-caption">Retenção</span><strong>${retentionText(row)}</strong>`;
  const meta=article.querySelector('.retention-risk-meta');
  if(meta){
    const original=meta.textContent?.trim();
    meta.textContent=`${original?`${original} · `:''}Risco global ${risk.score}/100`;
  }
  const progress=article.querySelector('.retention-risk-progress');
  const controls=document.createElement('div');
  controls.className='critical-point-controls';
  const study=document.createElement('button');
  study.className='critical-point-study';
  study.type='button';
  study.dataset.criticalAction='study';
  study.dataset.reviewIndex=String(index);
  study.textContent='Estudar agora';
  const snoozeButton=document.createElement('button');
  snoozeButton.className='critical-point-snooze';
  snoozeButton.type='button';
  snoozeButton.dataset.criticalAction='snooze';
  snoozeButton.dataset.topicId=topicId;
  snoozeButton.textContent='Adiar 24h';
  const note=document.createElement('span');
  note.className='critical-point-note';
  note.textContent='Adiar não registra estudo nem altera a retenção.';
  controls.append(study,snoozeButton,note);
  const copy=article.querySelector('.retention-risk-copy');
  if(copy)copy.appendChild(controls);
  else article.appendChild(controls);
  if(progress)progress.setAttribute('title',`Retenção ${retentionText(row)}`);
  card.replaceWith(article);
}

function enhanceAll(){
  if(!advisorReady())return;
  document.querySelectorAll('button.retention-risk-card-v1071[data-review-index]').forEach(enhanceCard);
}
function scheduleEnhance(delay=0){
  clearTimeout(refreshTimer);
  refreshTimer=setTimeout(enhanceAll,delay);
}
function openStudy(index){
  try{
    if(typeof openLayeredReviewModal==='function')openLayeredReviewModal(Number(index));
  }catch(_){global.appNotice?.('Não foi possível abrir a intervenção deste ponto crítico agora.',{title:'Pontos críticos'})}
}
function rerenderDiagnostics(){
  try{global.AppLearningAdvisor?.refresh?.()}catch(_){}
  try{if(typeof renderRetentionDiagnostics==='function')renderRetentionDiagnostics()}catch(_){}
  scheduleEnhance();
}
function snooze(topicId){
  if(!topicId)return;
  if(!advisorReady()){
    global.appNotice?.('O controle de adiamento ainda está carregando. Tente novamente em instantes.',{title:'Pontos críticos'});
    scheduleEnhance(250);
    return;
  }
  const until=global.AppLearningAdvisor.snoozeTopic(topicId,SNOOZE_HOURS);
  document.querySelectorAll(`.${ENHANCED_CLASS}`).forEach(card=>{if(card.dataset.topicId===topicId)card.remove()});
  rerenderDiagnostics();
  const when=until?new Date(until).toLocaleString('pt-BR'):'em 24 horas';
  global.appNotice?.(`Assunto adiado sem registrar estudo. Ele poderá voltar aos Pontos críticos após ${when}.`,{title:'Adiado por 24h'});
  global.dispatchEvent(new CustomEvent('critical-points:snoozed',{detail:{topicId,until}}));
}
function onClick(event){
  const action=event.target?.closest?.('[data-critical-action]');
  if(!action)return;
  event.preventDefault();
  event.stopPropagation();
  if(action.dataset.criticalAction==='study')return openStudy(action.dataset.reviewIndex);
  if(action.dataset.criticalAction==='snooze')return snooze(action.dataset.topicId);
}
function boot(){
  enhanceAll();
  document.addEventListener('click',onClick,true);
  observer=new MutationObserver(()=>scheduleEnhance());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  global.addEventListener('learning-advisor:snooze-changed',rerenderDiagnostics);
  [120,350,900,1800].forEach(delay=>setTimeout(enhanceAll,delay));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
global.CriticalPointActions=Object.freeze({VERSION,computeGlobalRisk,enhanceAll,snooze});
})(window);

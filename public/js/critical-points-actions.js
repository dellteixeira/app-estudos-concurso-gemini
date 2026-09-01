(function installCriticalPointActions(global){
'use strict';
if(global.CriticalPointActions)return;

const VERSION='1.3.1';
const SNOOZE_HOURS=24;
const ENHANCED_CLASS='critical-actions-enabled';
let observer=null;
let refreshTimer=null;

const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

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
  try{
    const indexed=global.AppCognitiveDataSource?.findEditalItem?.({topicId:key,materia:row?.state?.materia,assunto:row?.state?.assunto});
    if(indexed)return indexed;
  }catch(_){}
  return getItems().find(item=>{
    try{return typeof getStudyTopicKey==='function'?getStudyTopicKey(item?.materia,item?.assunto)===key:false}catch(_){return false}
  })||getItems().find(item=>item?.materia===row?.state?.materia&&item?.assunto===row?.state?.assunto)||null;
}
function getStudentModel(){
  try{
    const userId=global.currentUser?.id||'guest';
    const contest=global.currentConcurso||'Concurso Geral';
    return global.AppCognitiveProfile?.peek?.(userId,contest)||global.AppCognitiveProfile?.read?.(userId,contest)||null;
  }catch(_){return null}
}
function getStudentTopicState(row,item){
  const model=getStudentModel();
  const key=getTopicKey(item,row).toLowerCase();
  const direct=model?.topicState?.[key];
  if(direct)return direct;
  const materia=String(item?.materia||row?.state?.materia||row?.materia||'').trim();
  const assunto=String(item?.assunto||row?.state?.assunto||row?.assunto||'').trim();
  const fallback=`${materia}::${assunto}`.toLowerCase();
  return model?.topicState?.[fallback]||null;
}
function enrichRowFromStudentModel(row,item){
  const topic=getStudentTopicState(row,item);
  if(!topic)return row;
  const state=row?.state||{};
  const questionStats=state.questionStats||{};
  return {
    ...row,
    retention:Number.isFinite(Number(topic.retention))?Number(topic.retention):row?.retention,
    questionAccuracy:Number.isFinite(Number(topic.accuracy))?Number(topic.accuracy):row?.questionAccuracy,
    state:{
      ...state,
      retention:Number.isFinite(Number(topic.retention))?Number(topic.retention):state.retention,
      lapseCount:Number.isFinite(Number(topic.lapseCount))?Number(topic.lapseCount):state.lapseCount,
      reviewCount:Number.isFinite(Number(topic.reviewCount))?Number(topic.reviewCount):state.reviewCount,
      sessionCount:Number.isFinite(Number(topic.sessionCount))?Number(topic.sessionCount):state.sessionCount,
      totalMinutes:Number.isFinite(Number(topic.totalMinutes))?Number(topic.totalMinutes):state.totalMinutes,
      difficulty:Number.isFinite(Number(topic.difficulty))?Number(topic.difficulty):state.difficulty,
      lastRating:topic.lastRating||state.lastRating,
      lastStudyAt:topic.lastStudyAt||state.lastStudyAt,
      questionStats:{
        ...questionStats,
        lastAccuracy:Number.isFinite(Number(topic.accuracy))?Number(topic.accuracy):questionStats.lastAccuracy,
        averageAccuracy:Number.isFinite(Number(topic.accuracy))?Number(topic.accuracy):questionStats.averageAccuracy,
        confidence:Number.isFinite(Number(topic.confidence))?Number(topic.confidence):questionStats.confidence
      }
    },
    domainRisk:topic.domainRisk||null,
    studentModelSource:'cognitive-profile'
  };
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
function computeGlobalRisk(row,item,modeledRowOverride=null){
  const modeledRow=modeledRowOverride||enrichRowFromStudentModel(row,item);
  const retention=clamp(modeledRow?.retention??modeledRow?.state?.retention??100,0,100);
  const rawAccuracy=Number(modeledRow?.questionAccuracy??modeledRow?.state?.questionStats?.lastAccuracy);
  const accuracy=Number.isFinite(rawAccuracy)?clamp(rawAccuracy,0,100):null;
  const retentionComponent=(100-retention)*0.30;
  const questionsComponent=accuracy==null?0:(100-accuracy)*0.25;
  const overdueComponent=overdueRisk(row);
  const persistenceComponent=persistentRisk(modeledRow,item);
  const priorityComponent=priorityRisk(item);
  const domainRiskValue=Number(modeledRow?.domainRisk?.forgettingRisk);
  const domainComponent=Number.isFinite(domainRiskValue)?clamp(domainRiskValue,0,100)*0.20:0;
  const raw=Math.round(retentionComponent+questionsComponent+overdueComponent+persistenceComponent+priorityComponent+domainComponent);
  const score=clamp(Math.max(35,raw),0,100);
  return {
    score,
    level:score>=70?'high':score>=50?'medium':'low',
    label:score>=70?'Alto':score>=50?'Médio':'Baixo',
    source:modeledRow?.studentModelSource||'retention-diagnostics',
    phase6:{masteryScore:modeledRow?.domainRisk?.masteryScore??null,predictedRetention7d:modeledRow?.domainRisk?.predictedRetention7d??null,forgettingRisk:modeledRow?.domainRisk?.forgettingRisk??null,trend:modeledRow?.domainRisk?.trend||null},
    components:{retention:retentionComponent,questions:questionsComponent,overdue:overdueComponent,persistence:persistenceComponent,priority:priorityComponent,domainRisk:domainComponent}
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
  const modeledRow=enrichRowFromStudentModel(row,item);
  const risk=computeGlobalRisk(row,item,modeledRow);
  const article=document.createElement('article');
  article.className=`${card.className} ${ENHANCED_CLASS}`.replace(/\brisk-(?:high|medium|low)\b/g,'').replace(/\s+/g,' ').trim()+` risk-${risk.level}`;
  article.dataset.reviewIndex=String(index);
  article.dataset.topicId=topicId;
  article.dataset.riskSource=risk.source;
  if(risk.phase6?.masteryScore!=null)article.dataset.phase6Mastery=String(risk.phase6.masteryScore);
  if(risk.phase6?.predictedRetention7d!=null)article.dataset.phase6PredictedRetention7d=String(risk.phase6.predictedRetention7d);
  if(risk.phase6?.forgettingRisk!=null)article.dataset.phase6ForgettingRisk=String(risk.phase6.forgettingRisk);
  article.setAttribute('aria-label',`Ponto crítico: ${modeledRow.state.materia||'Matéria'} — ${modeledRow.state.assunto||'Assunto'}. Risco global ${risk.score} de 100. Retenção ${retentionText(modeledRow)}. Questões ${accuracyText(modeledRow)}.`);
  article.innerHTML=card.innerHTML;

  const badge=article.querySelector('.retention-risk-badge');
  if(badge){
    badge.classList.remove('high','medium','low');
    badge.classList.add(risk.level);
    badge.textContent=risk.label;
    badge.title=`Risco global ${risk.score}/100`;
  }
  const value=article.querySelector('.retention-risk-value');
  if(value)value.innerHTML=`<span class="critical-retention-caption">Retenção</span><strong>${retentionText(modeledRow)}</strong>`;
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
  const ai=document.createElement('button');
  ai.className='critical-point-ai';
  ai.type='button';
  ai.dataset.criticalAction='ai';
  ai.dataset.topicId=topicId;
  ai.dataset.reviewIndex=String(index);
  ai.textContent='Consultar IA';
  controls.append(study,ai,snoozeButton,note);
  article.appendChild(controls);
  if(progress)progress.setAttribute('title',`Retenção ${retentionText(modeledRow)}`);
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
    const numericIndex=Number(index);
    const row=findRow(numericIndex);
    const item=row?findItem(row):null;
    const topicId=row?getTopicKey(item,row):null;
    const profile=getStudentModel();
    const optimized=profile&&topicId&&global.AppStudyOptimization?.forTopic?global.AppStudyOptimization.forTopic(topicId,30,{profile,source:'critical-points'}):null;
    const block=optimized?.block||null;
    const predictive=profile&&topicId&&global.AppPredictiveAdaptiveTutor?.resolve?global.AppPredictiveAdaptiveTutor.resolve({profile,topicId,target:70,preferredAction:block?.method,availableMinutes:block?.minutes||30}):null;
    if(block){
      const tutorAction=predictive?.tutor?.action||block.method;
      const tutorMinutes=predictive?.tutor?.suggestedMinutes||block.minutes;
      const guidance=global.AppStudyGuidance?.guideSync?.({topicId:block.topicId,materia:block.materia,assunto:block.assunto,availableMinutes:tutorMinutes,surface:'critical-points',preferredAction:tutorAction,target:70});
      global.dispatchEvent?.(new CustomEvent('critical-points:phase6-prepared',{detail:{topicId,method:tutorAction,minutes:tutorMinutes,expectedGain:block.expectedGain,optimizationScore:block.optimizationScore,predictedPerformance:predictive?.tutor?.prediction?.expectedPerformance??null,goalProbability:predictive?.goal?.probability??null,guidance:guidance||null,importedOrderMutation:false}}));
    }
    if(typeof openLayeredReviewModal==='function')openLayeredReviewModal(numericIndex);
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

function metricConfig(kind){
  return {
    overdue:{
      title:'Revisões vencidas',
      subtitle:'Conteúdos cuja próxima revisão prevista já ultrapassou a data recomendada.'
    },
    mastered:{
      title:'Assuntos dominados',
      subtitle:'Conteúdos com retenção alta, sem revisão vencida e desempenho compatível com domínio.'
    }
  }[kind]||null;
}
function metricStatus(row,kind){
  if(kind==='overdue'){
    const days=Math.max(0,Number(row?.overdueDays)||0);
    return days?`Revisão agendada vencida há ${days}d.`:'Revisão agendada vencida.';
  }
  const next=row?.nextAt;
  if(next instanceof Date&&Number.isFinite(next.getTime()))return `Próxima revisão: ${next.toLocaleDateString('pt-BR')}.`;
  return 'Retenção alta e desempenho compatível com domínio.';
}
function renderModernMetricCard(row,kind){
  const state=row?.state||{};
  const retention=Math.round(clamp(row?.retention??state?.retention??0,0,100));
  const rawAccuracy=Number(row?.questionAccuracy??state?.questionStats?.lastAccuracy);
  const accuracy=Number.isFinite(rawAccuracy)?Math.round(clamp(rawAccuracy,0,100)):null;
  return `<article class="learning-risk-card"><div class="learning-risk-copy"><span class="learning-advisor-subject">${esc(state.materia||'Matéria')}</span><strong>${esc(state.assunto||'Assunto')}</strong><p>${esc(metricStatus(row,kind))}</p></div><div class="learning-risk-metrics"><span>Retenção <strong>${retention}%</strong></span>${accuracy!=null?`<span>Questões <strong>${accuracy}%</strong></span>`:''}</div></article>`;
}
function closeLegacyMetricModal(){
  const legacy=document.getElementById('modalRetentionMetricDetails');
  if(!legacy)return;
  legacy.classList.remove('is-open');
  legacy.hidden=true;
  legacy.setAttribute('aria-hidden','true');
}
function openModernRetentionMetric(kind){
  const config=metricConfig(kind);
  if(!config||typeof global.AppLearningAdvisor?.openRiskView!=='function')return false;
  let diag=null;
  try{diag=typeof global.buildRetentionDiagnostics==='function'?global.buildRetentionDiagnostics():null}catch(_){diag=null}
  const rows=Array.isArray(diag?.[kind])?diag[kind]:[];
  closeLegacyMetricModal();
  global.AppLearningAdvisor.openRiskView();
  const overlay=document.getElementById('learningAdvisorOverlay');
  if(!overlay)return false;
  const title=overlay.querySelector('#learningAdvisorTitle');
  const subtitle=overlay.querySelector('#learningAdvisorSubtitle');
  const body=overlay.querySelector('#learningAdvisorBody');
  const footer=overlay.querySelector('#learningAdvisorFooter');
  if(title)title.textContent=config.title;
  if(subtitle)subtitle.textContent=config.subtitle;
  if(body)body.innerHTML=rows.length?`<div class="learning-risk-list">${rows.map(row=>renderModernMetricCard(enrichRowFromStudentModel(row,findItem(row)),kind)).join('')}</div>`:'<div class="learning-advisor-empty">Nenhum conteúdo nesta categoria no momento.</div>';
  if(footer){
    const candidates=global.AppLearningAdvisor.collectCandidates?.()||[];
    footer.innerHTML=`<div class="learning-advisor-footer-copy"><strong>IA auxiliar</strong><span>${kind==='overdue'?'A IA considera retenção, atraso, desempenho e histórico de recomendações para orientar a retomada.':'A IA pode ajudar a interpretar os sinais de domínio e a manter a aprendizagem sem revisões desnecessárias.'}</span></div><button id="learningAdvisorMetricAnalyze" class="btn btn-secondary" type="button" ${candidates.length?'':'disabled'}>Analisar dificuldades com IA</button>`;
    footer.querySelector('#learningAdvisorMetricAnalyze')?.addEventListener('click',()=>global.AppLearningAdvisor.analyze?.().catch?.(()=>{}));
  }
  return true;
}
function onMetricClick(event){
  const target=event.target?.closest?.('[data-action="retention-details"][data-metric]');
  const kind=target?.dataset?.metric;
  if(!target||(kind!=='overdue'&&kind!=='mastered'))return;
  if(typeof global.AppLearningAdvisor?.openRiskView!=='function')return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openModernRetentionMetric(kind);
}
function onClick(event){
  const action=event.target?.closest?.('[data-critical-action]');
  if(!action)return;
  event.preventDefault();
  event.stopPropagation();
  if(action.dataset.criticalAction==='study')return openStudy(action.dataset.reviewIndex);
  if(action.dataset.criticalAction==='ai'){
    if(typeof global.AppLearningAdvisor?.analyzeTopic==='function')return global.AppLearningAdvisor.analyzeTopic(action.dataset.topicId,Number(action.dataset.reviewIndex));
    return global.appNotice?.('A análise por IA ainda está carregando. Tente novamente em instantes.',{title:'Pontos críticos'});
  }
  if(action.dataset.criticalAction==='snooze')return snooze(action.dataset.topicId);
}
function boot(){
  enhanceAll();
  document.addEventListener('click',onMetricClick,true);
  document.addEventListener('click',onClick,true);
  observer=new MutationObserver(()=>scheduleEnhance());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  global.addEventListener('learning-advisor:snooze-changed',rerenderDiagnostics);
  // Cognitive-profile updates can fire frequently while the app reconciles session data.
  // They are intentionally not wired to a full diagnostics rerender: doing so causes a
  // render -> MutationObserver -> enhance loop that visibly shakes the entire dashboard.
  // The latest cognitive profile is still read whenever diagnostics/cards render normally.
  [120,350,900,1800].forEach(delay=>setTimeout(enhanceAll,delay));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
global.CriticalPointActions=Object.freeze({VERSION,getStudentModel,getStudentTopicState,enrichRowFromStudentModel,computeGlobalRisk,enhanceAll,snooze,openModernRetentionMetric});
})(window);
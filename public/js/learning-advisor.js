(function installLearningAdvisor(global){
'use strict';
if(global.AppLearningAdvisor)return;

const VERSION='1.4.0';
const MAX_TOPICS=5;
const MIN_FRICTION=35;
const CACHE_TTL_MS=30*60*1000;
const ACTION_LABELS={
  active_recall:'Recuperação ativa',
  short_review:'Revisão curta',
  questions:'Questões comentadas',
  focused_restudy:'Reestudo focalizado',
  flashcards:'Flashcards',
  compare_map:'Mapa comparativo',
  law_reading:'Lei seca guiada'
};
const TYPE_LABELS={
  acquisition:'Aquisição inicial',
  retention:'Retenção',
  application:'Aplicação em questões',
  persistent:'Dificuldade persistente',
  false_mastery:'Falsa sensação de domínio',
  mixed:'Dificuldade mista'
};
const METRIC_CONFIG={
  risk:{title:'Assuntos em risco',subtitle:'O risco é calculado pelo motor de Retenção. Limpar o cronograma não apaga sinais reais de memória e desempenho.',empty:'Nenhum assunto está em risco neste momento.'},
  overdue:{title:'Revisões vencidas',subtitle:'Conteúdos cuja próxima revisão prevista já ultrapassou a data recomendada pelo motor de Retenção.',empty:'Nenhuma revisão está vencida neste momento.'},
  mastered:{title:'Assuntos dominados',subtitle:'Conteúdos com retenção alta, sem revisão vencida e evidência suficiente de domínio.',empty:'Nenhum conteúdo apresenta evidência suficiente de domínio neste momento.'}
};
let currentCandidates=[];
let lastResult=null;
let busy=false;
let activeMetric='risk';
let subjectObserver=null;

const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const safeText=(value,max=500)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);

function getRows(){try{return typeof retentionDiagnosticRows!=='undefined'&&Array.isArray(retentionDiagnosticRows)?retentionDiagnosticRows:[]}catch(_){return[]}}
function getItems(){try{return typeof editalItems!=='undefined'&&Array.isArray(editalItems)?editalItems:[]}catch(_){return[]}}
function getContestName(){try{return typeof currentConcurso!=='undefined'?String(currentConcurso||'Concurso Geral'):'Concurso Geral'}catch(_){return'Concurso Geral'}}
function getMetadata(){try{return typeof getConcursosMetadata==='function'?getConcursosMetadata()||{}:{}}catch(_){return{}}}
function getContest(create=false){
  const all=getMetadata();
  const name=getContestName();
  if(create&&!all[name])all[name]={};
  return {all,name,value:all[name]||{}};
}
function topicKey(materia,assunto){
  try{if(typeof getStudyTopicKey==='function')return getStudyTopicKey(materia,assunto)}catch(_){}
  return `${safeText(materia,180)}::${safeText(assunto,300)}`.toLowerCase();
}
function getSubjectLifecycle(materia){return getContest().value?.subjectLifecycle?.[materia]||null}
function isCompletedMateria(materia){return getSubjectLifecycle(materia)?.status==='completed'}
function findRawItem(row){
  const key=row?.state?.key;
  const items=getItems();
  if(key)return items.find(item=>topicKey(item?.materia,item?.assunto)===key)||null;
  return items.find(item=>item?.materia===row?.materia&&item?.assunto===row?.assunto)||null;
}
function findItem(row){
  const item=findRawItem(row);
  return item&&!isCompletedMateria(item.materia)?item:null;
}
function numberOr(value,fallback=null){const n=Number(value);return Number.isFinite(n)?n:fallback}

function filterDiagnosticsRows(list){
  if(!Array.isArray(list))return[];
  return list.filter(row=>{
    const item=findRawItem(row);
    return !item||!isCompletedMateria(item.materia);
  });
}
function installDiagnosticsLifecycleFilter(){
  const original=global.buildRetentionDiagnostics;
  if(typeof original!=='function'||original.__subjectLifecycleFiltered)return;
  const wrapped=function(...args){
    const diag=original.apply(this,args)||{};
    const rows=filterDiagnosticsRows(diag.rows);
    const avg=rows.length?rows.reduce((sum,row)=>sum+Number(row?.retention||0),0)/rows.length:null;
    return {
      ...diag,
      rows,
      avg,
      risk:filterDiagnosticsRows(diag.risk),
      overdue:filterDiagnosticsRows(diag.overdue),
      mastered:filterDiagnosticsRows(diag.mastered)
    };
  };
  wrapped.__subjectLifecycleFiltered=true;
  wrapped.__subjectLifecycleOriginal=original;
  global.buildRetentionDiagnostics=wrapped;
}

function computeLearningFriction(row,item){
  const state=row?.state||{};
  const qs=state.questionStats||{};
  const retention=clamp(numberOr(row?.retention,numberOr(state.retention,100)),0,100);
  const accuracyRaw=numberOr(row?.questionAccuracy,numberOr(qs.lastAccuracy,numberOr(qs.averageAccuracy,null)));
  const accuracy=accuracyRaw==null?null:clamp(accuracyRaw,0,100);
  const confidence=clamp(numberOr(qs.confidence,0),0,1);
  const lapseCount=clamp(numberOr(state.lapseCount,0),0,30);
  const reviewCount=clamp(numberOr(state.reviewCount,0),0,60);
  const sessionCount=clamp(numberOr(state.sessionCount,0),0,120);
  const totalMinutes=clamp(numberOr(state.totalMinutes,0),0,20000);
  const difficulty=clamp(numberOr(state.difficulty,5),1,10);
  const forgot=state.lastRating==='forgot';
  const hardCount=clamp(numberOr(state.ratingCounts?.hard,0),0,50);
  const acquired=Boolean(item&&(item.teoria||item.videoaula||item.questoes||item.lei_seca));
  const retentionRisk=(100-retention)*0.34;
  const questionRisk=accuracy==null?0:(100-accuracy)*(0.18+0.17*confidence);
  const lapseRisk=Math.min(14,lapseCount*3.5);
  const difficultyRisk=(difficulty-1)/9*8;
  const effortRisk=Math.min(10,reviewCount*0.8+sessionCount*0.22+totalMinutes/180);
  const persistenceRisk=(reviewCount>=2&&retention<65?8:0)+(hardCount>=2?4:0)+(forgot?6:0);
  const falseMasteryRisk=acquired&&accuracy!=null&&accuracy<55&&confidence>=0.2?8:0;
  const score=clamp(Math.round(retentionRisk+questionRisk+lapseRisk+difficultyRisk+effortRisk+persistenceRisk+falseMasteryRisk),0,100);
  return {score,components:{retentionRisk,questionRisk,lapseRisk,difficultyRisk,effortRisk,persistenceRisk,falseMasteryRisk},metrics:{retention,accuracy,confidence,lapseCount,reviewCount,sessionCount,totalMinutes,difficulty,forgot,acquired}};
}
function candidateFromEntry(entry){
  if(!entry?.item)return null;
  const friction=computeLearningFriction(entry.row,entry.item);
  if(friction.score<MIN_FRICTION)return null;
  return {topicId:topicKey(entry.item.materia,entry.item.assunto),rowIndex:entry.index,materia:safeText(entry.item.materia,180),assunto:safeText(entry.item.assunto,300),prioridade:clamp(numberOr(entry.item.prioridade,2),1,4),assuntoPrioridade:clamp(numberOr(entry.item.assunto_prioridade,1),1,20),frictionScore:friction.score,metrics:friction.metrics};
}
function collectCandidatesFromEntries(entries,limit=MAX_TOPICS){
  const candidates=(Array.isArray(entries)?entries:[]).map(candidateFromEntry).filter(Boolean).sort((a,b)=>b.frictionScore-a.frictionScore||a.prioridade-b.prioridade).slice(0,Math.max(1,Math.min(MAX_TOPICS,Number(limit)||MAX_TOPICS)));
  currentCandidates=candidates;
  return candidates;
}
function collectCandidates(limit=MAX_TOPICS){
  const entries=getRows().map((row,index)=>{const item=findItem(row);return item?{row,index,item}:null}).filter(Boolean);
  return collectCandidatesFromEntries(entries,limit);
}
function getRiskRows(){
  return getRows().map((row,index)=>{
    const item=findItem(row);if(!item)return null;
    const retention=clamp(numberOr(row?.retention,numberOr(row?.state?.retention,100)),0,100);
    const accuracy=numberOr(row?.questionAccuracy,numberOr(row?.state?.questionStats?.lastAccuracy,null));
    const risk=retention<70||Boolean(row?.retentionDue)||Boolean(row?.scheduledOverdue||row?.overdue)||(accuracy!=null&&accuracy<60);
    if(!risk)return null;
    const persistent=computeLearningFriction(row,item).score;
    return {row,index,item,retention,accuracy,persistent,riskScore:numberOr(row?.riskScore,100-retention)};
  }).filter(Boolean).sort((a,b)=>b.riskScore-a.riskScore||a.retention-b.retention);
}
function getDiagnosticsSnapshot(){try{if(typeof buildRetentionDiagnostics==='function')return buildRetentionDiagnostics()||{}}catch(_){}return{}}
function getMetricRows(kind){
  if(kind==='risk')return getRiskRows();
  const diag=getDiagnosticsSnapshot();
  const rows=Array.isArray(diag?.[kind])?diag[kind]:[];
  return rows.map(row=>{
    const item=findItem(row);if(!item)return null;
    const retention=clamp(numberOr(row?.retention,numberOr(row?.state?.retention,100)),0,100);
    const accuracy=numberOr(row?.questionAccuracy,numberOr(row?.state?.questionStats?.lastAccuracy,null));
    const index=getRows().findIndex(candidate=>candidate?.state?.key===row?.state?.key);
    const persistent=computeLearningFriction(row,item).score;
    return {row,index,item,retention,accuracy,persistent,riskScore:numberOr(row?.riskScore,100-retention)};
  }).filter(Boolean);
}
function getAnalysisCandidates(kind=activeMetric,limit=MAX_TOPICS){
  if(kind==='mastered'){currentCandidates=[];return[]}
  if(kind==='overdue')return collectCandidatesFromEntries(getMetricRows('overdue'),limit);
  return collectCandidates(limit);
}

function cacheKey(candidates){
  const compact=candidates.map(c=>[c.topicId,c.frictionScore,Math.round(c.metrics.retention),c.metrics.accuracy==null?null:Math.round(c.metrics.accuracy),c.metrics.reviewCount,c.metrics.lapseCount]);
  let hash=2166136261;const text=JSON.stringify(compact);
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return `learning_advisor_${safeText(getContestName(),80)}_${(hash>>>0).toString(16)}`;
}
function readCache(candidates){try{const raw=localStorage.getItem(cacheKey(candidates));if(!raw)return null;const parsed=JSON.parse(raw);if(Date.now()-Number(parsed?.savedAt||0)>CACHE_TTL_MS)return null;return parsed?.payload||null}catch(_){return null}}
function writeCache(candidates,payload){try{localStorage.setItem(cacheKey(candidates),JSON.stringify({savedAt:Date.now(),payload}))}catch(_){}}

function ensureDialog(){
  let overlay=document.getElementById('learningAdvisorOverlay');if(overlay)return overlay;
  overlay=document.createElement('div');overlay.id='learningAdvisorOverlay';overlay.className='learning-advisor-overlay';overlay.setAttribute('aria-hidden','true');
  overlay.innerHTML=`<section id="learningAdvisorDialog" class="learning-advisor-dialog" role="dialog" aria-modal="true" aria-labelledby="learningAdvisorTitle"><div class="learning-advisor-dialog-head"><div><span class="learning-advisor-kicker">Retenção e Diagnóstico</span><h3 id="learningAdvisorTitle">Assuntos em risco</h3><p id="learningAdvisorSubtitle">O risco é calculado pelo motor de Retenção a partir da memória, revisões e desempenho.</p></div><button id="learningAdvisorClose" class="learning-advisor-close" type="button" aria-label="Fechar">×</button></div><div id="learningAdvisorBody" class="learning-advisor-body"></div><div id="learningAdvisorFooter" class="learning-advisor-footer"></div></section>`;
  document.body.appendChild(overlay);overlay.addEventListener('click',event=>{if(event.target===overlay)closeDialog()});overlay.querySelector('#learningAdvisorClose')?.addEventListener('click',closeDialog);return overlay;
}
function openDialog(){const overlay=ensureDialog();overlay.classList.add('is-open');overlay.setAttribute('aria-hidden','false');document.body.classList.add('learning-advisor-modal-open');setTimeout(()=>overlay.querySelector('#learningAdvisorClose')?.focus(),0)}
function closeDialog(){const overlay=document.getElementById('learningAdvisorOverlay');if(!overlay)return;overlay.classList.remove('is-open');overlay.setAttribute('aria-hidden','true');document.body.classList.remove('learning-advisor-modal-open')}

function riskStateText(entry){
  const row=entry.row||{};
  if(row.scheduledOverdue||row.overdue){const days=Math.max(0,Number(row.scheduledOverdueDays??row.overdueDays)||0);return `Revisão agendada vencida${days?` há ${days}d`:''}.`}
  if(row.retentionDue)return 'Retenção pede revisão; não há revisão vencida no cronograma.';
  if(entry.retention<70)return 'Retenção baixa — revisão recomendada.';
  if(entry.accuracy!=null&&entry.accuracy<60)return 'Desempenho em questões abaixo do esperado.';
  return 'Sinal de risco identificado pelo motor de Retenção.';
}
function metricStateText(entry,kind){
  if(kind==='risk')return riskStateText(entry);
  if(kind==='overdue'){const row=entry.row||{};const days=Math.max(0,Number(row.scheduledOverdueDays??row.overdueDays)||0);return `Revisão agendada vencida${days?` há ${days}d`:''}.`}
  return 'Domínio validado pelo motor de Retenção; o assunto permanece monitorado.';
}
function renderMetricCard(entry,kind){
  const actionable=kind!=='mastered'&&entry.index>=0;
  const tag=actionable?'button':'article';
  const action=actionable?` type="button" data-learning-action="metric-review" data-row-index="${entry.index}"`:'';
  const persistent=entry.persistent>=MIN_FRICTION&&kind!=='mastered'?`<span class="learning-friction learning-friction-${entry.persistent>=70?'high':entry.persistent>=50?'medium':'low'}">Dificuldade persistente ${entry.persistent}</span>`:kind==='mastered'?'<span class="learning-friction learning-friction-low">Domínio validado</span>':'';
  return `<${tag} class="learning-risk-card${actionable?' is-clickable':''}"${action}><div class="learning-risk-copy"><span class="learning-advisor-subject">${esc(entry.item.materia)}</span><strong>${esc(entry.item.assunto)}</strong><p>${esc(metricStateText(entry,kind))}</p></div><div class="learning-risk-metrics"><span>Retenção <strong>${Math.round(entry.retention)}%</strong></span>${entry.accuracy!=null?`<span>Questões <strong>${Math.round(entry.accuracy)}%</strong></span>`:''}${persistent}</div></${tag}>`;
}
function bindMetricActions(root){root?.querySelectorAll('[data-learning-action="metric-review"]').forEach(button=>button.addEventListener('click',()=>openLocalIntervention(Number(button.dataset.rowIndex))))}
function renderMetricFooter(footer,kind,candidates){
  if(!footer)return;
  if(kind==='mastered'){footer.innerHTML='<div class="learning-advisor-footer-copy"><strong>Monitoramento contínuo</strong><span>Assuntos dominados voltam automaticamente à fila se retenção ou desempenho caírem.</span></div>';return}
  if(kind==='overdue'&&!candidates.length){footer.innerHTML='<div class="learning-advisor-footer-copy"><strong>Sem dificuldade adicional</strong><span>Estas revisões estão vencidas por prazo; o motor de Retenção não detectou sinal cognitivo adicional que justifique análise por IA.</span></div>';return}
  if(kind==='risk'&&!candidates.length){footer.innerHTML='<div class="learning-advisor-footer-copy"><strong>IA não necessária agora</strong><span>Não há dificuldade persistente suficiente para uma intervenção por IA neste momento.</span></div>';return}
  const helper=kind==='overdue'?'A IA analisará somente revisões vencidas que também apresentam dificuldade cognitiva relevante.':'A IA interpreta somente os sinais críticos; a Retenção continua sendo a autoridade.';
  footer.innerHTML=`<div class="learning-advisor-footer-copy"><strong>IA auxiliar</strong><span>${esc(helper)}</span></div><button id="learningAdvisorAnalyze" class="btn btn-secondary" type="button">Analisar dificuldades com IA</button>`;
  footer.querySelector('#learningAdvisorAnalyze')?.addEventListener('click',()=>analyze({metric:kind}).catch(()=>{}));
}
function openMetricView(kind='risk'){
  const config=METRIC_CONFIG[kind]||METRIC_CONFIG.risk;activeMetric=METRIC_CONFIG[kind]?kind:'risk';
  const overlay=ensureDialog(),title=overlay.querySelector('#learningAdvisorTitle'),subtitle=overlay.querySelector('#learningAdvisorSubtitle'),body=overlay.querySelector('#learningAdvisorBody'),footer=overlay.querySelector('#learningAdvisorFooter');
  const rows=getMetricRows(activeMetric),candidates=getAnalysisCandidates(activeMetric);
  if(title)title.textContent=config.title;if(subtitle)subtitle.textContent=config.subtitle;
  if(body)body.innerHTML=rows.length?`<div class="learning-risk-list">${rows.map(entry=>renderMetricCard(entry,activeMetric)).join('')}</div>`:`<div class="learning-advisor-empty">${esc(config.empty)}</div>`;
  bindMetricActions(body);renderMetricFooter(footer,activeMetric,candidates);openDialog();
}
function openRiskView(){openMetricView('risk')}

function renderInterventionShell(){
  const overlay=ensureDialog(),title=overlay.querySelector('#learningAdvisorTitle'),subtitle=overlay.querySelector('#learningAdvisorSubtitle'),body=overlay.querySelector('#learningAdvisorBody'),footer=overlay.querySelector('#learningAdvisorFooter');
  const isOverdue=activeMetric==='overdue';
  if(title)title.textContent='Intervenções para dificuldades persistentes';
  if(subtitle)subtitle.textContent=isOverdue?'A IA analisa somente revisões vencidas com sinal cognitivo adicional; o prazo continua sendo controlado pelo motor de Retenção.':'A Retenção continua sendo a autoridade. A IA apenas interpreta os sinais e sugere estratégias pedagógicas.';
  if(body)body.innerHTML='<div id="learningAdvisorStatus" class="learning-advisor-status" role="status" aria-live="polite"></div><div id="learningAdvisorResults" class="learning-advisor-results"></div>';
  if(footer)footer.innerHTML=`<button id="learningAdvisorBack" class="btn btn-secondary" type="button">Voltar para ${esc((METRIC_CONFIG[activeMetric]||METRIC_CONFIG.risk).title.toLowerCase())}</button>`;
  footer?.querySelector('#learningAdvisorBack')?.addEventListener('click',()=>openMetricView(activeMetric));openDialog();return overlay;
}
function renderResults(payload,candidates){
  const overlay=ensureDialog(),box=overlay.querySelector('#learningAdvisorResults'),status=overlay.querySelector('#learningAdvisorStatus');
  const interventions=Array.isArray(payload?.interventions)?payload.interventions:[];
  if(status)status.textContent=payload?.aiUsed?(activeMetric==='overdue'?'Gemini analisou somente as revisões vencidas que também apresentam dificuldade cognitiva relevante.':'Gemini analisou somente os pontos críticos selecionados pelo motor de Retenção.'):'A recomendação abaixo foi produzida pelo fallback local porque a IA não estava disponível.';
  if(!box)return;
  box.innerHTML=interventions.map(intervention=>{
    const candidate=candidates.find(c=>c.topicId===intervention.topicId);if(!candidate)return'';
    const action=ACTION_LABELS[intervention.recommendedAction]||'Intervenção focalizada';
    const type=TYPE_LABELS[intervention.diagnosisType]||'Dificuldade mista';
    const sev=intervention.severity==='high'?'Alto':intervention.severity==='medium'?'Médio':'Baixo';
    return `<article class="learning-advisor-card" data-topic-id="${esc(candidate.topicId)}"><div class="learning-advisor-card-top"><div><span class="learning-advisor-subject">${esc(candidate.materia)}</span><strong>${esc(candidate.assunto)}</strong></div><span class="learning-friction learning-friction-${candidate.frictionScore>=70?'high':candidate.frictionScore>=50?'medium':'low'}">Dificuldade persistente ${candidate.frictionScore}</span></div><div class="learning-advisor-meta"><span>${esc(type)}</span><span>Risco ${sev}</span><span>${Math.round(Number(intervention.suggestedMinutes)||20)} min</span></div><p>${esc(intervention.rationale||'Recomendação baseada nos sinais de retenção e desempenho.')}</p><div class="learning-advisor-action"><strong>${esc(action)}</strong><span>${esc(intervention.method||'Aplique a intervenção e meça novamente o desempenho.')}</span></div><div class="learning-advisor-controls"><button class="btn btn-secondary btn-sm" type="button" data-learning-action="local-intervention" data-row-index="${candidate.rowIndex}">Abrir intervenção local</button><span>O motor local valida a execução.</span></div></article>`;
  }).join('')||'<div class="learning-advisor-empty">Nenhuma intervenção foi necessária neste momento.</div>';
  box.querySelectorAll('[data-learning-action="local-intervention"]').forEach(button=>button.addEventListener('click',()=>openLocalIntervention(Number(button.dataset.rowIndex))));
}
function openLocalIntervention(rowIndex){
  if(!Number.isInteger(rowIndex)||rowIndex<0)return;
  try{if(typeof openLayeredReviewModal==='function'){closeDialog();openLayeredReviewModal(rowIndex);return}}catch(_){}
  global.appNotice?.('A recomendação da IA foi preservada, mas o fluxo local de intervenção ainda não está disponível.',{title:'IA auxiliar'});
}
async function authToken(){try{if(typeof supabaseClient==='undefined')return'';const result=await supabaseClient?.auth?.getSession?.();return result?.data?.session?.access_token||''}catch(_){return''}}
async function requestAdvice(candidates){
  const token=await authToken();if(!token)throw new Error('Sessão expirada. Entre novamente para usar a análise por IA.');
  const topics=candidates.map(({topicId,materia,assunto,prioridade,assuntoPrioridade,frictionScore,metrics})=>({topicId,materia,assunto,prioridade,assuntoPrioridade,frictionScore,metrics}));
  const response=await fetch('/api/ai/learning-diagnosis',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${token}`},body:JSON.stringify({contest:getContestName(),topics})});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error||`Falha na análise (${response.status}).`);return data;
}
async function analyze(options={}){
  if(busy)return lastResult;
  const metric=METRIC_CONFIG[options.metric]?options.metric:activeMetric;activeMetric=metric;
  const candidates=getAnalysisCandidates(metric,options.limit||MAX_TOPICS);
  if(!candidates.length){openMetricView(metric);return null}
  const overlay=renderInterventionShell(),status=overlay?.querySelector('#learningAdvisorStatus');
  const cached=!options.force&&readCache(candidates);if(cached){lastResult=cached;renderResults(cached,candidates);return cached}
  busy=true;if(status)status.textContent='Analisando padrões de dificuldade sem alterar seu cronograma…';
  try{const payload=await requestAdvice(candidates);lastResult=payload;writeCache(candidates,payload);renderResults(payload,candidates);return payload}catch(error){if(status)status.textContent=error?.message||'Não foi possível consultar a IA agora.';throw error}finally{busy=false}
}

function normalizeScheduledTopic(raw){
  try{if(typeof normalizeScheduledTopicForStudy==='function')return normalizeScheduledTopicForStudy(raw)}catch(_){}
  return String(raw||'').replace(/^🔄\s*Rev\s*\([^)]*\):\s*/i,'').trim();
}
function isRevisionScheduleTextSafe(raw){
  try{if(typeof isRevisionScheduleText==='function')return isRevisionScheduleText(raw)}catch(_){}
  return String(raw||'').startsWith('🔄 Rev');
}
function filterSchedule(schedule,materia,mode){
  Object.keys(schedule||{}).forEach(date=>{
    if(!Array.isArray(schedule[date]))return;
    schedule[date]=schedule[date].filter(raw=>{
      const text=normalizeScheduledTopic(raw);
      if(!text.startsWith(`${materia} - `))return true;
      return mode==='review_later'?isRevisionScheduleTextSafe(raw):false;
    });
    if(!schedule[date].length)delete schedule[date];
  });
}
async function confirmSubjectWorkflow(message,options){
  try{if(typeof appConfirm==='function')return await appConfirm(message,options)}catch(_){}
  return global.confirm(message);
}
async function applySubjectWorkflow(materia,mode){
  const group=getItems().filter(item=>item.materia===materia);if(!group.length)return;
  const later=mode==='review_later';
  const confirmed=await confirmSubjectWorkflow(later?`Fechar a matéria “${materia}” como conteúdo concluído e manter apenas as revisões para depois?`:`Finalizar totalmente a matéria “${materia}”? Conteúdo, questões e revisões ativas serão marcados como concluídos e os agendamentos restantes serão removidos.`,{title:later?'Concluir conteúdo da matéria':'Finalizar matéria',confirmText:later?'Deixar só revisões':'Finalizar totalmente',danger:!later});
  if(!confirmed)return;
  const context=getContest(true),metadata=context.all,contest=context.value;
  contest.subjectLifecycle=contest.subjectLifecycle||{};
  contest.adaptiveRevisionProgress=contest.adaptiveRevisionProgress||{};
  let offsets=[1,7,30];
  try{const active=getActiveRevisionOffsets();if(Array.isArray(active)&&active.length)offsets=active}catch(_){}
  group.forEach(item=>{
    item.teoria=true;item.questoes=true;
    if(!later){
      item.rev_24h=true;item.rev_7d=true;item.rev_30d=true;
      const id=String(item.id);contest.adaptiveRevisionProgress[id]=contest.adaptiveRevisionProgress[id]||{};
      offsets.forEach(offset=>{contest.adaptiveRevisionProgress[id][String(offset)]=true});
    }
  });
  filterSchedule(contest.dateSchedule||{},materia,mode);
  contest.subjectLifecycle[materia]={status:later?'review_later':'completed',updatedAt:new Date().toISOString()};
  try{
    await Promise.all(group.map(item=>typeof saveEditalItemToCloud==='function'?saveEditalItemToCloud(item):Promise.resolve()));
    if(typeof saveConcursosMetadata==='function')await saveConcursosMetadata(metadata);
  }catch(error){
    console.error(error);global.appNotice?.('A alteração não pôde ser salva completamente.',{title:'Falha ao concluir matéria'});return;
  }
  try{
    if(typeof filterDataByConcurso==='function')filterDataByConcurso();
    if(typeof renderMonthCalendar==='function')renderMonthCalendar();
    if(typeof updateModernOverview==='function')updateModernOverview();
    if(typeof renderRetentionDiagnostics==='function')renderRetentionDiagnostics();
  }catch(_){}
  enhanceSubjectHeaders();refresh();
  global.appNotice?.(later?`“${materia}” foi fechada para conteúdo. As revisões permanecem ativas para depois.`:`“${materia}” foi finalizada totalmente. Os agendamentos restantes dessa matéria foram encerrados.`,{title:later?'Matéria em revisão':'Matéria finalizada'});
}
function enhanceSubjectHeaders(){
  document.querySelectorAll('#edital-list .materia-header-row').forEach(row=>{
    row.querySelector('[data-learning-subject-controls]')?.remove();
    let materia='';try{materia=decodeURIComponent(row.getAttribute('data-materia')||'')}catch(_){materia=row.getAttribute('data-materia')||''}
    const target=row.querySelector('.materia-header-right');if(!target||!materia)return;
    const lifecycle=getSubjectLifecycle(materia);
    const controls=document.createElement('span');controls.dataset.learningSubjectControls='true';
    controls.style.cssText='display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;margin-right:6px';
    const badge=lifecycle?`<span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:.72rem;font-weight:800;background:${lifecycle.status==='completed'?'rgba(34,197,94,.16)':'rgba(59,130,246,.16)'};color:${lifecycle.status==='completed'?'#79f2a0':'#85bfff'}">${lifecycle.status==='completed'?'Finalizada':'Só revisões'}</span>`:'';
    controls.innerHTML=`${badge}<button class="btn btn-secondary btn-sm" type="button" data-subject-action="review_later" data-materia="${esc(materia)}" title="Concluir conteúdo e deixar revisões para depois">Revisar depois</button><button class="btn btn-secondary btn-sm" type="button" data-subject-action="completed" data-materia="${esc(materia)}" title="Finalizar conteúdo, questões e revisões">Finalizar</button>`;
    target.prepend(controls);
  });
}
function bindSubjectHeaders(){
  const root=document.getElementById('edital-list');if(!root)return;
  subjectObserver?.disconnect();subjectObserver=new MutationObserver(()=>enhanceSubjectHeaders());subjectObserver.observe(root,{childList:true,subtree:true});enhanceSubjectHeaders();
}

function onMetricClick(event){
  const target=event.target?.closest?.('[data-action="retention-details"][data-metric]');
  if(!target)return;
  const kind=target.dataset.metric;if(!METRIC_CONFIG[kind])return;
  event.preventDefault();event.stopImmediatePropagation();
  try{if(typeof closeRetentionMetricDetails==='function')closeRetentionMetricDetails()}catch(_){}
  openMetricView(kind);
}
function onSubjectClick(event){
  const button=event.target?.closest?.('[data-subject-action][data-materia]');if(!button)return;
  event.preventDefault();event.stopPropagation();
  const mode=button.dataset.subjectAction==='completed'?'completed':'review_later';
  applySubjectWorkflow(button.dataset.materia,mode).catch(error=>console.error(error));
}
function onKeydown(event){if(event.key==='Escape'&&document.getElementById('learningAdvisorOverlay')?.classList.contains('is-open'))closeDialog()}
function refresh(){
  const stale=document.getElementById('learningAdvisorPanel');if(stale)stale.remove();
  enhanceSubjectHeaders();
  const overlay=document.getElementById('learningAdvisorOverlay');
  if(overlay?.classList.contains('is-open')){const title=overlay.querySelector('#learningAdvisorTitle')?.textContent||'';const kind=Object.keys(METRIC_CONFIG).find(key=>METRIC_CONFIG[key].title===title);if(kind)openMetricView(kind)}
}
function diagnostics(){return Object.freeze({version:VERSION,role:'auxiliary',authority:'retention-engine',entryPoints:['risk-details','overdue-details','mastered-details'],candidateCount:getAnalysisCandidates(activeMetric).length,activeMetric,busy,hasResult:!!lastResult})}
function boot(){
  document.getElementById('learningAdvisorPanel')?.remove();ensureDialog();installDiagnosticsLifecycleFilter();bindSubjectHeaders();
  try{if(typeof renderRetentionDiagnostics==='function')renderRetentionDiagnostics()}catch(_){}
  if(!document.documentElement.dataset.learningAdvisorMetricsBound){
    document.documentElement.dataset.learningAdvisorMetricsBound='1';
    document.addEventListener('click',onMetricClick,true);document.addEventListener('click',onSubjectClick,true);document.addEventListener('keydown',onKeydown);
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);
global.addEventListener('pageshow',()=>setTimeout(boot,80));

global.AppLearningAdvisor=Object.freeze({VERSION,computeLearningFriction,collectCandidates,getRiskRows,getMetricRows,getAnalysisCandidates,openRiskView,openMetricView,analyze,applySubjectWorkflow,refresh,close:closeDialog,getDiagnostics:diagnostics});
})(window);

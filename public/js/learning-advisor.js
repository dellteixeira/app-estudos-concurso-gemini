(function installLearningAdvisor(global){
'use strict';
if(global.AppLearningAdvisor)return;

const VERSION='1.2.0';
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
let currentCandidates=[];
let lastResult=null;
let busy=false;

const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const safeText=(value,max=500)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);

function getRows(){
  try{return typeof retentionDiagnosticRows!=='undefined'&&Array.isArray(retentionDiagnosticRows)?retentionDiagnosticRows:[]}catch(_){return[]}
}
function getItems(){
  try{return typeof editalItems!=='undefined'&&Array.isArray(editalItems)?editalItems:[]}catch(_){return[]}
}
function getContestName(){
  try{return typeof currentConcurso!=='undefined'?String(currentConcurso||'Concurso Geral'):'Concurso Geral'}catch(_){return'Concurso Geral'}
}
function topicKey(materia,assunto){
  try{if(typeof getStudyTopicKey==='function')return getStudyTopicKey(materia,assunto)}catch(_){}
  return `${safeText(materia,180)}::${safeText(assunto,300)}`.toLowerCase();
}
function findItem(row){
  const key=row?.state?.key;
  const items=getItems();
  if(key)return items.find(item=>topicKey(item?.materia,item?.assunto)===key)||null;
  return items.find(item=>item?.materia===row?.materia&&item?.assunto===row?.assunto)||null;
}
function numberOr(value,fallback=null){const n=Number(value);return Number.isFinite(n)?n:fallback}

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
  return {
    score,
    components:{retentionRisk,questionRisk,lapseRisk,difficultyRisk,effortRisk,persistenceRisk,falseMasteryRisk},
    metrics:{retention,accuracy,confidence,lapseCount,reviewCount,sessionCount,totalMinutes,difficulty,forgot,acquired}
  };
}

function collectCandidates(limit=MAX_TOPICS){
  const rows=getRows();
  const candidates=rows.map((row,index)=>{
    const item=findItem(row);
    if(!item)return null;
    const friction=computeLearningFriction(row,item);
    return {
      topicId:topicKey(item.materia,item.assunto),
      rowIndex:index,
      materia:safeText(item.materia,180),
      assunto:safeText(item.assunto,300),
      prioridade:clamp(numberOr(item.prioridade,2),1,4),
      assuntoPrioridade:clamp(numberOr(item.assunto_prioridade,1),1,20),
      frictionScore:friction.score,
      metrics:friction.metrics
    };
  }).filter(Boolean).filter(item=>item.frictionScore>=MIN_FRICTION)
    .sort((a,b)=>b.frictionScore-a.frictionScore||a.prioridade-b.prioridade)
    .slice(0,Math.max(1,Math.min(MAX_TOPICS,Number(limit)||MAX_TOPICS)));
  currentCandidates=candidates;
  return candidates;
}

function getRiskRows(){
  return getRows().map((row,index)=>{
    const item=findItem(row);
    if(!item)return null;
    const retention=clamp(numberOr(row?.retention,numberOr(row?.state?.retention,100)),0,100);
    const accuracy=numberOr(row?.questionAccuracy,numberOr(row?.state?.questionStats?.lastAccuracy,null));
    const risk=retention<70||Boolean(row?.retentionDue)||Boolean(row?.scheduledOverdue||row?.overdue)||(accuracy!=null&&accuracy<60);
    if(!risk)return null;
    const persistent=computeLearningFriction(row,item).score;
    return {row,index,item,retention,accuracy,persistent,riskScore:numberOr(row?.riskScore,100-retention)};
  }).filter(Boolean).sort((a,b)=>b.riskScore-a.riskScore||a.retention-b.retention);
}

function cacheKey(candidates){
  const compact=candidates.map(c=>[c.topicId,c.frictionScore,Math.round(c.metrics.retention),c.metrics.accuracy==null?null:Math.round(c.metrics.accuracy),c.metrics.reviewCount,c.metrics.lapseCount]);
  let hash=2166136261;
  const text=JSON.stringify(compact);
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return `learning_advisor_${safeText(getContestName(),80)}_${(hash>>>0).toString(16)}`;
}
function readCache(candidates){
  try{const raw=localStorage.getItem(cacheKey(candidates));if(!raw)return null;const parsed=JSON.parse(raw);if(Date.now()-Number(parsed?.savedAt||0)>CACHE_TTL_MS)return null;return parsed?.payload||null}catch(_){return null}
}
function writeCache(candidates,payload){
  try{localStorage.setItem(cacheKey(candidates),JSON.stringify({savedAt:Date.now(),payload}))}catch(_){}
}

function ensureDialog(){
  let overlay=document.getElementById('learningAdvisorOverlay');
  if(overlay)return overlay;
  overlay=document.createElement('div');
  overlay.id='learningAdvisorOverlay';
  overlay.className='learning-advisor-overlay';
  overlay.setAttribute('aria-hidden','true');
  overlay.innerHTML=`<section id="learningAdvisorDialog" class="learning-advisor-dialog" role="dialog" aria-modal="true" aria-labelledby="learningAdvisorTitle"><div class="learning-advisor-dialog-head"><div><span class="learning-advisor-kicker">Retenção e Diagnóstico</span><h3 id="learningAdvisorTitle">Assuntos em risco</h3><p id="learningAdvisorSubtitle">O risco é calculado pelo motor de Retenção a partir da memória, revisões e desempenho.</p></div><button id="learningAdvisorClose" class="learning-advisor-close" type="button" aria-label="Fechar">×</button></div><div id="learningAdvisorBody" class="learning-advisor-body"></div><div id="learningAdvisorFooter" class="learning-advisor-footer"></div></section>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',event=>{if(event.target===overlay)closeDialog()});
  overlay.querySelector('#learningAdvisorClose')?.addEventListener('click',closeDialog);
  return overlay;
}

function openDialog(){
  const overlay=ensureDialog();
  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden','false');
  document.body.classList.add('learning-advisor-modal-open');
  setTimeout(()=>overlay.querySelector('#learningAdvisorClose')?.focus(),0);
}
function closeDialog(){
  const overlay=document.getElementById('learningAdvisorOverlay');
  if(!overlay)return;
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden','true');
  document.body.classList.remove('learning-advisor-modal-open');
}

function riskStateText(entry){
  const row=entry.row||{};
  if(row.scheduledOverdue||row.overdue){
    const days=Math.max(0,Number(row.scheduledOverdueDays??row.overdueDays)||0);
    return `Revisão agendada vencida${days?` há ${days}d`:''}.`;
  }
  if(row.retentionDue)return 'Retenção pede revisão; não há revisão vencida no cronograma.';
  if(entry.retention<70)return 'Retenção baixa — revisão recomendada.';
  if(entry.accuracy!=null&&entry.accuracy<60)return 'Desempenho em questões abaixo do esperado.';
  return 'Sinal de risco identificado pelo motor de Retenção.';
}

function openRiskView(){
  const overlay=ensureDialog();
  const title=overlay.querySelector('#learningAdvisorTitle');
  const subtitle=overlay.querySelector('#learningAdvisorSubtitle');
  const body=overlay.querySelector('#learningAdvisorBody');
  const footer=overlay.querySelector('#learningAdvisorFooter');
  const risks=getRiskRows();
  const candidates=collectCandidates();
  if(title)title.textContent='Assuntos em risco';
  if(subtitle)subtitle.textContent='O risco é calculado pelo motor de Retenção. Limpar o cronograma não apaga sinais reais de memória e desempenho.';
  if(body)body.innerHTML=risks.length?`<div class="learning-risk-list">${risks.map(entry=>`<article class="learning-risk-card"><div class="learning-risk-copy"><span class="learning-advisor-subject">${esc(entry.item.materia)}</span><strong>${esc(entry.item.assunto)}</strong><p>${esc(riskStateText(entry))}</p></div><div class="learning-risk-metrics"><span>Retenção <strong>${Math.round(entry.retention)}%</strong></span>${entry.accuracy!=null?`<span>Questões <strong>${Math.round(entry.accuracy)}%</strong></span>`:''}${entry.persistent>=MIN_FRICTION?`<span class="learning-friction learning-friction-${entry.persistent>=70?'high':entry.persistent>=50?'medium':'low'}">Dificuldade persistente ${entry.persistent}</span>`:''}</div></article>`).join('')}</div>`:'<div class="learning-advisor-empty">Nenhum assunto está em risco neste momento.</div>';
  if(footer)footer.innerHTML=`<div class="learning-advisor-footer-copy"><strong>IA auxiliar</strong><span>A IA interpreta somente os sinais críticos; a Retenção continua sendo a autoridade.</span></div><button id="learningAdvisorAnalyze" class="btn btn-secondary" type="button" ${candidates.length?'':'disabled'}>Analisar dificuldades com IA</button>`;
  footer?.querySelector('#learningAdvisorAnalyze')?.addEventListener('click',async event=>{
    const button=event.currentTarget;
    if(button?.disabled)return;
    const original=button.textContent;
    button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Analisando…';
    try{await analyze({force:true})}
    catch(error){
      const message=error?.message||'Não foi possível consultar a IA agora.';
      global.appNotice?.(message,{title:'IA auxiliar'});
    }finally{
      if(button?.isConnected){button.disabled=false;button.removeAttribute('aria-busy');button.textContent=original}
    }
  });
  openDialog();
}

function renderInterventionShell(){
  const overlay=ensureDialog();
  const title=overlay.querySelector('#learningAdvisorTitle');
  const subtitle=overlay.querySelector('#learningAdvisorSubtitle');
  const body=overlay.querySelector('#learningAdvisorBody');
  const footer=overlay.querySelector('#learningAdvisorFooter');
  if(title)title.textContent='Intervenções para dificuldades persistentes';
  if(subtitle)subtitle.textContent='A Retenção continua sendo a autoridade. A IA apenas interpreta os sinais e sugere estratégias pedagógicas.';
  if(body)body.innerHTML='<div id="learningAdvisorStatus" class="learning-advisor-status" role="status" aria-live="polite"></div><div id="learningAdvisorResults" class="learning-advisor-results"></div>';
  if(footer)footer.innerHTML='<button id="learningAdvisorBack" class="btn btn-secondary" type="button">Voltar aos assuntos em risco</button>';
  footer?.querySelector('#learningAdvisorBack')?.addEventListener('click',openRiskView);
  openDialog();
  return overlay;
}

function renderResults(payload,candidates){
  const overlay=ensureDialog();
  const box=overlay.querySelector('#learningAdvisorResults');
  const status=overlay.querySelector('#learningAdvisorStatus');
  const interventions=Array.isArray(payload?.interventions)?payload.interventions:[];
  if(status)status.textContent=payload?.aiUsed?'Gemini analisou somente os pontos críticos selecionados pelo motor de Retenção.':'A recomendação abaixo foi produzida pelo fallback local porque a IA não estava disponível.';
  if(!box)return;
  box.innerHTML=interventions.map(intervention=>{
    const candidate=candidates.find(c=>c.topicId===intervention.topicId);
    if(!candidate)return'';
    const action=ACTION_LABELS[intervention.recommendedAction]||'Intervenção focalizada';
    const type=TYPE_LABELS[intervention.diagnosisType]||'Dificuldade mista';
    const sev=intervention.severity==='high'?'Alto':intervention.severity==='medium'?'Médio':'Baixo';
    return `<article class="learning-advisor-card" data-topic-id="${esc(candidate.topicId)}"><div class="learning-advisor-card-top"><div><span class="learning-advisor-subject">${esc(candidate.materia)}</span><strong>${esc(candidate.assunto)}</strong></div><span class="learning-friction learning-friction-${candidate.frictionScore>=70?'high':candidate.frictionScore>=50?'medium':'low'}">Dificuldade persistente ${candidate.frictionScore}</span></div><div class="learning-advisor-meta"><span>${esc(type)}</span><span>Risco ${sev}</span><span>${Math.round(Number(intervention.suggestedMinutes)||20)} min</span></div><p>${esc(intervention.rationale||'Recomendação baseada nos sinais de retenção e desempenho.')}</p><div class="learning-advisor-action"><strong>${esc(action)}</strong><span>${esc(intervention.method||'Aplique a intervenção e meça novamente o desempenho.')}</span></div><div class="learning-advisor-controls"><button class="btn btn-secondary btn-sm" type="button" data-learning-action="local-intervention" data-row-index="${candidate.rowIndex}">Abrir intervenção local</button><span>O motor local valida a execução.</span></div></article>`;
  }).join('')||'<div class="learning-advisor-empty">Nenhuma intervenção foi necessária neste momento.</div>';
  box.querySelectorAll('[data-learning-action="local-intervention"]').forEach(button=>button.addEventListener('click',()=>openLocalIntervention(Number(button.dataset.rowIndex))));
}

function openLocalIntervention(rowIndex){
  if(!Number.isInteger(rowIndex)||rowIndex<0)return;
  try{
    if(typeof openLayeredReviewModal==='function'){
      closeDialog();
      openLayeredReviewModal(rowIndex);
      return;
    }
  }catch(_){}
  global.appNotice?.('A recomendação da IA foi preservada, mas o fluxo local de intervenção ainda não está disponível.',{title:'IA auxiliar'});
}

async function authToken(){
  try{const result=await supabaseClient?.auth?.getSession?.();return result?.data?.session?.access_token||''}catch(_){return''}
}

async function requestAdvice(candidates){
  const token=await authToken();
  if(!token)throw new Error('Sessão expirada. Entre novamente para usar a análise por IA.');
  const response=await fetch('/api/ai/learning-diagnosis',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${token}`},body:JSON.stringify({contest:getContestName(),topics:candidates.map(({topicId,materia,assunto,prioridade,assuntoPrioridade,frictionScore,metrics})=>({topicId,materia,assunto,prioridade,assuntoPrioridade,frictionScore,metrics}))})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error||`Falha na análise (${response.status}).`);
  return data;
}

async function analyze(options={}){
  if(busy)return lastResult;
  const overlay=renderInterventionShell();
  const status=overlay?.querySelector('#learningAdvisorStatus');
  const candidates=collectCandidates(options.limit||MAX_TOPICS);
  if(!candidates.length){if(status)status.textContent='Ainda não há dificuldade persistente suficiente para uma análise por IA.';return null}
  const cached=!options.force&&readCache(candidates);
  if(cached){lastResult=cached;renderResults(cached,candidates);return cached}
  busy=true;if(status)status.textContent='Analisando padrões de dificuldade sem alterar seu cronograma…';
  try{
    const payload=await requestAdvice(candidates);
    lastResult=payload;writeCache(candidates,payload);renderResults(payload,candidates);return payload;
  }catch(error){
    if(status)status.textContent=error?.message||'Não foi possível consultar a IA agora.';
    throw error;
  }finally{busy=false}
}

function onRiskMetricClick(event){
  const target=event.target?.closest?.('[data-action="retention-details"][data-metric="risk"]');
  if(!target)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openRiskView();
}

function onKeydown(event){
  const overlay=document.getElementById('learningAdvisorOverlay');
  if(!overlay?.classList.contains('is-open'))return;
  if(event.key==='Escape'){event.preventDefault();closeDialog();return}
  if(event.key==='Enter'&&!event.defaultPrevented){
    const active=document.activeElement;
    if(active?.matches?.('button,a,input,select,textarea'))return;
    const primary=overlay.querySelector('#learningAdvisorAnalyze:not(:disabled), [data-learning-action="local-intervention"], #learningAdvisorBack');
    if(primary){event.preventDefault();primary.click()}
  }
}

function refresh(){
  const stale=document.getElementById('learningAdvisorPanel');
  if(stale)stale.remove();
  const overlay=document.getElementById('learningAdvisorOverlay');
  if(overlay?.classList.contains('is-open')){
    const title=overlay.querySelector('#learningAdvisorTitle')?.textContent||'';
    if(title==='Assuntos em risco')openRiskView();
  }
}
function diagnostics(){return Object.freeze({version:VERSION,role:'auxiliary',authority:'retention-engine',entryPoint:'risk-details',candidateCount:collectCandidates().length,busy,hasResult:!!lastResult})}

function boot(){
  document.getElementById('learningAdvisorPanel')?.remove();
  ensureDialog();
  if(!document.documentElement.dataset.learningAdvisorRiskBound){
    document.documentElement.dataset.learningAdvisorRiskBound='1';
    document.addEventListener('click',onRiskMetricClick,true);
    document.addEventListener('keydown',onKeydown);
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);
global.addEventListener('pageshow',()=>setTimeout(boot,80));

global.AppLearningAdvisor=Object.freeze({VERSION,computeLearningFriction,collectCandidates,getRiskRows,openRiskView,analyze,refresh,close:closeDialog,getDiagnostics:diagnostics});
})(window);

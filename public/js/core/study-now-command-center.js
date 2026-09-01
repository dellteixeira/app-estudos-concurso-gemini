(function installStudyNowCommandCenter(global){
'use strict';
if(global.AppStudyNowCommandCenter)return;

const VERSION='1.0.1';
const UI_ENABLED=false;
const clean=(value,max=500)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
let installed=false;
let currentView=null;

function scope(){
  return {
    userId:clean(global.currentUser?.id||'guest',120),
    contest:clean(global.currentConcurso||'Concurso Geral',180)
  };
}

function normalizeBoardEvidence(source){
  if(!source)return null;
  const provenance=source.source&&typeof source.source==='object'?source.source:{};
  return {
    board:clean(source.board,100),
    priority:clamp(source.priority??source.incidence,0,100),
    confidence:clamp(source.confidence,0,100),
    questions:Math.max(0,Number(source.questions)||0),
    years:Math.max(0,Number(source.years)||0),
    asOf:clean(source.asOf,40),
    source:{
      title:clean(provenance.title||provenance.name,240),
      type:clean(provenance.type,80),
      url:clean(provenance.url,640)
    }
  };
}

function buildViewModel(recommendation){
  if(!recommendation?.topicId)return null;
  return Object.freeze({
    authority:'retention-engine',
    autoSchedule:false,
    generatedAt:clean(recommendation.generatedAt,60),
    topicId:clean(recommendation.topicId,640),
    materia:clean(recommendation.materia,180),
    assunto:clean(recommendation.assunto,400),
    priorityScore:clamp(recommendation.priorityScore,0,100),
    method:clean(recommendation.method,80),
    methodLabel:clean(recommendation.methodLabel||recommendation.method,120),
    suggestedMinutes:clamp(recommendation.suggestedMinutes,5,180),
    reasons:(Array.isArray(recommendation.reasons)?recommendation.reasons:[]).slice(0,5).map(item=>clean(item,220)).filter(Boolean),
    boardEvidence:normalizeBoardEvidence(recommendation.boardEvidence),
    errorLabel:clean(recommendation.errorLabel||recommendation.errorType,120),
    alternatives:(Array.isArray(recommendation.alternatives)?recommendation.alternatives:[]).slice(0,3).map(item=>({
      topicId:clean(item.topicId,640),
      materia:clean(item.materia,180),
      assunto:clean(item.assunto,300),
      score:clamp(item.score,0,100),
      methodLabel:clean(item.methodLabel||item.method,100),
      boardEvidence:normalizeBoardEvidence(item.boardEvidence)
    })).filter(item=>item.topicId)
  });
}

function latestRecommendation(){
  try{
    const engine=global.AppNextBestStudyAction;
    const latest=engine?.latest?.();
    if(latest)return latest;
    const current=scope();
    return engine?.refreshFromProfile?.(current.userId,current.contest)||null;
  }catch(_){return null}
}

function removePanel(){
  try{document.getElementById('studyNowCommandCenter')?.remove?.()}catch(_){/* no-op */}
}

function ensureStyles(){
  if(!UI_ENABLED)return;
  if(document.querySelector('style[data-study-now-command-center]'))return;
  const style=document.createElement('style');
  style.dataset.studyNowCommandCenter='1';
  style.textContent=`
#studyNowCommandCenter{margin:18px 0;padding:20px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:18px;background:color-mix(in srgb,var(--card-bg,#fff) 94%,transparent);box-shadow:0 10px 28px rgba(15,23,42,.08)}
#studyNowCommandCenter .sn-head{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
#studyNowCommandCenter .sn-kicker{font-size:.75rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.72}
#studyNowCommandCenter h2{margin:.25rem 0 .35rem;font-size:clamp(1.15rem,2vw,1.55rem)}
#studyNowCommandCenter .sn-topic{font-weight:760;font-size:1rem;overflow-wrap:anywhere}
#studyNowCommandCenter .sn-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
#studyNowCommandCenter .sn-chip{padding:6px 10px;border-radius:999px;background:color-mix(in srgb,currentColor 8%,transparent);font-size:.82rem;font-weight:700}
#studyNowCommandCenter .sn-reasons{margin:14px 0 0;padding-left:1.2rem;display:grid;gap:5px}
#studyNowCommandCenter .sn-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
#studyNowCommandCenter .sn-actions button{min-height:44px}
#studyNowCommandCenter .sn-board{margin-top:12px;padding:10px 12px;border-left:3px solid currentColor;background:color-mix(in srgb,currentColor 5%,transparent);font-size:.86rem;overflow-wrap:anywhere}
#studyNowCommandCenter .sn-alts{margin-top:16px;display:grid;gap:8px}
#studyNowCommandCenter .sn-alt{padding:10px 12px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:12px;font-size:.88rem}
#studyNowCommandCenter .sn-empty{opacity:.74;margin:0}
@media(max-width:700px){#studyNowCommandCenter{padding:16px;border-radius:14px}#studyNowCommandCenter .sn-actions{display:grid;grid-template-columns:1fr}#studyNowCommandCenter .sn-actions button{width:100%}}
`;
  document.head.appendChild(style);
}

function findHost(){
  const retention=document.getElementById('retentionDiagnosticPanel');
  if(retention?.parentElement)return {host:retention.parentElement,before:retention};
  const dashboard=document.getElementById('app-dashboard')||document.getElementById('dashboard');
  if(dashboard)return {host:dashboard,before:dashboard.firstElementChild};
  return {host:document.querySelector('main')||document.body,before:null};
}

function ensurePanel(){
  if(!UI_ENABLED){removePanel();return null}
  let panel=document.getElementById('studyNowCommandCenter');
  if(panel)return panel;
  ensureStyles();
  panel=document.createElement('section');
  panel.id='studyNowCommandCenter';
  panel.setAttribute('aria-labelledby','studyNowTitle');
  panel.innerHTML='<div class="sn-head"><div><span class="sn-kicker">Prioridade cognitiva</span><h2 id="studyNowTitle">O que estudar agora?</h2><div class="sn-topic" data-sn-topic></div><div class="sn-meta" data-sn-meta></div></div></div><ul class="sn-reasons" data-sn-reasons></ul><div class="sn-board" data-sn-board hidden></div><div class="sn-actions"><button type="button" class="btn btn-primary" data-sn-start>Estudar agora</button><button type="button" class="btn btn-secondary" data-sn-tutor>Perguntar ao Tutor</button><button type="button" class="btn btn-secondary" data-sn-refresh>Atualizar recomendação</button></div><div class="sn-alts" data-sn-alts></div>';
  const target=findHost();
  target.host.insertBefore(panel,target.before||null);
  panel.querySelector('[data-sn-start]')?.addEventListener('click',startStudy);
  panel.querySelector('[data-sn-tutor]')?.addEventListener('click',openTutor);
  panel.querySelector('[data-sn-refresh]')?.addEventListener('click',refresh);
  return panel;
}

function appendChip(container,text){
  if(!text)return;
  const span=document.createElement('span');
  span.className='sn-chip';
  span.textContent=text;
  container.appendChild(span);
}

function render(recommendation){
  currentView=buildViewModel(recommendation);
  if(!UI_ENABLED){removePanel();return currentView}
  const panel=ensurePanel();
  if(!panel)return currentView;
  const topic=panel.querySelector('[data-sn-topic]');
  const meta=panel.querySelector('[data-sn-meta]');
  const reasons=panel.querySelector('[data-sn-reasons]');
  const board=panel.querySelector('[data-sn-board]');
  const alts=panel.querySelector('[data-sn-alts]');
  const start=panel.querySelector('[data-sn-start]');
  const tutor=panel.querySelector('[data-sn-tutor]');
  [topic,meta,reasons,board,alts].forEach(node=>{if(node)node.textContent=''});

  if(!currentView){
    if(topic){topic.textContent='Ainda não há dados suficientes para uma recomendação.';topic.classList.add('sn-empty')}
    if(start)start.disabled=true;
    if(tutor)tutor.disabled=true;
    if(board)board.hidden=true;
    return null;
  }
  topic?.classList.remove('sn-empty');
  if(topic)topic.textContent=[currentView.materia,currentView.assunto].filter(Boolean).join(' · ');
  if(meta){
    appendChip(meta,`Prioridade ${Math.round(currentView.priorityScore)}%`);
    appendChip(meta,currentView.methodLabel);
    appendChip(meta,`${Math.round(currentView.suggestedMinutes)} min`);
    if(currentView.errorLabel)appendChip(meta,currentView.errorLabel);
  }
  if(reasons){
    const items=currentView.reasons.length?currentView.reasons:['prioridade cognitiva relativa mais alta'];
    items.forEach(text=>{const li=document.createElement('li');li.textContent=text;reasons.appendChild(li)});
  }
  if(board&&currentView.boardEvidence){
    const ev=currentView.boardEvidence;
    const source=ev.source?.title?` · fonte: ${ev.source.title}`:'';
    board.textContent=`Banca ${ev.board||'identificada'}: incidência ${Math.round(ev.priority)}% com confiança ${Math.round(ev.confidence)}%${source}`;
    board.hidden=false;
  }else if(board)board.hidden=true;
  if(alts&&currentView.alternatives.length){
    const label=document.createElement('strong');label.textContent='Alternativas próximas';alts.appendChild(label);
    currentView.alternatives.forEach(item=>{const div=document.createElement('div');div.className='sn-alt';div.textContent=`${item.materia} · ${item.assunto} — ${Math.round(item.score)}% · ${item.methodLabel}`;alts.appendChild(div)});
  }
  if(start)start.disabled=false;
  if(tutor)tutor.disabled=!global.AppContextualAiTutor?.open;
  return currentView;
}

function refresh(){
  try{
    const current=scope();
    const recommendation=global.AppNextBestStudyAction?.refreshFromProfile?.(current.userId,current.contest)||latestRecommendation();
    return render(recommendation);
  }catch(_){return render(null)}
}

function startStudy(){
  if(!currentView)return false;
  global.dispatchEvent?.(new CustomEvent('app:study-now-requested',{detail:{...currentView,authority:'retention-engine',autoSchedule:false}}));
  const riskButton=document.querySelector('[data-action="retention-details"][data-metric="risk"]');
  if(riskButton?.click){riskButton.click();return true}
  const retention=document.getElementById('retentionDiagnosticPanel');
  retention?.scrollIntoView?.({behavior:'smooth',block:'start'});
  return true;
}

function openTutor(){
  if(!currentView||!global.AppContextualAiTutor?.open)return false;
  global.AppContextualAiTutor.open(currentView.topicId,{materia:currentView.materia,assunto:currentView.assunto});
  return true;
}

function install(){
  if(installed)return refresh();
  installed=true;
  if(UI_ENABLED)ensurePanel();else removePanel();
  global.addEventListener?.('app:next-best-study-action',event=>render(event?.detail||null));
  global.addEventListener?.('app:cognitive-profile-updated',()=>refresh());
  global.addEventListener?.('app:exam-board-intelligence-updated',()=>refresh());
  return refresh();
}

global.AppStudyNowCommandCenter=Object.freeze({version:VERSION,uiEnabled:UI_ENABLED,scope,buildViewModel,latestRecommendation,render,refresh,startStudy,openTutor,install,current:()=>currentView});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window);

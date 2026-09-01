(function installDomainRiskDashboard(global){
'use strict';
if(global.AppDomainRiskDashboard)return;

const SCHEMA_VERSION=1;
const MAX_ATTENTION=6;
let lastFingerprint='';
let retryTimer=null;

const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,Number(value)||0));
const pct=value=>Number.isFinite(Number(value))?`${Math.round(Number(value))}%`:'—';
const safe=value=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim();
const escapeHtml=value=>safe(value).replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[char]));

function sourceSnapshot(){
  try{return global.AppCognitiveDataSource?.snapshot?.()||null}catch(_){return null}
}

function resolveProfile(){
  const source=sourceSnapshot();
  if(!source?.userId)return null;
  try{return global.AppCognitiveProfile?.read?.(source.userId,source.contest)||global.AppCognitiveProfileRuntime?.refresh?.({force:false})||null}catch(_){return null}
}

function topicEntries(profile){
  return Object.entries(profile?.topicState||{}).map(([key,topic],index)=>({key,index,topic,domain:topic?.domainRisk||null}));
}

function weightedAverage(entries,field){
  let total=0;
  let weighted=0;
  entries.forEach(entry=>{
    const value=Number(entry.domain?.[field]);
    if(!Number.isFinite(value))return;
    const weight=Math.max(1,Number(entry.domain?.priorityWeight)||1);
    total+=weight;
    weighted+=value*weight;
  });
  return total?Math.round(weighted/total):null;
}

function evidenceCoverage(entries){
  if(!entries.length)return 0;
  const supported=entries.filter(entry=>['medium','high'].includes(entry.domain?.evidenceLevel)).length;
  return Math.round(supported/entries.length*100);
}

function riskLabel(value){
  return value==='high'?'Alto':value==='medium'?'Médio':'Baixo';
}
function evidenceLabel(value){
  return value==='high'?'evidência alta':value==='medium'?'evidência média':'evidência inicial';
}
function trendLabel(value){
  return value==='improving'?'↑ melhorando':value==='declining'?'↓ caindo':value==='stable'?'→ estável':'• aprendendo padrão';
}

function getAttentionQueue(profile,limit=MAX_ATTENTION){
  const entries=topicEntries(profile);
  return entries
    .filter(entry=>entry.domain&&entry.domain.riskBand!=='low')
    .slice()
    .sort((a,b)=>{
      const risk=Number(b.domain.forgettingRisk)-Number(a.domain.forgettingRisk);
      if(risk)return risk;
      const mastery=Number(a.domain.masteryScore)-Number(b.domain.masteryScore);
      if(mastery)return mastery;
      return a.index-b.index;
    })
    .slice(0,Math.max(1,Number(limit)||MAX_ATTENTION));
}

function buildViewModel(profile){
  const entries=topicEntries(profile);
  const attention=getAttentionQueue(profile);
  return Object.freeze({
    schemaVersion:SCHEMA_VERSION,
    observedTopics:entries.length,
    weightedMastery:Number(profile?.metrics?.weightedMastery)||0,
    weightedCoverage:Number(profile?.metrics?.weightedCoverage)||0,
    predictedRetention7d:weightedAverage(entries,'predictedRetention7d'),
    evidenceCoverage:evidenceCoverage(entries),
    highRiskTopics:Number(profile?.metrics?.highRiskTopics)||0,
    mediumRiskTopics:Number(profile?.metrics?.mediumRiskTopics)||0,
    atRiskTopics:Number(profile?.metrics?.atRiskTopics)||0,
    attention
  });
}

function setText(id,value){
  const element=document.getElementById(id);
  if(element)element.textContent=value;
}
function setProgress(id,value){
  const element=document.getElementById(id);
  if(!element)return;
  element.max=100;
  element.value=clamp(value);
}

function renderAttention(viewModel){
  const list=document.getElementById('phase6aAttentionList');
  if(!list)return;
  if(!viewModel.observedTopics){
    list.innerHTML='<div class="domain-risk-empty">Os indicadores aparecerão conforme houver sessões, revisões e questões registradas.</div>';
    return;
  }
  if(!viewModel.attention.length){
    list.innerHTML='<div class="domain-risk-empty domain-risk-empty-success">Nenhum assunto apresenta risco cognitivo relevante neste momento.</div>';
    return;
  }
  list.innerHTML=viewModel.attention.map(entry=>{
    const topic=entry.topic||{};
    const domain=entry.domain||{};
    return `<article class="domain-risk-topic risk-${escapeHtml(domain.riskBand)}" data-topic-key="${escapeHtml(entry.key)}">
      <div class="domain-risk-topic-head">
        <div><strong>${escapeHtml(topic.materia)} — ${escapeHtml(topic.assunto)}</strong><span>${escapeHtml(trendLabel(domain.trend))} · ${escapeHtml(evidenceLabel(domain.evidenceLevel))}</span></div>
        <span class="domain-risk-topic-badge ${escapeHtml(domain.riskBand)}">${escapeHtml(riskLabel(domain.riskBand))}</span>
      </div>
      <div class="domain-risk-topic-metrics">
        <span><b>${pct(domain.masteryScore)}</b> domínio</span>
        <span><b>${pct(domain.predictedRetention7d)}</b> retenção em 7d</span>
        <span><b>${pct(domain.forgettingRisk)}</b> risco</span>
      </div>
    </article>`;
  }).join('');
}

function emitUpdate(profile,viewModel){
  const fingerprint=JSON.stringify([
    profile?.userId,profile?.contest,profile?.updatedAt,
    viewModel.weightedMastery,viewModel.weightedCoverage,viewModel.predictedRetention7d,
    viewModel.highRiskTopics,viewModel.mediumRiskTopics
  ]);
  if(fingerprint===lastFingerprint)return;
  lastFingerprint=fingerprint;
  try{
    global.dispatchEvent(new CustomEvent('app:domain-risk-updated',{detail:{
      userId:profile?.userId||null,
      contest:profile?.contest||null,
      weightedMastery:viewModel.weightedMastery,
      weightedCoverage:viewModel.weightedCoverage,
      predictedRetention7d:viewModel.predictedRetention7d,
      evidenceCoverage:viewModel.evidenceCoverage,
      highRiskTopics:viewModel.highRiskTopics,
      mediumRiskTopics:viewModel.mediumRiskTopics,
      atRiskTopics:viewModel.atRiskTopics
    }}));
  }catch(_){}
}

function render(profile=resolveProfile()){
  const panel=document.getElementById('phase6aDomainRiskPanel');
  if(!panel)return null;
  if(!profile){
    setText('phase6aWeightedMastery','—');
    setText('phase6aWeightedCoverage','—');
    setText('phase6aPredictedRetention','—');
    setText('phase6aHighRisk','0');
    ['phase6aWeightedMasteryProgress','phase6aWeightedCoverageProgress','phase6aPredictedRetentionProgress','phase6aEvidenceProgress'].forEach(id=>setProgress(id,0));
    renderAttention({observedTopics:0,attention:[]});
    return null;
  }
  const viewModel=buildViewModel(profile);
  setText('phase6aWeightedMastery',pct(viewModel.weightedMastery));
  setText('phase6aWeightedCoverage',pct(viewModel.weightedCoverage));
  setText('phase6aPredictedRetention',pct(viewModel.predictedRetention7d));
  setText('phase6aHighRisk',String(viewModel.highRiskTopics));
  setText('phase6aEvidenceLabel',`${viewModel.evidenceCoverage}% dos assuntos com evidência média/alta`);
  setProgress('phase6aWeightedMasteryProgress',viewModel.weightedMastery);
  setProgress('phase6aWeightedCoverageProgress',viewModel.weightedCoverage);
  setProgress('phase6aPredictedRetentionProgress',viewModel.predictedRetention7d||0);
  setProgress('phase6aEvidenceProgress',viewModel.evidenceCoverage);
  renderAttention(viewModel);
  emitUpdate(profile,viewModel);
  return viewModel;
}

function findTopicInsight(materia,assunto,profile=resolveProfile()){
  const mat=safe(materia).toLowerCase();
  const topic=safe(assunto).toLowerCase();
  const found=topicEntries(profile).find(entry=>safe(entry.topic?.materia).toLowerCase()===mat&&safe(entry.topic?.assunto).toLowerCase()===topic);
  return found?Object.freeze({key:found.key,...found.topic,domainRisk:found.domain}):null;
}

function scheduleRender(delay=80){
  global.clearTimeout(retryTimer);
  retryTimer=global.setTimeout(()=>render(),Math.max(0,Number(delay)||0));
}

function bootstrap(){
  render();
  global.addEventListener?.('app:cognitive-profile-updated',()=>scheduleRender(40));
  global.addEventListener?.('appstate:changed',()=>scheduleRender(80));
  global.addEventListener?.('pageshow',()=>scheduleRender(80),{passive:true});
  global.addEventListener?.('study:contest-changed',()=>scheduleRender(80));
}

global.AppDomainRiskDashboard=Object.freeze({
  schemaVersion:SCHEMA_VERSION,
  buildViewModel,
  getAttentionQueue,
  findTopicInsight,
  resolveProfile,
  render,
  scheduleRender
});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootstrap,{once:true});
else bootstrap();
})(window);

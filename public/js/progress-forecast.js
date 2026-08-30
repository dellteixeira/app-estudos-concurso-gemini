(function installProgressForecast(global){
'use strict';
if(global.AppProgressForecast)return;

const MAX_FEEDBACK=8;
const EVIDENCE_WINDOW_DAYS=30;
const EVIDENCE_WINDOW_MS=EVIDENCE_WINDOW_DAYS*24*60*60*1000;
function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0))}
function average(values){const rows=values.filter(Number.isFinite);return rows.length?rows.reduce((sum,value)=>sum+value,0)/rows.length:null}
function pct(value){return Number.isFinite(value)?`${Math.round(clamp(value,0,100))}%`:'—'}
function trajectoryLabel(value){return value==='improving'?'Trajetória em melhora':value==='declining'?'Trajetória exige atenção':value==='stable'?'Trajetória estável':'Dados insuficientes'}
function confidenceLabel(value){return value==='high'?'alta':value==='medium'?'moderada':'baixa'}
function diagnosticCandidates(){
  const provider=global.AppDiagnosticCandidateProvider;
  const broad=provider?.collect?.(40)||[];
  if(broad.length)return broad;
  const advisor=global.AppLearningAdvisor;
  return advisor?.collectCandidates?.(12)||[];
}
function recentEvidence(entries,reference=new Date()){
  const floor=reference.getTime()-EVIDENCE_WINDOW_MS;
  return entries.filter(item=>{const at=Date.parse(item?.at||item?.finishedAt||item?.evaluatedAt||0);return Number.isFinite(at)&&at>=floor&&at<=reference.getTime()});
}
function evidenceAgeDays(rows,reference=new Date()){
  const latest=rows.map(item=>Date.parse(item?.at||item?.finishedAt||item?.evaluatedAt||0)).filter(Number.isFinite).sort((a,b)=>b-a)[0];
  return Number.isFinite(latest)?Math.max(0,Math.floor((reference.getTime()-latest)/(24*60*60*1000))):null;
}

function build(reference=new Date()){
  const candidates=diagnosticCandidates();
  const timeline=global.AppStudyEvidenceTimeline?.getEntries?.()||[];
  const recent=recentEvidence(timeline,reference);
  const feedback=recent.filter(item=>item?.type==='feedback'&&Number.isFinite(Number(item.score))).slice(-MAX_FEEDBACK);
  const executions=recent.filter(item=>item?.type==='execution_finished'&&item?.status==='completed');
  const scores=feedback.map(item=>Number(item.score));
  const averageFeedback=average(scores);
  let trajectory='insufficient';
  if(feedback.length>=3)trajectory=averageFeedback>=5?'improving':averageFeedback<=-5?'declining':'stable';
  const confidence=feedback.length>=6&&executions.length>=6?'high':feedback.length>=3&&executions.length>=3?'medium':'low';
  const retentions=candidates.map(item=>Number(item?.metrics?.retention)).filter(Number.isFinite);
  const accuracies=candidates.map(item=>item?.metrics?.accuracy==null?NaN:Number(item.metrics.accuracy)).filter(Number.isFinite);
  const frictions=candidates.map(item=>Number(item?.frictionScore)).filter(Number.isFinite);
  const notebook=global.AppIntelligentErrorNotebook?.getSummary?.()||{active:0,resolved:0};
  const exam=global.AppExamProximityStrategy?.getContext?.()||null;
  const daily=global.AppDailyAdaptivePlanner?.getCurrentPlan?.()||null;
  return {
    trajectory,
    label:trajectoryLabel(trajectory),
    confidence,
    confidenceLabel:confidenceLabel(confidence),
    feedbackCount:feedback.length,
    completedExecutions:executions.length,
    averageFeedback:Number.isFinite(averageFeedback)?Number(averageFeedback.toFixed(1)):null,
    criticalTopics:candidates.length,
    highFriction:candidates.filter(item=>Number(item?.frictionScore)>=70).length,
    averageRetention:average(retentions),
    averageAccuracy:average(accuracies),
    averageFriction:average(frictions),
    activeErrors:Number(notebook.active)||0,
    resolvedErrors:Number(notebook.resolved)||0,
    daysUntilExam:Number.isFinite(Number(exam?.days))?Number(exam.days):null,
    examPhase:exam?.label||'',
    dailyBudget:Number(daily?.budget)||null,
    evidenceWindowDays:EVIDENCE_WINDOW_DAYS,
    recentEvidenceCount:recent.length,
    evidenceAgeDays:evidenceAgeDays(recent,reference),
    authority:'forecast-only',
    diagnosticCoverage:global.AppDiagnosticCandidateProvider?'broad':'advisor-fallback',
    disclaimer:`Projeção de trajetória baseada em evidências dos últimos ${EVIDENCE_WINDOW_DAYS} dias; não estima chance de aprovação.`
  };
}

function ensurePanel(){
  const host=document.getElementById('dailyAdaptivePlanner')||document.getElementById('adaptiveAiExperience');if(!host)return null;
  let panel=document.getElementById('progressForecast');if(panel)return panel;
  panel=document.createElement('section');panel.id='progressForecast';panel.className='progress-forecast';
  panel.innerHTML='<div class="adaptive-session-head"><span class="dashboard-v2-section-label">Projeção de progresso</span><span id="progressForecastConfidence" class="adaptive-session-authority">Confiança baixa</span></div><strong id="progressForecastTrajectory">Dados insuficientes</strong><div id="progressForecastMetrics" class="adaptive-session-summary"></div><p id="progressForecastDisclaimer" class="adaptive-session-summary"></p>';
  host.appendChild(panel);return panel;
}
function render(){
  const result=build();ensurePanel();
  const trajectory=document.getElementById('progressForecastTrajectory');if(trajectory)trajectory.textContent=result.label;
  const confidence=document.getElementById('progressForecastConfidence');if(confidence){confidence.textContent=`Confiança ${result.confidenceLabel}`;confidence.title=result.evidenceAgeDays==null?'Sem evidência recente':`Evidência mais recente há ${result.evidenceAgeDays} dia${result.evidenceAgeDays===1?'':'s'}`;}
  const metrics=document.getElementById('progressForecastMetrics');
  if(metrics){
    const exam=result.daysUntilExam==null?'prova sem data':`${result.daysUntilExam} dias até a prova`;
    metrics.textContent=`Últimos ${result.evidenceWindowDays} dias · ${result.feedbackCount} feedbacks atribuídos · ${result.completedExecutions} execuções concluídas · ${result.criticalTopics} pontos críticos · retenção ${pct(result.averageRetention)} · acerto ${pct(result.averageAccuracy)} · ${result.activeErrors} erros ativos · ${exam}`;
  }
  const disclaimer=document.getElementById('progressForecastDisclaimer');if(disclaimer)disclaimer.textContent=result.disclaimer;
  global.dispatchEvent(new CustomEvent('adaptive-progress-forecast-updated',{detail:{trajectory:result.trajectory,confidence:result.confidence,criticalTopics:result.criticalTopics,evidenceWindowDays:result.evidenceWindowDays,evidenceAgeDays:result.evidenceAgeDays}}));
  return result;
}
function init(){ensurePanel();render();['study-evidence-timeline-changed','intelligent-error-notebook-changed','adaptive-exam-date-changed','adaptive-day-plan-rendered','diagnostic-candidate-provider-ready'].forEach(name=>global.addEventListener(name,render));}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
global.AppProgressForecast=Object.freeze({build,render,recentEvidence,evidenceAgeDays,EVIDENCE_WINDOW_DAYS});
})(window);

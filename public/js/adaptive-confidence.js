(function installAdaptiveConfidence(global){
'use strict';
if(global.AppAdaptiveConfidence)return;

const EVIDENCE_WINDOW_DAYS=30;
const DAY_MS=24*60*60*1000;

function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0))}
function safe(value,max=180){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function finite(value){return Number.isFinite(Number(value))}
function numericScore(value){return typeof value==='number'&&Number.isFinite(value)}
function timestamp(value){const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:null}
function withinEvidenceWindow(item,now=Date.now()){
  const at=timestamp(item?.at);
  return at!==null&&at>=now-(EVIDENCE_WINDOW_DAYS*DAY_MS)&&at<=now;
}
function evidenceAgeDays(items,now=Date.now()){
  const latest=items.reduce((max,item)=>Math.max(max,timestamp(item?.at)??-Infinity),-Infinity);
  return Number.isFinite(latest)?Math.max(0,Math.floor((now-latest)/DAY_MS)):null;
}

function score(plan){
  if(!plan?.candidate||!plan?.intervention)return null;
  const candidate=plan.candidate;const metrics=candidate.metrics||{};
  let earned=0;let possible=0;const signals=[];const uncertainty=[];
  const add=(weight,condition,label)=>{possible+=weight;if(condition){earned+=weight;if(label)signals.push(label)}};

  add(18,finite(metrics.retention),'retenção observada');
  add(14,finite(metrics.accuracy),'acurácia observada');
  add(10,Number(metrics.reviewCount)>=2,'histórico de revisões');
  add(10,Number(metrics.sessionCount)>=2,'histórico de sessões');
  add(8,Number(metrics.lapseCount)>0,'lapsos observados');

  const errors=global.AppQuestionPerformanceIntelligence?.getTopicProfile?.(candidate.topicId)||null;
  add(12,Number(errors?.count)>=2,'padrão de erros');
  const notebook=global.AppIntelligentErrorNotebook?.getTopicEntries?.(candidate.topicId)||[];
  add(8,notebook.length>0,'caderno de erros');
  const timeline=global.AppStudyEvidenceTimeline?.getEntries?.(candidate.topicId)||[];
  const now=Date.now();
  const recentTimeline=timeline.filter(item=>withinEvidenceWindow(item,now));
  const recentCompletedExecutions=recentTimeline.filter(item=>item?.type==='execution_finished'&&item?.status==='completed');
  const recentAttributedFeedback=recentTimeline.filter(item=>item?.type==='feedback'&&numericScore(item?.score));
  const recentBehavioralEvidence=[...recentCompletedExecutions,...recentAttributedFeedback];
  add(10,recentCompletedExecutions.length>=1,'execução concluída recente');
  add(10,recentAttributedFeedback.length>=1,'feedback atribuído recente');

  if(finite(metrics.retention)&&finite(metrics.accuracy)&&Math.abs(Number(metrics.retention)-Number(metrics.accuracy))>=30){
    earned-=8;uncertainty.push('retenção e acurácia divergem');
  }
  if(Number(metrics.reviewCount)<2)uncertainty.push('poucas revisões observadas');
  if(Number(metrics.sessionCount)<2)uncertainty.push('poucas sessões observadas');
  if(!recentBehavioralEvidence.length)uncertainty.push(`sem evidência comportamental recente (${EVIDENCE_WINDOW_DAYS} dias)`);
  else{
    if(!recentAttributedFeedback.length)uncertainty.push('sem feedback atribuído recente');
    if(!recentCompletedExecutions.length)uncertainty.push('sem execução concluída recente');
  }

  const confidence=clamp(Math.round((Math.max(0,earned)/Math.max(1,possible))*100),0,100);
  const level=confidence>=75?'high':confidence>=50?'medium':'low';
  return {
    topicId:safe(candidate.topicId,600),
    confidence,
    level,
    signals:signals.slice(0,6),
    uncertaintyReasons:uncertainty.slice(0,4),
    evidenceCount:signals.length,
    recentCompletedExecutions:recentCompletedExecutions.length,
    recentAttributedFeedback:recentAttributedFeedback.length,
    evidenceWindowDays:EVIDENCE_WINDOW_DAYS,
    evidenceAgeDays:evidenceAgeDays(recentBehavioralEvidence,now),
    authority:'confidence-only'
  };
}

function label(result){
  if(!result)return'Confiança indisponível';
  if(result.level==='high')return`Alta confiança · ${result.confidence}%`;
  if(result.level==='medium')return`Confiança moderada · ${result.confidence}%`;
  return`Baixa confiança · ${result.confidence}%`;
}

function render(plan){
  const result=score(plan);const badge=document.getElementById('adaptiveAiConfidence');
  if(!badge)return result;
  if(!result){badge.textContent='Confiança —';badge.dataset.level='none';badge.removeAttribute('title');return null;}
  badge.textContent=label(result);badge.dataset.level=result.level;
  const detail=result.uncertaintyReasons.length?`Incerteza: ${result.uncertaintyReasons.join('; ')}`:`Baseado em: ${result.signals.join(', ')}`;
  badge.title=detail;
  global.dispatchEvent(new CustomEvent('adaptive-confidence-updated',{detail:{topicId:result.topicId,confidence:result.confidence,level:result.level}}));
  return result;
}

global.AppAdaptiveConfidence=Object.freeze({score,render,label,EVIDENCE_WINDOW_DAYS});
const activePlan=global.AppAdaptiveAIExperience?.getCurrentPlan?.();
if(activePlan)setTimeout(()=>render(activePlan),0);
})(window);

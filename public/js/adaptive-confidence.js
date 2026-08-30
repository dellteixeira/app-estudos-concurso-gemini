(function installAdaptiveConfidence(global){
'use strict';
if(global.AppAdaptiveConfidence)return;

function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0))}
function safe(value,max=180){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function score(plan){
  if(!plan?.candidate||!plan?.intervention)return null;
  const candidate=plan.candidate;const m=candidate.metrics||{};let points=0;let max=0;const signals=[];
  const add=(weight,condition,label)=>{max+=weight;if(condition){points+=weight;if(label)signals.push(label)}};
  add(18,Number.isFinite(Number(m.retention)),'retenção observada');
  add(14,Number.isFinite(Number(m.accuracy)),'acurácia observada');
  add(10,Number(m.reviewCount)>=2,'histórico de revisões');
  add(10,Number(m.sessionCount)>=2,'histórico de sessões');
  add(8,Number(m.lapseCount)>0,'lapsos observados');
  const errorProfile=global.AppQuestionPerformanceIntelligence?.getTopicProfile?.(candidate.topicId);
  add(12,Number(errorProfile?.count)>=2,'padrão de erros');
  const notebook=global.AppIntelligentErrorNotebook?.getTopicEntries?.(candidate.topicId)||[];
  add(8,notebook.length>0,'caderno de erros');
  const timeline=global.AppStudyEvidenceTimeline?.getEntries?.(candidate.topicId)||[];
  const executions=timeline.filter(item=>item?.type==='execution_finished').length;
  add(10,executions>=1,'execução registrada');
  const feedback=timeline.filter(item=>item?.type==='feedback');
  add(10,feedback.length>=1,'feedback atribuído');
  const confidence=max?Math.round(points/max*100):0;
  const level=confidence>=75?'high':confidence>=50?'medium':'low';
  return {topicId:safe(candidate.topicId,600),confidence,level,signals:signals.slice(0,6),evidenceCount:signals.length,authority:'confidence-only'};
}
function label(result){if(!result)return'Confiança indisponível';return result.level==='high'?`Alta confiança · ${result.confidence}%`:result.level==='medium'?`Confiança moderada · ${result.confidence}%`:`Baixa confiança · ${result.confidence}%`}
function render(plan){
  const result=score(plan);const host=document.getElementById('adaptiveAiExperience');if(!host)return result;
  let badge=document.getElementById('adaptiveAiConfidence');if(!badge){badge=document.createElement('div');badge.id='adaptiveAiConfidence';badge.className='adaptive-ai-confidence';host.appendChild(badge)}
  if(!result){badge.textContent='Confiança indisponível';badge.dataset.level='none';return null}
  badge.textContent=label(result);badge.dataset.level=result.level;badge.title=result.signals.length?`Baseado em: ${result.signals.join(', ')}`:'Ainda há pouca evidência individual.';
  global.dispatchEvent(new CustomEvent('adaptive-confidence-updated',{detail:{topicId:result.topicId,confidence:result.confidence,level:result.level}}));
  return result;
}
global.AppAdaptiveConfidence=Object.freeze({score,render,label});
})(window);

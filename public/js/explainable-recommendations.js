(function installExplainableRecommendations(global){
'use strict';
if(global.AppExplainableRecommendations)return;

function safe(value,max=180){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function pct(value){const n=Number(value);return Number.isFinite(n)?`${Math.round(Math.max(0,Math.min(100,n)))}%`:null}
function build(plan){
  if(!plan?.candidate||!plan?.intervention)return null;
  const candidate=plan.candidate;const intervention=plan.intervention;const m=candidate.metrics||{};
  const evidence=[];
  const retention=pct(m.retention);if(retention)evidence.push({kind:'retention',label:`Retenção ${retention}`});
  const accuracy=pct(m.accuracy);if(accuracy)evidence.push({kind:'accuracy',label:`Acerto ${accuracy}`});
  if(Number(m.lapseCount)>0)evidence.push({kind:'lapses',label:`${Math.round(Number(m.lapseCount))} lapso${Number(m.lapseCount)===1?'':'s'}`});
  const errors=global.AppQuestionPerformanceIntelligence?.getTopicProfile?.(candidate.topicId);
  if(errors?.dominantType)evidence.push({kind:'error',label:`Erro dominante: ${safe(errors.dominantType,40)}`});
  const notebook=global.AppIntelligentErrorNotebook?.getTopicEntries?.(candidate.topicId)||[];
  const active=notebook.filter(item=>item?.status!=='resolved').length;if(active)evidence.push({kind:'active_error',label:`${active} padrão${active===1?'':'ões'} de erro ativo${active===1?'':'s'}`});
  const timeline=global.AppStudyEvidenceTimeline?.getEntries?.(candidate.topicId)||[];
  const executions=timeline.filter(item=>item?.type==='execution_finished');
  const feedback=timeline.filter(item=>item?.type==='feedback').at(-1);
  if(executions.length)evidence.push({kind:'execution',label:`${executions.length} execução${executions.length===1?'':'ões'} registrada${executions.length===1?'':'s'}`});
  if(feedback&&Number.isFinite(Number(feedback.score)))evidence.push({kind:'feedback',label:`Eficácia recente ${Number(feedback.score)>0?'+':''}${Number(feedback.score).toFixed(1)}`});
  const calibration=intervention.calibration||{};
  if(calibration.applied)evidence.push({kind:'calibration',label:'Método calibrado pela eficácia individual'});
  return {topicId:safe(candidate.topicId,600),action:safe(intervention.recommendedAction,60),minutes:Math.max(5,Math.round(Number(intervention.suggestedMinutes)||15)),rationale:safe(intervention.rationale,320),evidence:evidence.slice(0,6),authority:'explanation-only'};
}
function render(plan){
  const explanation=build(plan);const host=document.getElementById('adaptiveAiExperience');if(!host)return explanation;
  let box=document.getElementById('adaptiveAiExplanation');if(!box){box=document.createElement('div');box.id='adaptiveAiExplanation';box.className='adaptive-ai-explanation';host.appendChild(box);}
  if(!explanation){box.textContent='A explicação aparecerá quando houver uma recomendação ativa.';return null;}
  const items=explanation.evidence.map(item=>`<li>${safe(item.label,120)}</li>`).join('');
  box.innerHTML=`<strong>Por que esta recomendação?</strong><p>${safe(explanation.rationale||'A recomendação combina os sinais atuais do tópico com o método definido pelo sistema.',320)}</p>${items?`<ul>${items}</ul>`:''}`;
  global.dispatchEvent(new CustomEvent('adaptive-recommendation-explained',{detail:{topicId:explanation.topicId,action:explanation.action}}));
  return explanation;
}
global.AppExplainableRecommendations=Object.freeze({build,render});
})(window);

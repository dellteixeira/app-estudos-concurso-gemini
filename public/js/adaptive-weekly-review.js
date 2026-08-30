(function installAdaptiveWeeklyReview(global){
'use strict';
if(global.AppAdaptiveWeeklyReview)return;

const WINDOW_DAYS=7;
const WINDOW_MS=WINDOW_DAYS*24*60*60*1000;
function safe(value,max=180){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function average(values){const rows=values.filter(Number.isFinite);return rows.length?rows.reduce((sum,value)=>sum+value,0)/rows.length:null}
function since(reference=new Date()){return reference.getTime()-WINDOW_MS}
function recent(entries,reference=new Date()){const floor=since(reference);return entries.filter(item=>{const at=Date.parse(item?.at||item?.finishedAt||item?.evaluatedAt||0);return Number.isFinite(at)&&at>=floor})}
function methodStats(rows){
  const map={};
  rows.filter(item=>item?.type==='feedback'&&Number.isFinite(Number(item.score))).forEach(item=>{const action=safe(item.action,60)||'unknown';const bucket=map[action]||(map[action]={action,count:0,averageScore:0});bucket.count+=1;bucket.averageScore+=Number(item.score)});
  return Object.values(map).map(item=>({...item,averageScore:item.count?Number((item.averageScore/item.count).toFixed(1)):0})).sort((a,b)=>b.averageScore-a.averageScore||b.count-a.count);
}
function build(reference=new Date()){
  const timeline=global.AppStudyEvidenceTimeline?.getEntries?.()||[];
  const rows=recent(timeline,reference);
  const executions=rows.filter(item=>item?.type==='execution_finished');
  const completed=executions.filter(item=>item?.status==='completed');
  const interrupted=executions.filter(item=>item?.status==='interrupted'||item?.status==='abandoned');
  const feedback=rows.filter(item=>item?.type==='feedback'&&Number.isFinite(Number(item.score)));
  const scores=feedback.map(item=>Number(item.score));
  const methods=methodStats(rows);
  const notebook=global.AppIntelligentErrorNotebook?.getSummary?.()||{active:0,resolved:0};
  const forecast=global.AppProgressForecast?.build?.()||null;
  const completionRate=executions.length?completed.length/executions.length:0;
  const bestMethod=methods.find(item=>item.count>=2&&item.averageScore>0)||null;
  const attention=[];
  if(executions.length>=3&&completionRate<.7)attention.push('Muitas sessões foram interrompidas; reduza o tamanho dos blocos ou proteja melhor o tempo de foco.');
  if(Number(notebook.active)>Number(notebook.resolved)+2)attention.push('O caderno ainda acumula mais erros ativos do que resolvidos; priorize correção e recuperação ativa.');
  if(scores.length>=3&&average(scores)<=-3)attention.push('A eficácia observada da semana ficou negativa; reavalie os métodos usados nos pontos críticos.');
  if(forecast?.trajectory==='declining')attention.push('A trajetória recente exige atenção; mantenha intervenções curtas e mensuráveis antes de ampliar carga.');
  const wins=[];
  if(completed.length>=3&&completionRate>=.8)wins.push('Boa consistência de execução: a maior parte das sessões iniciadas foi concluída.');
  if(Number(notebook.resolved)>0)wins.push(`${Number(notebook.resolved)} padrão${Number(notebook.resolved)===1?'':'ões'} de erro resolvido${Number(notebook.resolved)===1?'':'s'} no caderno.`);
  if(bestMethod)wins.push(`${bestMethod.action} apresentou a melhor eficácia observada entre os métodos com evidência suficiente.`);
  if(scores.length>=3&&average(scores)>=5)wins.push('O feedback atribuído indica melhora relevante na semana.');
  return {windowDays:WINDOW_DAYS,events:rows.length,executions:executions.length,completed:completed.length,interrupted:interrupted.length,completionRate:Number(completionRate.toFixed(2)),feedbackCount:feedback.length,averageFeedback:Number.isFinite(average(scores))?Number(average(scores).toFixed(1)):null,bestMethod,wins:wins.slice(0,3),attention:attention.slice(0,3),activeErrors:Number(notebook.active)||0,resolvedErrors:Number(notebook.resolved)||0,authority:'review-only'};
}
function ensurePanel(){
  const host=document.getElementById('progressForecast')||document.getElementById('dailyAdaptivePlanner')||document.getElementById('adaptiveAiExperience');if(!host)return null;
  let panel=document.getElementById('adaptiveWeeklyReview');if(panel)return panel;
  panel=document.createElement('section');panel.id='adaptiveWeeklyReview';panel.className='adaptive-weekly-review';
  panel.innerHTML='<div class="adaptive-session-head"><span class="dashboard-v2-section-label">Revisão da semana</span><span class="adaptive-session-authority">últimos 7 dias</span></div><div id="adaptiveWeeklyReviewSummary" class="adaptive-session-summary">Aguardando evidências suficientes.</div><div id="adaptiveWeeklyReviewWins"></div><div id="adaptiveWeeklyReviewAttention"></div>';
  host.appendChild(panel);return panel;
}
function render(){
  const result=build();ensurePanel();
  const summary=document.getElementById('adaptiveWeeklyReviewSummary');if(summary)summary.textContent=`${result.completed}/${result.executions} sessões concluídas · ${result.feedbackCount} feedbacks atribuídos · ${result.activeErrors} erros ativos · ${result.resolvedErrors} resolvidos`;
  const wins=document.getElementById('adaptiveWeeklyReviewWins');if(wins)wins.innerHTML=result.wins.length?`<strong>Funcionou bem</strong><ul>${result.wins.map(item=>`<li>${safe(item,240)}</li>`).join('')}</ul>`:'<strong>Funcionou bem</strong><p>Ainda não há evidência semanal suficiente.</p>';
  const attention=document.getElementById('adaptiveWeeklyReviewAttention');if(attention)attention.innerHTML=result.attention.length?`<strong>Ajustar</strong><ul>${result.attention.map(item=>`<li>${safe(item,240)}</li>`).join('')}</ul>`:'<strong>Ajustar</strong><p>Nenhum sinal relevante de ajuste foi detectado.</p>';
  global.dispatchEvent(new CustomEvent('adaptive-weekly-review-updated',{detail:{executions:result.executions,feedbackCount:result.feedbackCount,authority:result.authority}}));
  return result;
}
function init(){ensurePanel();render();['study-evidence-timeline-changed','intelligent-error-notebook-changed','adaptive-progress-forecast-updated'].forEach(name=>global.addEventListener(name,render));}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
global.AppAdaptiveWeeklyReview=Object.freeze({build,render,WINDOW_DAYS});
})(window);

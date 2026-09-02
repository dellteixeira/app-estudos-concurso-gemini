(function installTodayBestAction(global){
'use strict';
if(global.AppTodayBestAction)return;
const $=(selector,root=document)=>root.querySelector(selector);
let current=null;

function ensurePanel(){
  const tab=$('#tab-hoje');
  if(!tab)return null;
  let panel=$('#todayBestAction');
  if(panel)return panel;
  panel=document.createElement('section');
  panel.id='todayBestAction';
  panel.className='today-best-action';
  panel.setAttribute('aria-labelledby','todayBestActionTitle');
  panel.innerHTML=`
    <div class="today-best-copy">
      <span class="today-kicker">Próxima melhor ação</span>
      <h3 id="todayBestActionTitle">Preparando recomendação…</h3>
      <p data-best-topic>A inteligência de retenção está analisando seu concurso.</p>
      <div class="today-best-meta" data-best-meta></div>
      <ul class="today-best-reasons" data-best-reasons></ul>
    </div>
    <div class="today-best-actions">
      <button type="button" class="btn btn-primary" data-best-start disabled>Estudar agora</button>
      <button type="button" class="btn btn-secondary" data-best-refresh>Atualizar</button>
    </div>`;
  const signals=$('.today-signal-grid',tab);
  tab.insertBefore(panel,signals||tab.querySelector('[data-today-existing]'));
  panel.querySelector('[data-best-start]')?.addEventListener('click',()=>global.AppStudyNowCommandCenter?.startStudy?.());
  panel.querySelector('[data-best-refresh]')?.addEventListener('click',refresh);
  return panel;
}

function resolve(){
  const api=global.AppStudyNowCommandCenter;
  if(!api)return null;
  const raw=api.latestRecommendation?.()||null;
  if(raw)api.render?.(raw);
  return api.current?.()||api.buildViewModel?.(raw)||null;
}

function retentionLabel(model){
  const reason=(model?.reasons||[]).find(item=>/reten[cç][aã]o/i.test(item));
  const pct=reason?.match(/\b\d{1,3}%/)?.[0];
  return pct?`Retenção ${pct}`:null;
}

function refresh(){
  const panel=ensurePanel();if(!panel)return null;
  current=resolve();
  const title=$('#todayBestActionTitle',panel);
  const topic=$('[data-best-topic]',panel);
  const meta=$('[data-best-meta]',panel);
  const reasons=$('[data-best-reasons]',panel);
  const start=$('[data-best-start]',panel);
  if(!current){
    title.textContent='Continue estudando para gerar uma recomendação';
    topic.textContent='Assim que houver evidência suficiente de retenção e desempenho, a próxima ação aparecerá aqui.';
    meta.textContent='';reasons.textContent='';start.disabled=true;return null;
  }
  title.textContent=current.materia||'Próxima ação';
  topic.textContent=current.assunto||current.topicId||'';
  meta.textContent='';
  [retentionLabel(current),`Prioridade ${Math.round(current.priorityScore)}%`,current.methodLabel,`${Math.round(current.suggestedMinutes)} min`].filter(Boolean).forEach(value=>{
    const chip=document.createElement('span');chip.textContent=value;meta.appendChild(chip);
  });
  reasons.textContent='';
  (current.reasons||[]).slice(0,3).forEach(value=>{const li=document.createElement('li');li.textContent=value;reasons.appendChild(li)});
  start.disabled=false;
  start.textContent=`Estudar agora — ${Math.round(current.suggestedMinutes)} min`;
  global.AppStudyUxPhase?.refreshToday?.();
  return current;
}

function install(){
  ensurePanel();refresh();
  global.addEventListener?.('app:next-best-study-action',()=>setTimeout(refresh,0));
  global.addEventListener?.('app:cognitive-profile-updated',()=>setTimeout(refresh,0));
}

global.AppTodayBestAction=Object.freeze({install,refresh,current:()=>current});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window);

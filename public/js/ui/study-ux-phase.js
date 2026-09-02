(function installStudyUxPhase(global){
'use strict';
if(global.AppStudyUxPhase)return;

const VERSION='1.0.0';
const state={calendarView:null,criticalExpanded:false,installed:false};
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const text=(selector,fallback='—')=>$(selector)?.textContent?.trim()||fallback;

function ensureStyles(){
  if(document.querySelector('link[data-study-ux-phase]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./css/study-ux-phase.css?v=1.0.0';
  link.dataset.studyUxPhase='1';
  document.head.appendChild(link);
}

function createButton(label,tabId,className){
  const button=document.createElement('button');
  button.type='button';
  button.className=className;
  button.dataset.action='switch-tab';
  button.dataset.tab=tabId;
  const span=className.includes('mobile-nav-btn')?document.createElement('span'):null;
  if(span){span.textContent=label;button.appendChild(span)}else button.textContent=label;
  return button;
}

function ensureTodayNavigation(){
  const desktopNav=$('.header-nav-tabs');
  if(desktopNav&&!desktopNav.querySelector('[data-tab="tab-hoje"]')){
    desktopNav.insertBefore(createButton('Hoje','tab-hoje','tab-btn study-today-nav'),desktopNav.firstElementChild);
  }
  const mobileNav=$('.mobile-bottom-nav');
  if(mobileNav&&!mobileNav.querySelector('[data-tab="tab-hoje"]')){
    const edital=mobileNav.querySelector('[data-tab="tab-edital"]');
    mobileNav.insertBefore(createButton('Hoje','tab-hoje','mobile-nav-btn study-today-nav'),edital||mobileNav.firstElementChild);
  }
}

function ensureTodayTab(){
  let tab=$('#tab-hoje');
  if(tab)return tab;
  const edital=$('#tab-edital');
  if(!edital)return null;
  tab=document.createElement('div');
  tab.id='tab-hoje';
  tab.className='tab-content study-today-tab';
  tab.innerHTML=`
    <section class="today-heading" aria-labelledby="todayHeadingTitle">
      <div><span class="today-kicker">Seu plano adaptativo</span><h2 id="todayHeadingTitle">Hoje</h2><p>O que devo estudar agora?</p></div>
      <div class="today-date" data-today-date></div>
    </section>
    <section class="today-signal-grid" aria-label="Prioridades de hoje">
      <button type="button" class="today-signal-card" data-today-jump="overdue"><strong data-today-overdue>0</strong><span>Revisões vencidas</span><small>resolver primeiro</small></button>
      <button type="button" class="today-signal-card" data-today-jump="questions"><strong data-today-questions>—</strong><span>Questões recomendadas</span><small>pelo diagnóstico</small></button>
      <button type="button" class="today-signal-card" data-today-jump="flashcards"><strong data-today-flashcards>—</strong><span>Flashcards pendentes</span><small>revisão ativa</small></button>
      <button type="button" class="today-signal-card" data-today-jump="risk"><strong data-today-risk>0</strong><span>Pontos críticos</span><small>maior risco</small></button>
      <div class="today-signal-card today-progress-card"><strong data-today-progress>00:00</strong><span>Progresso diário</span><small>tempo estudado hoje</small></div>
    </section>
    <div class="today-existing-content" data-today-existing></div>`;
  edital.parentElement.insertBefore(tab,edital);
  return tab;
}

function moveDashboardSurfacesIntoToday(){
  const tab=ensureTodayTab();
  const host=tab?.querySelector('[data-today-existing]');
  if(!host)return;
  const overview=$('.study-overview-grid');
  const retention=$('#retentionDiagnosticPanel');
  if(overview&&overview.parentElement!==host)host.appendChild(overview);
  if(retention&&retention.parentElement!==host)host.appendChild(retention);
}

function countFlashcards(){
  const folderContainer=$('#flashcardFoldersContainer');
  const visibleCards=$$('#flashcardsContainer [data-flashcard-id], #flashcardsContainer .flashcard-card, #flashcardFoldersContainer .flashcard-card').length;
  if(visibleCards)return visibleCards;
  const badges=$$('.flashcard-folder-count, .fc-count',folderContainer||document);
  const sum=badges.reduce((total,node)=>total+(Number((node.textContent||'').match(/\d+/)?.[0])||0),0);
  return sum||null;
}

function refreshToday(){
  const tab=$('#tab-hoje');if(!tab)return;
  const now=new Date();
  const dateNode=$('[data-today-date]',tab);
  if(dateNode)dateNode.textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long'}).format(now);
  const overdue=Number(text('#retentionDiagOverdue','0').replace(/\D/g,''))||0;
  const risk=Number(text('#retentionDiagRisk','0').replace(/\D/g,''))||0;
  const recommendation=global.AppStudyNowCommandCenter?.current?.()||global.AppStudyNowCommandCenter?.latestRecommendation?.();
  const questions=recommendation?.method==='questions'?1:'—';
  const flashcards=countFlashcards()??'—';
  const values={
    '[data-today-overdue]':overdue,
    '[data-today-risk]':risk,
    '[data-today-questions]':questions,
    '[data-today-flashcards]':flashcards,
    '[data-today-progress]':text('#modernOverviewToday','00:00')
  };
  Object.entries(values).forEach(([selector,value])=>{const node=$(selector,tab);if(node)node.textContent=String(value)});
}

function bindTodaySignals(){
  const tab=$('#tab-hoje');if(!tab||tab.dataset.signalsBound==='1')return;
  tab.dataset.signalsBound='1';
  tab.addEventListener('click',event=>{
    const signal=event.target.closest('[data-today-jump]');if(!signal)return;
    const type=signal.dataset.todayJump;
    if(type==='flashcards')return global.AppNavigation?.navigateTo?.('tab-flashcards');
    if(type==='overdue'||type==='risk'){
      const metric=type==='overdue'?'overdue':'risk';
      const button=$(`[data-action="retention-details"][data-metric="${metric}"]`);
      button?.click();return;
    }
    if(type==='questions')global.AppStudyNowCommandCenter?.startStudy?.();
  });
}

function ensureEditalSummary(){
  const tab=$('#tab-edital');if(!tab)return;
  let shell=$('#editalUxSummary');
  if(shell)return shell;
  shell=document.createElement('section');
  shell.id='editalUxSummary';
  shell.className='edital-ux-summary';
  shell.innerHTML=`
    <div class="edital-summary-head"><div><span class="today-kicker">Visão do edital</span><h2>O que preciso aprender</h2></div></div>
    <div class="edital-summary-grid">
      <div><strong data-edital-progress>0%</strong><span>Progresso geral</span></div>
      <div><strong data-edital-studied>0</strong><span>Estudados</span></div>
      <div><strong data-edital-pending>0</strong><span>Pendentes</span></div>
      <div><strong data-edital-overdue>0</strong><span>Revisões vencidas</span></div>
      <div><strong data-edital-days>—</strong><span>Dias até a prova</span></div>
    </div>
    <div class="edital-filter-chips" role="group" aria-label="Filtrar edital">
      <button type="button" class="active" data-edital-filter="all">Todos</button>
      <button type="button" data-edital-filter="pending">Pendentes</button>
      <button type="button" data-edital-filter="risk">Em risco</button>
      <button type="button" data-edital-filter="review">Revisar</button>
      <button type="button" data-edital-filter="mastered">Dominados</button>
    </div>`;
  tab.insertBefore(shell,tab.firstElementChild);
  shell.addEventListener('click',event=>{
    const button=event.target.closest('[data-edital-filter]');if(!button)return;
    $$('.edital-filter-chips button',shell).forEach(item=>item.classList.toggle('active',item===button));
    applyEditalFilter(button.dataset.editalFilter);
  });
  return shell;
}

function topicRows(){
  const tbody=$('#edital-list');if(!tbody)return[];
  return $$('tr',tbody).filter(row=>!row.classList.contains('materia-header')&&!row.querySelector('[data-materia-toggle]'));
}

function riskTerms(){
  return $$('#retentionDiagnosticRiskList').flatMap(root=>$$('*',root)).map(node=>(node.textContent||'').trim().toLocaleLowerCase('pt-BR')).filter(value=>value.length>8);
}

function rowState(row){
  const checks=$$('input[type="checkbox"]',row).filter(input=>!input.disabled);
  const checked=checks.filter(input=>input.checked).length;
  const body=(row.textContent||'').toLocaleLowerCase('pt-BR');
  const risk=riskTerms().some(term=>term&&body.includes(term.slice(0,Math.min(term.length,60))));
  const mastered=checks.length>0&&checked===checks.length;
  const review=/revis|vencid|atrasad/.test(body);
  return {pending:!mastered,risk,review,mastered};
}

function applyEditalFilter(filter='all'){
  const rows=topicRows();
  rows.forEach(row=>{
    const state=rowState(row);
    row.hidden=filter!=='all'&&!state[filter];
  });
  document.documentElement.dataset.editalUxFilter=filter;
}

function refreshEditalSummary(){
  const shell=ensureEditalSummary();if(!shell)return;
  const total=Number(text('#modernOverviewTopics','0').replace(/\D/g,''))||topicRows().length;
  const progressText=text('#modernOverviewProgress','0%');
  const progress=Math.max(0,Math.min(100,Number(progressText.replace(/[^\d.,]/g,'').replace(',','.'))||0));
  const studied=Math.min(total,Math.round(total*progress/100));
  const pending=Math.max(0,total-studied);
  const map={
    '[data-edital-progress]':`${Math.round(progress)}%`,
    '[data-edital-studied]':studied,
    '[data-edital-pending]':pending,
    '[data-edital-overdue]':text('#retentionDiagOverdue','0'),
    '[data-edital-days]':resolveExamDays()
  };
  Object.entries(map).forEach(([selector,value])=>{const node=$(selector,shell);if(node)node.textContent=String(value)});
}

function resolveExamDays(){
  const candidate=$('#retentionExamPhase strong')?.textContent||'';
  const match=candidate.match(/(\d+)\s*dias?/i);if(match)return match[1];
  const dateInput=$('input[type="date"][id*="prova" i], input[type="date"][name*="prova" i]');
  if(!dateInput?.value)return'—';
  const diff=Math.ceil((new Date(`${dateInput.value}T23:59:59`)-new Date())/86400000);
  return diff>=0?diff:'0';
}

function ensureCalendarViews(){
  const workspace=$('#calendarWorkspace');if(!workspace)return;
  let controls=$('#calendarUxViews');
  if(!controls){
    controls=document.createElement('div');
    controls.id='calendarUxViews';
    controls.className='calendar-ux-views';
    controls.innerHTML=`<div class="calendar-view-tabs" role="tablist" aria-label="Visualização do cronograma"><button type="button" data-calendar-view="today">Hoje</button><button type="button" data-calendar-view="week">Semana</button><button type="button" data-calendar-view="month">Mês</button></div><div id="calendarTodayView" class="calendar-agenda-view"></div><div id="calendarWeekView" class="calendar-week-view"></div>`;
    workspace.insertBefore(controls,workspace.querySelector('.calendar-primary-actions')||workspace.firstElementChild?.nextSibling);
    controls.addEventListener('click',event=>{
      const button=event.target.closest('[data-calendar-view]');if(!button)return;
      setCalendarView(button.dataset.calendarView);
    });
  }
  if(!state.calendarView)setCalendarView(global.matchMedia?.('(max-width:700px)')?.matches?'today':'week');
  refreshCalendarDerivedViews();
}

function calendarCells(){return $$('#monthCalendarGrid > *').filter(cell=>cell.textContent?.trim());}
function dayNumber(cell){const raw=(cell.querySelector('[class*="day-number"], [class*="date"]')?.textContent||cell.textContent||'').trim();const m=raw.match(/\b([1-9]|[12]\d|3[01])\b/);return m?Number(m[1]):null;}
function dateKey(date){const year=date.getFullYear();const month=String(date.getMonth()+1).padStart(2,'0');const day=String(date.getDate()).padStart(2,'0');return `${year}-${month}-${day}`;}
function cellForDate(date){return $(`#monthCalendarGrid [data-date-key="${dateKey(date)}"]`)||null;}
function currentDayCell(){return cellForDate(new Date());}

function taskNodes(cell){
  if(!cell)return[];
  const candidates=$$('[class*="topic"], [class*="task"], [class*="activity"]',cell).filter(node=>node.children.length||node.textContent.trim().length>8);
  const leaves=candidates.filter(node=>!candidates.some(other=>other!==node&&node.contains(other)&&other.textContent.trim().length>8));
  return leaves.length?leaves.slice(0,12):[];
}

function actionProxy(originalTask,label){
  const button=document.createElement('button');button.type='button';button.textContent=label;
  button.addEventListener('click',()=>{
    const patterns=label==='Concluir'?/concluir|finaliz|feito/i:/editar|planejar|trocar|reorganizar/i;
    const target=$$('button',originalTask).find(item=>patterns.test(item.textContent||item.title||''));
    if(target)return target.click();
    setCalendarView('month');
    originalTask.scrollIntoView?.({behavior:'smooth',block:'center'});
  });
  return button;
}

function renderAgenda(container,cell,emptyLabel){
  if(!container)return;
  container.textContent='';
  const tasks=taskNodes(cell);
  if(!tasks.length){container.innerHTML=`<div class="calendar-empty-state"><strong>${emptyLabel}</strong><span>Use “Preencher Cronograma” para organizar o estudo.</span></div>`;return;}
  tasks.forEach((task,index)=>{
    const item=document.createElement('article');item.className='calendar-agenda-item';
    const copy=document.createElement('div');copy.className='calendar-agenda-copy';
    const time=(task.textContent||'').match(/\b([01]?\d|2[0-3]):[0-5]\d\b/)?.[0]||`${String(8+index*2).padStart(2,'0')}:00`;
    const title=(task.textContent||'').replace(/\s+/g,' ').trim().slice(0,240);
    copy.innerHTML=`<time>${time}</time><strong></strong>`;copy.querySelector('strong').textContent=title;
    const actions=document.createElement('div');actions.className='calendar-agenda-actions';
    ['Concluir','Adiar','Trocar'].forEach(label=>actions.appendChild(actionProxy(task,label)));
    item.append(copy,actions);container.appendChild(item);
  });
}

function refreshCalendarDerivedViews(){
  const today=$('#calendarTodayView');const week=$('#calendarWeekView');
  renderAgenda(today,currentDayCell(),'Nenhuma atividade para hoje');
  if(week){
    week.textContent='';
    const now=new Date();const day=now.getDay();const start=new Date(now);start.setDate(now.getDate()-day);
    for(let offset=0;offset<7;offset++){
      const date=new Date(start);date.setDate(start.getDate()+offset);
      const cell=cellForDate(date);
      const card=document.createElement('section');card.className='calendar-week-day';
      card.innerHTML=`<span>${new Intl.DateTimeFormat('pt-BR',{weekday:'short'}).format(date)}</span><strong>${date.getDate()}</strong><small></small>`;
      const count=taskNodes(cell).length;card.querySelector('small').textContent=count?`${count} atividade${count>1?'s':''}`:'Livre';
      card.addEventListener('click',()=>{if(cell){setCalendarView('month');cell.scrollIntoView?.({behavior:'smooth',block:'center'});cell.click?.()}});
      week.appendChild(card);
    }
  }
}

function setCalendarView(view){
  state.calendarView=['today','week','month'].includes(view)?view:'month';
  const workspace=$('#calendarWorkspace');if(!workspace)return;
  workspace.dataset.calendarView=state.calendarView;
  $$('#calendarUxViews [data-calendar-view]').forEach(button=>button.classList.toggle('active',button.dataset.calendarView===state.calendarView));
  if(state.calendarView!=='month')refreshCalendarDerivedViews();
}

function compactCriticalPoints(){
  const list=$('#retentionDiagnosticRiskList');const more=$('#retentionMoreButton');if(!list)return;
  const children=[...list.children];
  children.forEach((item,index)=>item.classList.toggle('study-ux-critical-extra',index>=3));
  if(more&&children.length>3){more.hidden=false;more.textContent='Ver todos os pontos críticos';more.classList.add('study-ux-critical-more')}
}

function observeDynamicSurfaces(){
  const targets=['#retentionDiagnosticPanel','#edital-list','#monthCalendarGrid','#flashcardsContainer','#flashcardFoldersContainer'].map(selector=>$(selector)).filter(Boolean);
  const observer=new MutationObserver(()=>{
    clearTimeout(observeDynamicSurfaces.timer);
    observeDynamicSurfaces.timer=setTimeout(()=>{refreshToday();refreshEditalSummary();compactCriticalPoints();refreshCalendarDerivedViews()},60);
  });
  targets.forEach(target=>observer.observe(target,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','checked','hidden']}));
}

function activateTodayByDefault(){
  const current=$('.tab-content.active');
  if(current&&current.id!=='tab-edital'&&current.id!=='tab-hoje')return;
  global.AppNavigation?.navigateTo?.('tab-hoje');
  $$('.header-nav-tabs .tab-btn,.mobile-bottom-nav .mobile-nav-btn[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab==='tab-hoje'));
}

function install(){
  if(state.installed)return;state.installed=true;
  ensureStyles();ensureTodayNavigation();ensureTodayTab();moveDashboardSurfacesIntoToday();bindTodaySignals();ensureEditalSummary();ensureCalendarViews();compactCriticalPoints();refreshToday();refreshEditalSummary();observeDynamicSurfaces();
  global.addEventListener?.('app:next-best-study-action',()=>setTimeout(refreshToday,0));
  global.addEventListener?.('resize',()=>{if(global.matchMedia?.('(max-width:700px)')?.matches&&state.calendarView==='month')setCalendarView('today')});
  setTimeout(activateTodayByDefault,0);
}

global.AppStudyUxPhase=Object.freeze({version:VERSION,install,refreshToday,refreshEditalSummary,setCalendarView,applyEditalFilter});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window);

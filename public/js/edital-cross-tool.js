(function(global){
'use strict';

const STOPWORDS=new Set(['de','da','do','das','dos','e','em','para','por','a','o','as','os','um','uma','no','na','nos','nas','ao','aos','com','sem','sobre','entre','ou','que','se']);

function normalizeText(value){
  return String(value||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,' ')
    .trim().replace(/\s+/g,' ');
}
function tokens(value){
  return normalizeText(value).split(' ').filter(t=>t.length>1&&!STOPWORDS.has(t));
}
function similarity(a,b){
  const A=new Set(tokens(a)), B=new Set(tokens(b));
  if(!A.size||!B.size) return 0;
  let inter=0; A.forEach(t=>{if(B.has(t)) inter++;});
  const union=new Set([...A,...B]).size;
  return union?inter/union:0;
}
function groupItemsByContest(items,contests){
  const selected=new Set(contests);
  return items.filter(x=>selected.has(String(x.concurso||'Concurso Geral')));
}
function buildCrossRows(items,contests){
  const source=groupItemsByContest(items,contests);
  const exact=new Map();
  source.forEach(item=>{
    const key=normalizeText(item.materia)+'::'+normalizeText(item.assunto);
    if(!key||key==='::') return;
    if(!exact.has(key)) exact.set(key,[]);
    exact.get(key).push(item);
  });
  const rows=[]; const used=new Set();
  exact.forEach(group=>{
    const origins=[...new Set(group.map(x=>String(x.concurso||'Concurso Geral')))];
    if(origins.length>1){
      const best=group[0];
      rows.push({
        id:cryptoId(), materia:best.materia||'Geral', assunto:best.assunto||'Tópico',
        status:'common', sources:origins, included:true,
        prioridade:Math.max(...group.map(x=>Number(x.prioridade)||1)),
        assunto_prioridade:Math.max(...group.map(x=>Number(x.assunto_prioridade)||1)),
        score:1
      });
      group.forEach(x=>used.add(String(x.id)));
    }
  });

  const leftovers=source.filter(x=>!used.has(String(x.id)));
  const consumed=new Set();
  for(let i=0;i<leftovers.length;i++){
    const base=leftovers[i];
    if(consumed.has(String(base.id))) continue;

    const byContest=new Map();
    for(let j=0;j<leftovers.length;j++){
      const candidate=leftovers[j];
      if(j===i||consumed.has(String(candidate.id))) continue;
      if(String(base.concurso||'')===String(candidate.concurso||'')) continue;
      if(normalizeText(base.materia)!==normalizeText(candidate.materia)) continue;
      const score=similarity(base.assunto,candidate.assunto);
      const baseTokens=new Set(tokens(base.assunto));
      const shared=[...baseTokens].filter(t=>new Set(tokens(candidate.assunto)).has(t)).length;
      if(score<0.72||shared<2) continue;
      const contestName=String(candidate.concurso||'Concurso Geral');
      const previous=byContest.get(contestName);
      if(!previous||score>previous.score) byContest.set(contestName,{item:candidate,score});
    }

    if(byContest.size){
      const cluster=[base,...[...byContest.values()].map(entry=>entry.item)];
      const scores=[...[...byContest.values()].map(entry=>entry.score)];
      cluster.forEach(item=>consumed.add(String(item.id)));
      const canonical=cluster.reduce((best,item)=>String(item.assunto||'').length>String(best.assunto||'').length?item:best,cluster[0]);
      rows.push({
        id:cryptoId(),
        materia:canonical.materia||base.materia||'Geral',
        assunto:canonical.assunto||base.assunto||'Tópico',
        status:'related',
        sources:[...new Set(cluster.map(item=>String(item.concurso||'Concurso Geral')))],
        included:true,
        prioridade:Math.max(...cluster.map(item=>Number(item.prioridade)||1)),
        assunto_prioridade:Math.max(...cluster.map(item=>Number(item.assunto_prioridade)||1)),
        score:scores.length?scores.reduce((sum,value)=>sum+value,0)/scores.length:0
      });
    }
  }
  leftovers.forEach(item=>{
    if(consumed.has(String(item.id))) return;
    rows.push({
      id:cryptoId(), materia:item.materia||'Geral', assunto:item.assunto||'Tópico',
      status:'unique', sources:[String(item.concurso||'Concurso Geral')], included:true,
      prioridade:Number(item.prioridade)||1,
      assunto_prioridade:Number(item.assunto_prioridade)||1,
      score:0
    });
  });
  return rows.sort((a,b)=>{
    const rank={common:0,related:1,unique:2};
    return rank[a.status]-rank[b.status] ||
      a.materia.localeCompare(b.materia,'pt-BR',{sensitivity:'base'}) ||
      a.assunto.localeCompare(b.assunto,'pt-BR',{sensitivity:'base'});
  });
}
function cryptoId(){
  try{return global.crypto?.randomUUID?.()||('cross-'+Date.now()+'-'+Math.random().toString(16).slice(2));}
  catch(_){return 'cross-'+Date.now()+'-'+Math.random().toString(16).slice(2);}
}

let state={contests:[],rows:[],filter:'all'};

function getAllItems(){
  try{return global.AppState?.getEdital?.({all:true})||[];}catch(_){}
  try{return typeof allEditalItems!=='undefined'?[...allEditalItems]:[];}catch(_){return [];}
}
function getContestNames(){
  const names=new Set();
  getAllItems().forEach(i=>{const n=String(i.concurso||'').trim(); if(n&&normalizeText(n)!=='concurso geral') names.add(n);});
  try{Object.keys(getConcursosMetadata?.()||{}).forEach(n=>{if(normalizeText(n)!=='concurso geral') names.add(n);});}catch(_){}
  return [...names].sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'}));
}
function esc(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function modal(){return document.getElementById('modalEditalCrossTool');}
function renderContestSelection(){
  const box=document.getElementById('crossEditalContestList'); if(!box) return;
  const names=getContestNames();
  box.innerHTML=names.length?names.map(n=>`<label class="cross-contest-option"><input type="checkbox" value="${esc(n)}"><span>${esc(n)}</span></label>`).join(''):'<div class="cross-empty">Cadastre pelo menos dois concursos com conteúdo no edital.</div>';
}
function visibleRows(){
  return state.rows.filter(r=>state.filter==='all'||r.status===state.filter);
}
function renderSummary(){
  const el=document.getElementById('crossEditalSummary'); if(!el) return;
  const count=s=>state.rows.filter(r=>r.status===s).length;
  el.innerHTML=`<div><strong>${count('common')}</strong><span>Comuns</span></div><div><strong>${count('related')}</strong><span>Relacionados</span></div><div><strong>${count('unique')}</strong><span>Exclusivos</span></div><div><strong>${state.rows.length}</strong><span>Total</span></div>`;
}
function renderRows(){
  const host=document.getElementById('crossEditalRows'); if(!host) return;
  const rows=visibleRows();
  if(!rows.length){host.innerHTML='<div class="cross-empty">Nenhum item neste filtro.</div>';return;}
  host.innerHTML=rows.map(row=>`
    <div class="cross-row" data-cross-row="${esc(row.id)}">
      <label class="cross-include"><input type="checkbox" data-field="included" ${row.included?'checked':''}></label>
      <span class="cross-status ${row.status}">${row.status==='common'?'Comum':row.status==='related'?'Relacionado':'Exclusivo'}</span>
      <input class="cross-edit-input" data-field="materia" value="${esc(row.materia)}" aria-label="Matéria">
      <textarea class="cross-edit-input cross-assunto" data-field="assunto" aria-label="Assunto">${esc(row.assunto)}</textarea>
      <div class="cross-sources">${row.sources.map(s=>`<span>${esc(s)}</span>`).join('')}</div>
      <button type="button" class="cross-row-delete" data-cross-delete="${esc(row.id)}" title="Remover desta composição">Excluir</button>
    </div>`).join('');
}
function renderAll(){renderSummary();renderRows();}
function open(){
  renderContestSelection(); state={contests:[],rows:[],filter:'all'};
  const results=document.getElementById('crossEditalResults'); if(results) results.hidden=true;
  const name=document.getElementById('crossIntegratedName'); if(name) name.value='';
  const m=modal(); if(m){m.hidden=false;m.setAttribute('aria-hidden','false');m.style.display='flex';}
}
function close(){const m=modal(); if(m){m.hidden=true;m.setAttribute('aria-hidden','true');m.style.display='none';}}
function analyze(){
  const selected=[...document.querySelectorAll('#crossEditalContestList input[type="checkbox"]:checked')].map(x=>x.value);
  if(selected.length<2){global.appNotice?.('Selecione pelo menos dois concursos para cruzar.',{title:'Cruzamento de editais'});return;}
  state.contests=selected;
  state.rows=buildCrossRows(getAllItems(),selected);
  state.filter='all';
  const results=document.getElementById('crossEditalResults'); if(results) results.hidden=false;
  const name=document.getElementById('crossIntegratedName');
  if(name&&!name.value) name.value='Plano Integrado — '+selected.map(shortName).join(' + ');
  document.querySelectorAll('[data-cross-filter]').forEach(b=>b.classList.toggle('active',b.dataset.crossFilter==='all'));
  renderAll();
}
function shortName(value){
  const s=String(value||'').trim();
  return s.length>34?s.slice(0,31)+'…':s;
}
function setFilter(filter){
  state.filter=['all','common','related','unique'].includes(filter)?filter:'all';
  document.querySelectorAll('[data-cross-filter]').forEach(b=>b.classList.toggle('active',b.dataset.crossFilter===state.filter));
  renderRows();
}
function addManualRow(){
  state.rows.push({id:cryptoId(),materia:'Nova matéria',assunto:'Novo assunto',status:'unique',sources:['Manual'],included:true,prioridade:1,assunto_prioridade:1,score:0});
  state.filter='all'; renderAll();
}
function syncRowFromElement(el){
  const rowEl=el.closest('[data-cross-row]'); if(!rowEl) return;
  const row=state.rows.find(r=>r.id===rowEl.dataset.crossRow); if(!row) return;
  const field=el.dataset.field;
  if(field==='included') row.included=!!el.checked;
  if(field==='materia'||field==='assunto') row[field]=el.value;
}
function deleteRow(id){state.rows=state.rows.filter(r=>r.id!==id);renderAll();}
async function createIntegrated(){
  const name=String(document.getElementById('crossIntegratedName')?.value||'').trim();
  if(!name){global.appNotice?.('Informe o nome do plano integrado.',{title:'Plano integrado'});return;}
  const rows=state.rows.filter(r=>r.included&&String(r.materia||'').trim()&&String(r.assunto||'').trim());
  if(!rows.length){global.appNotice?.('Selecione pelo menos um conteúdo para o plano.',{title:'Plano integrado'});return;}
  const ok=await global.createIntegratedContestFromCrossEdital?.(name,rows,state.contests);
  if(ok){close();}
}
function selectAll(){
  document.querySelectorAll('#crossEditalContestList input[type="checkbox"]').forEach(x=>x.checked=true);
}
function clearSelection(){
  document.querySelectorAll('#crossEditalContestList input[type="checkbox"]').forEach(x=>x.checked=false);
}

if(typeof document!=='undefined'){
  document.addEventListener('click',e=>{
    const filter=e.target.closest('[data-cross-filter]'); if(filter){setFilter(filter.dataset.crossFilter);return;}
    const del=e.target.closest('[data-cross-delete]'); if(del){deleteRow(del.dataset.crossDelete);return;}
  });
  document.addEventListener('input',e=>{if(e.target.closest('[data-cross-row]')) syncRowFromElement(e.target);});
  document.addEventListener('change',e=>{if(e.target.closest('[data-cross-row]')) syncRowFromElement(e.target);});
}

const api={open,close,analyze,setFilter,addManualRow,createIntegrated,selectAll,clearSelection,normalizeText,similarity,buildCrossRows};
global.EditalCrossTool=Object.freeze(api);
if(typeof module!=='undefined'&&module.exports) module.exports={normalizeText,similarity,buildCrossRows};
})(typeof window!=='undefined'?window:globalThis);

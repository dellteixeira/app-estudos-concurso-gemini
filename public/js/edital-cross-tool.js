(function(global){
'use strict';

const STOPWORDS=new Set(['de','da','do','das','dos','e','em','para','por','a','o','as','os','um','uma','no','na','nos','nas','ao','aos','com','sem','sobre','entre','ou','que','se']);

function normalizeText(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function tokens(value){return normalizeText(value).split(' ').filter(t=>t.length>1&&!STOPWORDS.has(t));}
function similarity(a,b){
  const A=new Set(tokens(a)),B=new Set(tokens(b)); if(!A.size||!B.size)return 0;
  let inter=0; A.forEach(t=>{if(B.has(t))inter++;}); return inter/new Set([...A,...B]).size;
}
function titleCase(value){
  return String(value||'').trim().replace(/\s+/g,' ').replace(/(^|\s)([a-zá-ú])/giu,(m,p,c)=>p+c.toUpperCase());
}
function canonicalMateria(value){
  const raw=String(value||'Geral').trim()||'Geral';
  const n=normalizeText(raw);
  const aliases=[
    [/^(lingua )?portuguesa$|^portugues$/,'Língua Portuguesa'],
    [/^direito administrativo$|^nocoes de direito administrativo$/,'Direito Administrativo'],
    [/^direito constitucional$|^nocoes de direito constitucional$/,'Direito Constitucional'],
    [/^administracao publica$|^administracao geral e publica$|^administracao geral$/,'Administração Pública'],
    [/^gestao de pessoas$|^gestao pessoas$/,'Gestão de Pessoas'],
    [/^raciocinio logico( matematico)?$|^rlm$/,'Raciocínio Lógico-Matemático'],
    [/^administracao financeira e orcamentaria$|^afo$/,'Administração Financeira e Orçamentária'],
    [/^informatica$|^nocoes de informatica$/,'Informática']
  ];
  const hit=aliases.find(([re])=>re.test(n));
  return hit?hit[1]:titleCase(raw);
}
function groupItemsByContest(items,contests){
  const selected=new Set(contests); return items.filter(x=>selected.has(String(x.concurso||'Concurso Geral')));
}
function cryptoId(){
  try{return global.crypto?.randomUUID?.()||('cross-'+Date.now()+'-'+Math.random().toString(16).slice(2));}
  catch(_){return 'cross-'+Date.now()+'-'+Math.random().toString(16).slice(2);}
}
function buildCrossRows(items,contests){
  const source=groupItemsByContest(items,contests).map(item=>({...item,_materia:canonicalMateria(item.materia)}));
  const exact=new Map();
  source.forEach(item=>{
    const key=normalizeText(item._materia)+'::'+normalizeText(item.assunto);
    if(!normalizeText(item.assunto))return;
    if(!exact.has(key))exact.set(key,[]);
    exact.get(key).push(item);
  });
  const rows=[]; const used=new Set();
  exact.forEach(group=>{
    const origins=[...new Set(group.map(x=>String(x.concurso||'Concurso Geral')))];
    const best=group.reduce((a,b)=>String(b.assunto||'').length>String(a.assunto||'').length?b:a,group[0]);
    rows.push({
      id:cryptoId(),materia:best._materia,assunto:best.assunto||'Tópico',
      status:origins.length>1?'common':'unique',sources:origins,included:true,
      prioridade:Math.max(...group.map(x=>Number(x.prioridade)||1)),
      assunto_prioridade:Math.max(...group.map(x=>Number(x.assunto_prioridade)||1)),
      score:origins.length>1?1:0
    });
    group.forEach(x=>used.add(String(x.id)));
  });

  const uniqueRows=rows.filter(r=>r.status==='unique');
  const consumed=new Set();
  for(let i=0;i<uniqueRows.length;i++){
    const base=uniqueRows[i]; if(consumed.has(base.id))continue;
    const matches=[];
    for(let j=i+1;j<uniqueRows.length;j++){
      const candidate=uniqueRows[j]; if(consumed.has(candidate.id))continue;
      if(normalizeText(base.materia)!==normalizeText(candidate.materia))continue;
      if(base.sources.some(s=>candidate.sources.includes(s)))continue;
      const score=similarity(base.assunto,candidate.assunto);
      const shared=tokens(base.assunto).filter(t=>new Set(tokens(candidate.assunto)).has(t)).length;
      if(score>=0.72&&shared>=2)matches.push({candidate,score});
    }
    if(!matches.length)continue;
    const cluster=[base,...matches.map(m=>m.candidate)];
    const sources=[...new Set(cluster.flatMap(r=>r.sources))];
    const canonical=cluster.reduce((a,b)=>String(b.assunto||'').length>String(a.assunto||'').length?b:a,cluster[0]);
    const related={
      id:cryptoId(),materia:base.materia,assunto:canonical.assunto,status:'related',sources,included:true,
      prioridade:Math.max(...cluster.map(r=>r.prioridade||1)),
      assunto_prioridade:Math.max(...cluster.map(r=>r.assunto_prioridade||1)),
      score:matches.reduce((s,m)=>s+m.score,0)/matches.length
    };
    cluster.forEach(r=>consumed.add(r.id));
    rows.push(related);
  }
  const finalRows=rows.filter(r=>r.status!=='unique'||!consumed.has(r.id));
  return finalRows.sort((a,b)=>{
    const m=a.materia.localeCompare(b.materia,'pt-BR',{sensitivity:'base'});
    if(m)return m; const rank={common:0,related:1,unique:2};
    return rank[a.status]-rank[b.status]||a.assunto.localeCompare(b.assunto,'pt-BR',{sensitivity:'base'});
  });
}
function groupRowsByMateria(rows){
  const map=new Map();
  rows.forEach(row=>{
    const materia=canonicalMateria(row.materia),key=normalizeText(materia);
    if(!map.has(key))map.set(key,{key,materia,rows:[],counts:{common:0,related:0,unique:0}});
    const g=map.get(key); g.rows.push(row); g.counts[row.status]=(g.counts[row.status]||0)+1;
  });
  return [...map.values()].sort((a,b)=>a.materia.localeCompare(b.materia,'pt-BR',{sensitivity:'base'}));
}

let state={contests:[],rows:[],filter:'all',sourceFilter:'all',expanded:new Set()};
function getAllItems(){try{return global.AppState?.getEdital?.({all:true})||[];}catch(_){} try{return typeof allEditalItems!=='undefined'?[...allEditalItems]:[];}catch(_){return [];}}
function getContestNames(){
  const names=new Set(); getAllItems().forEach(i=>{const n=String(i.concurso||'').trim();if(n&&normalizeText(n)!=='concurso geral')names.add(n);});
  try{Object.keys(getConcursosMetadata?.()||{}).forEach(n=>{if(normalizeText(n)!=='concurso geral')names.add(n);});}catch(_){}
  return [...names].sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'}));
}
function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function modal(){return document.getElementById('modalEditalCrossTool');}
function renderContestSelection(){
  const box=document.getElementById('crossEditalContestList');if(!box)return;const names=getContestNames();
  box.innerHTML=names.length?names.map(n=>`<label class="cross-contest-option"><input type="checkbox" value="${esc(n)}"><span>${esc(n)}</span></label>`).join(''):'<div class="cross-empty">Cadastre pelo menos dois concursos com conteúdo no edital.</div>';
}
function visibleRows(){return state.rows.filter(r=>(state.filter==='all'||r.status===state.filter)&&(state.sourceFilter==='all'||r.sources.includes(state.sourceFilter)));}
function renderSummary(){
  const el=document.getElementById('crossEditalSummary');if(!el)return;
  const groups=groupRowsByMateria(state.rows);const count=s=>state.rows.filter(r=>r.status===s).length;
  el.innerHTML=`<div><strong>${groups.length}</strong><span>Matérias</span></div><div class="common"><strong>${count('common')}</strong><span>Assuntos comuns</span></div><div class="related"><strong>${count('related')}</strong><span>Relacionados</span></div><div class="unique"><strong>${count('unique')}</strong><span>Exclusivos</span></div>`;
}
function statusLabel(s){return s==='common'?'Comum':s==='related'?'Relacionado':'Exclusivo';}
function renderRows(){
  const host=document.getElementById('crossEditalRows');if(!host)return;
  const groups=groupRowsByMateria(visibleRows());
  if(!groups.length){host.innerHTML='<div class="cross-empty">Nenhum conteúdo neste filtro.</div>';return;}
  host.innerHTML=groups.map((g,idx)=>{
    const expanded=state.expanded.has(g.key)||(!state.expanded.size&&idx<2);
    const selected=g.rows.filter(r=>r.included).length;
    return `<section class="cross-materia-card ${expanded?'is-open':''}" data-cross-materia="${esc(g.key)}">
      <button type="button" class="cross-materia-head" data-cross-toggle="${esc(g.key)}" aria-expanded="${expanded}">
        <span class="cross-chevron">›</span><strong>${esc(g.materia)}</strong>
        <span class="cross-count-chip">${g.rows.length} assuntos</span>
        ${g.counts.common?`<span class="cross-mini-chip common">${g.counts.common} comuns</span>`:''}
        ${g.counts.related?`<span class="cross-mini-chip related">${g.counts.related} relacionados</span>`:''}
        ${g.counts.unique?`<span class="cross-mini-chip unique">${g.counts.unique} exclusivos</span>`:''}
        <span class="cross-selected-count">${selected}/${g.rows.length} selecionados</span>
      </button>
      <div class="cross-materia-body" ${expanded?'':'hidden'}>
        <div class="cross-assunto-head"><span>Assunto</span><span>Tipo</span><span>Presente em</span><span></span></div>
        <div class="cross-assunto-list">${g.rows.map(row=>`
          <div class="cross-assunto-row" data-cross-row="${esc(row.id)}">
            <label class="cross-assunto-main"><input type="checkbox" data-field="included" ${row.included?'checked':''}><textarea data-field="assunto" aria-label="Assunto">${esc(row.assunto)}</textarea></label>
            <span class="cross-status ${row.status}">${statusLabel(row.status)}</span>
            <div class="cross-sources">${row.sources.map(s=>`<span>${esc(shortName(s))}</span>`).join('')}</div>
            <button type="button" class="cross-icon-btn danger" data-cross-delete="${esc(row.id)}" title="Excluir assunto">×</button>
          </div>`).join('')}</div>
        <div class="cross-materia-actions">
          <label><input type="checkbox" data-cross-select-materia="${esc(g.key)}" ${selected===g.rows.length?'checked':''}> Selecionar todos os assuntos (${g.rows.length})</label>
          <div><button type="button" class="cross-text-btn" data-cross-rename-materia="${esc(g.key)}">Editar matéria</button><button type="button" class="cross-text-btn" data-cross-add-assunto="${esc(g.key)}">+ Adicionar assunto</button></div>
        </div>
      </div>
    </section>`;
  }).join('');
}
function renderAll(){renderSummary();renderRows();}
function open(){renderContestSelection();state={contests:[],rows:[],filter:'all',sourceFilter:'all',expanded:new Set()};const r=document.getElementById('crossEditalResults');if(r)r.hidden=true;const n=document.getElementById('crossIntegratedName');if(n)n.value='';const m=modal();if(m){m.hidden=false;m.setAttribute('aria-hidden','false');m.style.display='flex';}}
function close(){const m=modal();if(m){m.hidden=true;m.setAttribute('aria-hidden','true');m.style.display='none';}}
function analyze(){
  const selected=[...document.querySelectorAll('#crossEditalContestList input[type="checkbox"]:checked')].map(x=>x.value);
  if(selected.length<2){global.appNotice?.('Selecione pelo menos dois concursos para cruzar.',{title:'Cruzamento de editais'});return;}
  state.contests=selected;state.rows=buildCrossRows(getAllItems(),selected);state.filter='all';state.sourceFilter='all';state.expanded=new Set(groupRowsByMateria(state.rows).slice(0,2).map(g=>g.key));
  const sel=document.getElementById('crossSourceFilter');if(sel)sel.innerHTML='<option value="all">Editais selecionados ('+selected.length+')</option>'+selected.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
  const r=document.getElementById('crossEditalResults');if(r)r.hidden=false;const name=document.getElementById('crossIntegratedName');if(name&&!name.value)name.value='Plano Integrado — '+selected.map(shortName).join(' + ');
  document.querySelectorAll('[data-cross-filter]').forEach(b=>b.classList.toggle('active',b.dataset.crossFilter==='all'));renderAll();
}
function shortName(v){const s=String(v||'').trim();return s.length>30?s.slice(0,27)+'…':s;}
function setFilter(f){state.filter=['all','common','related','unique'].includes(f)?f:'all';document.querySelectorAll('[data-cross-filter]').forEach(b=>b.classList.toggle('active',b.dataset.crossFilter===state.filter));renderRows();}
function setSourceFilter(v){state.sourceFilter=state.contests.includes(v)?v:'all';renderRows();}
function includeScope(scope){state.rows.forEach(r=>{r.included=scope==='common'?r.status==='common':scope==='connected'?(r.status==='common'||r.status==='related'):true;});renderRows();}
function addManualRow(){state.rows.push({id:cryptoId(),materia:'Nova matéria',assunto:'Novo assunto',status:'unique',sources:['Manual'],included:true,prioridade:1,assunto_prioridade:1,score:0});state.filter='all';state.expanded.add(normalizeText('Nova matéria'));renderAll();}
function addAssunto(key){const g=groupRowsByMateria(state.rows).find(x=>x.key===key);if(!g)return;state.rows.push({id:cryptoId(),materia:g.materia,assunto:'Novo assunto',status:'unique',sources:['Manual'],included:true,prioridade:1,assunto_prioridade:1,score:0});state.expanded.add(key);renderAll();}
function renameMateria(key){const g=groupRowsByMateria(state.rows).find(x=>x.key===key);if(!g)return;const next=global.prompt?.('Nome da matéria:',g.materia);if(!next||!String(next).trim())return;g.rows.forEach(r=>r.materia=String(next).trim());state.expanded.delete(key);state.expanded.add(normalizeText(canonicalMateria(next)));renderAll();}
function toggleMateria(key){state.expanded.has(key)?state.expanded.delete(key):state.expanded.add(key);renderRows();}
function selectMateria(key,checked){const g=groupRowsByMateria(state.rows).find(x=>x.key===key);if(g)g.rows.forEach(r=>r.included=checked);renderRows();}
function syncRowFromElement(el){const rowEl=el.closest('[data-cross-row]');if(!rowEl)return;const row=state.rows.find(r=>r.id===rowEl.dataset.crossRow);if(!row)return;if(el.dataset.field==='included')row.included=!!el.checked;if(el.dataset.field==='assunto')row.assunto=el.value;}
function deleteRow(id){state.rows=state.rows.filter(r=>r.id!==id);renderAll();}
async function createIntegrated(){
  const name=String(document.getElementById('crossIntegratedName')?.value||'').trim();if(!name){global.appNotice?.('Informe o nome do plano integrado.',{title:'Plano integrado'});return;}
  const rows=state.rows.filter(r=>r.included&&String(r.materia||'').trim()&&String(r.assunto||'').trim());if(!rows.length){global.appNotice?.('Selecione pelo menos um conteúdo para o plano.',{title:'Plano integrado'});return;}
  const ok=await global.createIntegratedContestFromCrossEdital?.(name,rows,state.contests);if(ok)close();
}
function selectAll(){document.querySelectorAll('#crossEditalContestList input[type="checkbox"]').forEach(x=>x.checked=true);}
function clearSelection(){document.querySelectorAll('#crossEditalContestList input[type="checkbox"]').forEach(x=>x.checked=false);}

if(typeof document!=='undefined'){
 document.addEventListener('click',e=>{
  const f=e.target.closest('[data-cross-filter]');if(f){setFilter(f.dataset.crossFilter);return;}
  const s=e.target.closest('[data-cross-scope]');if(s){includeScope(s.dataset.crossScope);return;}
  const d=e.target.closest('[data-cross-delete]');if(d){deleteRow(d.dataset.crossDelete);return;}
  const t=e.target.closest('[data-cross-toggle]');if(t){toggleMateria(t.dataset.crossToggle);return;}
  const a=e.target.closest('[data-cross-add-assunto]');if(a){addAssunto(a.dataset.crossAddAssunto);return;}
  const r=e.target.closest('[data-cross-rename-materia]');if(r){renameMateria(r.dataset.crossRenameMateria);return;}
 });
 document.addEventListener('input',e=>{if(e.target.closest('[data-cross-row]'))syncRowFromElement(e.target);});
 document.addEventListener('change',e=>{
  if(e.target.id==='crossSourceFilter'){setSourceFilter(e.target.value);return;}
  if(e.target.matches('[data-cross-select-materia]')){selectMateria(e.target.dataset.crossSelectMateria,e.target.checked);return;}
  if(e.target.closest('[data-cross-row]'))syncRowFromElement(e.target);
 });
}
const api={open,close,analyze,setFilter,setSourceFilter,includeScope,addManualRow,createIntegrated,selectAll,clearSelection,normalizeText,similarity,canonicalMateria,buildCrossRows,groupRowsByMateria};
global.EditalCrossTool=Object.freeze(api);
if(typeof module!=='undefined'&&module.exports)module.exports={normalizeText,similarity,canonicalMateria,buildCrossRows,groupRowsByMateria};
})(typeof window!=='undefined'?window:globalThis);

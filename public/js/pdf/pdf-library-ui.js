(function(global){
'use strict';
let state={docs:[],workspaces:[],scope:'global',activeWorkspace:'',activeMateria:'',activeAssunto:'',search:'',initializedFor:'',loadSeq:0};
const LIBRARY_VIEW_KEY='pdfLibraryViewMode';
let activationPromise=null,lastActivationAt=0;
let selectedFiles=[],linkPdfId=null,workspaceReturnContext='library',pendingOpenDocumentId=null,ensureWorkspacePromise=null,selectionMode=false,selectedPdfIds=new Set(),lastUploadFailures=[],lastUploadContext=null;
const $=id=>document.getElementById(id);
const esc=v=>typeof global.escapeHtml==='function'?global.escapeHtml(v):String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function contest(){try{return document.getElementById('concursoSelect')?.value||global.getLastStudiedConcurso?.()||'Concurso Geral'}catch(_){return'Concurso Geral'}}
function materias(){try{return global.getUniqueMateriasFromEdital?.()||[]}catch(_){return[]}}
function assuntos(m){try{return global.getAssuntosForMateria?.(m)||[]}catch(_){return[]}}
function bytes(n){n=Number(n||0);return n<1048576?`${Math.max(1,Math.round(n/1024))} KB`:`${(n/1048576).toFixed(n>=10485760?0:1)} MB`}
function status(m,k=''){const e=$('pdfLibraryStatus');if(e){e.textContent=m||'';e.dataset.kind=k}}
function uploadConcurrency(){const mobile=matchMedia?.('(max-width:700px)')?.matches;const conn=navigator.connection?.effectiveType||'';return mobile||/2g/.test(conn)?2:3}
function renderSelectedFiles(){
  const name=$('pdfUploadFileName'),list=$('pdfUploadFileList'),title=$('pdfUploadTitle'),btn=$('btnSubmitPdfUpload');
  const count=selectedFiles.length;if(name){name.dataset.selected=count?'true':'false';name.textContent=count?`${count} PDF${count===1?'':'s'} selecionado${count===1?'':'s'}`:'Nenhum arquivo selecionado'}
  if(list)list.innerHTML=selectedFiles.slice(0,12).map((f,i)=>`<div class="pdf-upload-file-row"><span>${esc(f.name)}</span><small>${bytes(f.size)}</small><button type="button" onclick="event.stopPropagation();PdfStudyLibraryUI.removeUploadFile(${i})" aria-label="Remover ${esc(f.name)}">×</button></div>`).join('')+(count>12?`<div class="pdf-upload-more">+ ${count-12} arquivo(s)</div>`:'');
  if(title){title.disabled=count!==1;title.placeholder=count===1?'Título do PDF':'Para lotes, o título vem do nome de cada arquivo';if(count!==1)title.value='';else if(!title.value.trim())title.value=selectedFiles[0]?.name?.replace(/\.pdf$/i,'')||''}
  if(btn)btn.textContent=count>1?`Adicionar ${count} PDFs`:'Adicionar à Biblioteca';
}
function updateBulkToolbar(){const bar=$('pdfBulkToolbar'),count=$('pdfBulkSelectedCount'),toggle=$('btnPdfSelectionMode');if(bar)bar.hidden=!selectionMode;if(count)count.textContent=String(selectedPdfIds.size);if(toggle)toggle.textContent=selectionMode?'Concluir seleção':'Selecionar'}
function uploadFailureLabel(code){return({INVALID_TYPE:'Formato inválido',EMPTY_FILE:'Arquivo vazio',TOO_LARGE:'Excede o limite',INVALID_PDF:'PDF inválido/corrompido',NETWORK_ERROR:'Falha de conexão',STORAGE_ERROR:'Erro no Storage',DATABASE_ERROR:'Erro de registro',PROGRESS_ERROR:'Erro de progresso',LINK_ERROR:'Erro de vínculo',UNKNOWN_ERROR:'Erro inesperado'})[code]||'Erro';}
function renderUploadResult(result){
  const panel=$('pdfUploadResultPanel'),summary=$('pdfUploadResultSummary'),list=$('pdfUploadResultList'),retry=$('btnRetryFailedPdfs'),remove=$('btnRemoveFailedPdfs');if(!panel)return;
  const ok=result?.successful?.length||0,failed=result?.failed||[];lastUploadFailures=failed;
  panel.hidden=false;panel.dataset.kind=failed.length?'warn':'ok';
  if(summary)summary.textContent=failed.length?`${ok} enviado(s) · ${failed.length} falharam. Os enviados foram preservados.`:`${ok} PDF(s) enviados com sucesso.`;
  if(list)list.innerHTML=[...(result?.successful||[]).map(d=>`<div class="pdf-upload-result-row ok"><span>✓</span><div><strong>${esc(d.original_file_name||d.title||'PDF')}</strong><small>Enviado com sucesso</small></div></div>`),...failed.map(item=>`<div class="pdf-upload-result-row error"><span>×</span><div><strong>${esc(item.file?.name||'PDF')}</strong><small>${esc(uploadFailureLabel(item.code))}: ${esc(item.message||item.error?.message||'Falha no upload.')}</small>${item.technicalMessage?`<details><summary>Detalhes técnicos</summary><code>${esc(item.code||'UNKNOWN_ERROR')} · ${esc(item.stage||'unknown')} · ${esc(item.technicalMessage)}</code></details>`:''}</div></div>`)].join('');
  if(retry)retry.hidden=!failed.length;if(remove)remove.hidden=!failed.length;
}
function resetUploadResult(){lastUploadFailures=[];lastUploadContext=null;const panel=$('pdfUploadResultPanel');if(panel){panel.hidden=true;panel.dataset.kind='';}const list=$('pdfUploadResultList');if(list)list.innerHTML='';}
function retryFailedUploads(){if(!lastUploadFailures.length)return;selectedFiles=lastUploadFailures.map(x=>x.file).filter(Boolean);renderSelectedFiles();resetUploadResult();submitUpload(true)}
function removeFailedUploads(){selectedFiles=selectedFiles.filter(f=>!lastUploadFailures.some(x=>x.file===f));lastUploadFailures=[];renderSelectedFiles();resetUploadResult()}
async function copyUploadReport(){
  if(!lastUploadFailures.length)return alert('Não há falhas para copiar.');
  const lines=['Relatório de falhas no upload de PDFs','',...lastUploadFailures.map((x,i)=>`${i+1}. ${x.file?.name||'PDF'}\nCódigo: ${x.code||'UNKNOWN_ERROR'}\nEtapa: ${x.stage||'unknown'}\nMotivo: ${x.message||x.error?.message||'Falha'}${x.technicalMessage?`\nDetalhe técnico: ${x.technicalMessage}`:''}`)];const report=lines.join('\n\n');
  try{await navigator.clipboard.writeText(report);status('Relatório de falhas copiado.','ok')}catch(_){const ta=document.createElement('textarea');ta.value=report;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();status('Relatório de falhas copiado.','ok')}
}

async function ensureWorkspace(){
  if(ensureWorkspacePromise)return ensureWorkspacePromise;
  ensureWorkspacePromise=(async()=>{
    let all=await global.PdfStudyWorkspaces.ensureDefault();
    state.workspaces=all;
    renderWs();
    return all;
  })();
  try{return await ensureWorkspacePromise}finally{ensureWorkspacePromise=null}
}

function renderWs(preferredId=''){
  for(const id of ['pdfWorkspaceFilter','pdfUploadWorkspace','pdfLinkWorkspace']){
    const e=$(id);if(!e)continue;
    const previous=preferredId||e.value||'';
    const prefix=id==='pdfWorkspaceFilter'?'<option value="">Todos os Workspaces</option>':'';
    e.innerHTML=prefix+state.workspaces.map(w=>`<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('');
    if(id==='pdfWorkspaceFilter') e.value=state.activeWorkspace||'';
    else if(previous&&state.workspaces.some(w=>String(w.id)===String(previous))) e.value=previous;
    else {const def=state.workspaces.find(w=>w.is_default)||state.workspaces[0];if(def)e.value=def.id;}
  }
}
function renderMat(){
  const opts=materias().map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
  for(const id of ['pdfMateriaFilter','pdfUploadMateria','pdfLinkMateria']){const e=$(id);if(e)e.innerHTML=`<option value="">${id==='pdfMateriaFilter'?'Todas as matérias':'Sem matéria específica'}</option>`+opts;}
  renderAss('filter');renderAss('upload');renderAss('link');
}
function renderAss(mode){
  const mid=mode==='filter'?'pdfMateriaFilter':mode==='upload'?'pdfUploadMateria':'pdfLinkMateria';
  const tid=mode==='filter'?'pdfAssuntoFilter':mode==='upload'?'pdfUploadAssunto':'pdfLinkAssunto';
  const e=$(tid);if(!e)return;
  const arr=assuntos($(mid)?.value||'');
  e.innerHTML=`<option value="">${mode==='filter'?'Todos os assuntos':'Sem assunto específico'}</option>`+arr.map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('');
}
function linkContextLabel(link){if(!link)return'';const parts=[link.materia,link.assunto].filter(Boolean);return parts.length?parts.map(esc).join(' · '):'Somente Workspace';}

async function load(){
  const seq=++state.loadSeq; const cc=contest();
  const filters={scope:state.scope,concurso:cc,workspaceId:state.activeWorkspace,materia:state.activeMateria,assunto:state.activeAssunto,search:state.search};
  status('Carregando biblioteca…');
  try{const cached=await global.PdfStudyLibrary.getCached(filters);if(seq===state.loadSeq&&cached.length){state.docs=cached;render();status(`Mostrando cache local (${cached.length}). Sincronizando…`,'warn')}}catch(_){/* cache é melhor esforço */}
  const docs=await global.PdfStudyLibrary.list(filters);
  if(seq!==state.loadSeq||cc!==contest())return;
  state.docs=docs; render();
  status(`${state.docs.length} ${state.docs.length===1?'PDF encontrado':'PDFs encontrados'}.`,'ok');
}
function ws(id){return state.workspaces.find(w=>w.id===id)?.name||'Sem Workspace'}
function render(){
  const c=$('pdfLibraryGrid');if(!c)return;
  if(!state.docs.length){c.innerHTML='<div class="pdf-empty-state"><div class="pdf-empty-icon">📚</div><h4>Nenhum PDF nesta seleção</h4><p>Adicione um PDF à Biblioteca Global ou altere o filtro.</p><button class="btn btn-primary" onclick="PdfStudyLibraryUI.openUploadModal()">+ Adicionar PDF</button></div>';return;}
  c.innerHTML=state.docs.map(d=>{
    const p=Number(d.progress?.progress_percentage||0),pg=Number(d.progress?.current_page||1),l=d.activeLink;
    const context=l?linkContextLabel(l):`${d.links.length} vínculo${d.links.length===1?'':'s'} de estudo`;
    const wa=l?ws(l.workspace_id):'Biblioteca Global';
    const secondary=state.scope==='contest'&&l?`<button class="btn btn-secondary btn-sm pdf-library-card-action" onclick="PdfStudyLibraryUI.unlinkDocument('${esc(d.id)}')">Desvincular</button>`:`<button class="btn btn-secondary btn-sm pdf-library-card-action" onclick="PdfStudyLibraryUI.openLinkModal('${esc(d.id)}')">Vincular</button>`;
    const del=state.scope==='global'?`<button class="btn btn-danger btn-sm pdf-library-card-action pdf-library-card-delete" onclick="PdfStudyLibraryUI.deleteDocument('${esc(d.id)}')">Excluir</button>`:'';
    return `<article class="pdf-library-card ${selectedPdfIds.has(d.id)?'selected':''}"><div class="pdf-card-top">${selectionMode?`<label class="pdf-card-select"><input type="checkbox" ${selectedPdfIds.has(d.id)?'checked':''} onchange="PdfStudyLibraryUI.toggleDocumentSelection('${esc(d.id)}',this.checked)"><span>Selecionar</span></label>`:'<span class="pdf-file-badge">PDF</span>'}<button class="pdf-favorite-btn ${d.is_favorite?'active':''}" onclick="PdfStudyLibraryUI.toggleFavorite('${esc(d.id)}')">★</button></div><h4>${esc(d.title)}</h4><p class="pdf-card-context">${context}</p><p class="pdf-card-workspace">${esc(wa)}</p><div class="pdf-progress-line"><span style="width:${Math.min(100,Math.max(0,p))}%"></span></div><div class="pdf-card-meta"><span>${p.toFixed(0)}% lido · pág. ${pg}</span><span>${bytes(d.file_size)}</span></div><div class="pdf-card-actions"><button class="btn btn-secondary btn-sm pdf-library-card-action" onclick="PdfStudyLibraryUI.openDocument('${esc(d.id)}')">Visualizar</button>${secondary}${del}</div></article>`;
  }).join('');
}

function ensureLibraryViewStyles(){if($('pdfLibraryViewStyles'))return;const el=document.createElement('style');el.id='pdfLibraryViewStyles';el.textContent=`.pdf-library-view-toggle{display:flex;gap:4px;align-items:center;min-height:48px;padding:4px;border:1px solid var(--border-color,#29445d);border-radius:12px;background:rgba(7,25,41,.55)}.pdf-library-view-toggle button{border:0;border-radius:9px;background:transparent;color:var(--text-muted,#9fb2c6);padding:9px 11px;font:inherit;font-weight:650;cursor:pointer;white-space:nowrap}.pdf-library-view-toggle button.active{background:var(--accent-color,#55ddd2);color:#06202b}.pdf-library-grid.pdf-library-list-view{display:flex!important;flex-direction:column!important;gap:10px!important}.pdf-library-grid.pdf-library-list-view .pdf-library-card{width:100%!important;max-width:none!important;display:grid!important;grid-template-columns:minmax(200px,1.7fr) minmax(150px,1fr) minmax(220px,auto);grid-template-areas:'top top top' 'title context actions' 'workspace meta actions' 'progress progress actions';column-gap:16px;align-items:center;padding:15px 17px}.pdf-library-grid.pdf-library-list-view .pdf-card-top{grid-area:top}.pdf-library-grid.pdf-library-list-view h4{grid-area:title;margin:0}.pdf-library-grid.pdf-library-list-view .pdf-card-context{grid-area:context;margin:0}.pdf-library-grid.pdf-library-list-view .pdf-card-workspace{grid-area:workspace;margin:0}.pdf-library-grid.pdf-library-list-view .pdf-progress-line{grid-area:progress;margin-top:6px}.pdf-library-grid.pdf-library-list-view .pdf-card-meta{grid-area:meta}.pdf-library-grid.pdf-library-list-view .pdf-card-actions{grid-area:actions;justify-content:flex-end}@media(max-width:700px){.pdf-library-view-toggle{width:100%;grid-column:1/-1}.pdf-library-view-toggle button{flex:1}.pdf-library-grid.pdf-library-list-view .pdf-library-card{display:block!important}.pdf-library-grid.pdf-library-list-view .pdf-card-actions{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.pdf-library-grid.pdf-library-list-view .pdf-card-actions .btn{width:100%;min-width:0}}`;document.head.appendChild(el)}
function getLibraryViewMode(){try{return localStorage.getItem(LIBRARY_VIEW_KEY)==='list'?'list':'cards'}catch(_){return'cards'}}
function applyLibraryViewMode(mode=getLibraryViewMode()){mode=mode==='list'?'list':'cards';try{localStorage.setItem(LIBRARY_VIEW_KEY,mode)}catch(_){}const grid=$('pdfLibraryGrid');grid?.classList.toggle('pdf-library-list-view',mode==='list');document.querySelectorAll('#pdfLibraryViewToggle button[data-view]').forEach(btn=>{const active=btn.dataset.view===mode;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',active?'true':'false')})}
function ensureLibraryViewToggle(){ensureLibraryViewStyles();const assunto=$('pdfAssuntoFilter');if(!assunto)return;let wrap=$('pdfLibraryViewToggle');if(!wrap){wrap=document.createElement('div');wrap.id='pdfLibraryViewToggle';wrap.className='pdf-library-view-toggle';wrap.setAttribute('aria-label','Modo de visualização da Biblioteca');wrap.innerHTML='<button type="button" data-view="cards" aria-label="Visualizar em cards">▦ Cards</button><button type="button" data-view="list" aria-label="Visualizar em lista">☰ Lista</button>';wrap.addEventListener('click',event=>{const btn=event.target.closest('button[data-view]');if(btn)applyLibraryViewMode(btn.dataset.view)});assunto.insertAdjacentElement('afterend',wrap)}applyLibraryViewMode()}
async function activateLibrary(){ensureLibraryViewToggle();applyLibraryViewMode();if(activationPromise)return activationPromise;const now=Date.now();if(now-lastActivationAt<220)return;lastActivationAt=now;activationPromise=initialize(false).finally(()=>{activationPromise=null;ensureLibraryViewToggle();applyLibraryViewMode()});return activationPromise}
async function initialize(force=false){
  if(!global.PdfStudyLinks)return;
  const cc=contest();
  const sameContext=state.initializedFor===cc;
  if(sameContext){await load();return;}
  state={...state,docs:[],activeWorkspace:'',activeMateria:'',activeAssunto:'',search:'',initializedFor:cc};
  const badge=$('pdfLibraryContestName');if(badge)badge.textContent=(cc&&cc!=='—')?cc:'Nenhum selecionado';
  if(!$('concursoSelect')?.value||$('concursoSelect')?.value==='—')state.scope='global';
  if($('pdfLibraryScope'))$('pdfLibraryScope').value=state.scope;
  renderMat();
  const loadPromise=load().catch(handle);
  const maintenancePromise=Promise.allSettled([global.PdfStudyLinks.processPendingContestOperations(),ensureWorkspace()]).then(results=>{
    const workspaceResult=results[1];
    if(workspaceResult?.status==='rejected'){console.warn('[PDF Workspaces] falha não bloqueante:',workspaceResult.reason);state.workspaces=[];renderWs();status('Workspaces indisponíveis temporariamente; PDFs continuam acessíveis.','warn');}
    else renderWs();
  });
  await loadPromise;
  maintenancePromise.catch(()=>{});
}
function onScopeChange(v){state.scope=v==='global'?'global':'contest';state.activeMateria='';state.activeAssunto='';$('pdfLibraryScope').value=state.scope;load().catch(handle)}
function onWorkspaceFilterChange(v){state.activeWorkspace=v||'';load().catch(handle)}
function onMateriaFilterChange(v){state.activeMateria=v||'';state.activeAssunto='';renderAss('filter');load().catch(handle)}
function onAssuntoFilterChange(v){state.activeAssunto=v||'';load().catch(handle)}
let st;function onSearch(v){clearTimeout(st);st=setTimeout(()=>{state.search=String(v||'').trim();load().catch(handle)},180)}

function openWorkspaceModal(context='library'){
  workspaceReturnContext=context==='upload'?'upload':context==='link'?'link':'library';
  $('pdfWorkspaceName').value='';$('pdfWorkspaceDescription').value='';$('modalPdfWorkspace').style.display='flex';
  setTimeout(()=>$('pdfWorkspaceName')?.focus(),0);
}
function closeWorkspaceModal(){$('modalPdfWorkspace').style.display='none';workspaceReturnContext='library'}
async function createWorkspace(){
  const btn=$('btnCreatePdfWorkspace');
  try{if(btn)btn.disabled=true;const created=await global.PdfStudyWorkspaces.create({name:$('pdfWorkspaceName').value,description:$('pdfWorkspaceDescription').value});$('modalPdfWorkspace').style.display='none';await ensureWorkspace();renderWs(created.id);if(workspaceReturnContext==='upload'){$('pdfUploadWorkspace').value=created.id;$('modalPdfUpload').style.display='flex'}if(workspaceReturnContext==='link'){$('pdfLinkWorkspace').value=created.id;$('modalPdfLink').style.display='flex'}workspaceReturnContext='library';await load();status(`Workspace “${created.name}” disponível.`,'ok');}catch(e){handle(e)}finally{if(btn)btn.disabled=false}
}
async function openUploadModal(){
  try{await ensureWorkspace();selectedFiles=[];resetUploadResult();$('pdfUploadFile').value='';$('pdfUploadTitle').value='';renderSelectedFiles();$('pdfUploadProgress').style.width='0%';$('pdfUploadProgressText').textContent='';renderWs();renderMat();$('modalPdfUpload').style.display='flex';}catch(e){handle(e)}
}
function closeUploadModal(){$('modalPdfUpload').style.display='none';selectedFiles=[];resetUploadResult();$('pdfDropZone')?.classList.remove('drag-over')}
function chooseUploadFile(){$('pdfUploadFile')?.click()}
function onDropZoneKeydown(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseUploadFile()}}
function addFiles(files){const incoming=[...(files||[])];if(!incoming.length)return;resetUploadResult();const map=new Map(selectedFiles.map(f=>[`${f.name}|${f.size}|${f.lastModified||0}`,f]));for(const f of incoming)map.set(`${f.name}|${f.size}|${f.lastModified||0}`,f);selectedFiles=[...map.values()];renderSelectedFiles();}
function removeUploadFile(index){selectedFiles.splice(Number(index),1);renderSelectedFiles()}
function onUploadFileChange(i){addFiles(i?.files);if(i)i.value=''}
function onUploadMateriaChange(){renderAss('upload')}
async function submitUpload(isRetry=false){
  if(!selectedFiles.length)return alert('Selecione pelo menos um arquivo PDF antes de continuar.');
  const workspaceId=$('pdfUploadWorkspace').value,materia=$('pdfUploadMateria').value,assunto=$('pdfUploadAssunto').value;
  if(!workspaceId)return alert('Selecione um Workspace.');if(assunto&&!materia)return alert('Selecione uma matéria antes de escolher um assunto.');
  const btn=$('btnSubmitPdfUpload'),files=[...selectedFiles];lastUploadContext={workspaceId,materia,assunto,concurso:contest()};if(!isRetry)resetUploadResult();
  try{
    if(btn)btn.disabled=true;$('pdfUploadProgress').style.width='0%';$('pdfUploadProgressText').textContent=`Preparando ${files.length} PDF(s)…`;
    const result=await global.PdfStudyUpload.uploadMany({files,workspaceId,concurso:contest(),materia,assunto,concurrency:uploadConcurrency(),onProgress:p=>{$('pdfUploadProgress').style.width=`${p.percent||0}%`;$('pdfUploadProgressText').textContent=`${p.completed}/${p.total} concluídos · ${p.successful} enviados${p.failed?` · ${p.failed} falharam`:''}`},onItemProgress:i=>{if(i.document){state.docs=[i.document,...state.docs.filter(d=>d.id!==i.document.id)];render()}}});
    for(const doc of result.successful||[])state.docs=[doc,...state.docs.filter(d=>d.id!==doc.id)];render();renderUploadResult(result);
    try{await load()}catch(syncError){console.warn('[PDF Library] lote salvo; sincronização de tela falhou:',syncError)}
    if(result.failed?.length){selectedFiles=result.failed.map(x=>x.file).filter(Boolean);renderSelectedFiles();status(`${result.successful.length} PDF(s) enviados; ${result.failed.length} falharam. Veja o diagnóstico por arquivo e tente novamente somente as falhas.`,'warn')}
    else{status(`${result.successful.length} PDF(s) adicionados à Biblioteca Global.`,'ok');setTimeout(()=>closeUploadModal(),500)}
  }catch(e){const classified=global.PdfStudyUpload?.classifyError?.(e,{file:files[0],stage:e?.stage||'unknown'})||e;const result={successful:[],failed:[{file:files[0],error:classified,code:classified.code,stage:classified.stage,message:classified.userMessage||classified.message,technicalMessage:classified.technicalMessage}],total:files.length};renderUploadResult(result);status(classified.userMessage||classified.message||'Falha no upload.','error')}finally{if(btn)btn.disabled=false}
}
function openLinkModal(id){linkPdfId=id;const d=state.docs.find(x=>x.id===id);$('pdfLinkDocumentTitle').textContent=d?.title||'';renderWs();renderMat();$('modalPdfLink').style.display='flex'}
function closeLinkModal(){$('modalPdfLink').style.display='none';linkPdfId=null}
function onLinkMateriaChange(){renderAss('link')}
async function submitLink(){try{const workspaceId=$('pdfLinkWorkspace').value,materia=$('pdfLinkMateria').value,assunto=$('pdfLinkAssunto').value;if(!workspaceId)return alert('Selecione um Workspace.');if(assunto&&!materia)return alert('Selecione uma matéria antes de escolher um assunto.');await global.PdfStudyLinks.create({pdfId:linkPdfId,workspaceId,concurso:contest(),materia,assunto});closeLinkModal();await load();status('Novo vínculo criado sem duplicar o PDF.','ok')}catch(e){handle(e)}}
async function unlinkDocument(id){if(!confirm('Remover este PDF apenas do concurso atual? O arquivo continuará na Biblioteca Global.'))return;try{await global.PdfStudyLinks.removeForPdfInConcurso(id,contest());await load();status('Vínculo removido. O PDF foi preservado na Biblioteca Global.','ok')}catch(e){handle(e)}}
async function toggleFavorite(id){const d=state.docs.find(x=>x.id===id);try{await global.PdfStudyLibrary.setFavorite(id,!d?.is_favorite);await load()}catch(e){handle(e)}}
async function deleteDocument(id){const d=state.docs.find(x=>x.id===id);if(!d||!confirm(`Excluir “${d.title}” da Biblioteca Global? Isso remove o arquivo e todos os vínculos.`))return;try{await global.PdfStudyLibrary.remove(d);await load()}catch(e){handle(e)}}
async function openDocument(id){try{const d=state.docs.find(x=>x.id===id);if(!d)throw new Error('PDF não encontrado na Biblioteca.');if(!global.PdfStudyReader)throw new Error('Reader PDF interno não carregado.');await global.PdfStudyReader.open(d)}catch(e){handle(e)}}
function closeViewerNoticeModal(){const m=$('modalPdfViewerNotice');if(m)m.style.display='none';pendingOpenDocumentId=null}
async function confirmOpenTemporaryView(){return openDocument(pendingOpenDocumentId)}
async function refreshLibrary(){state.initializedFor='';await initialize(true)}
function toggleSelectionMode(){selectionMode=!selectionMode;if(!selectionMode)selectedPdfIds.clear();updateBulkToolbar();render()}
function toggleDocumentSelection(id,checked){if(checked)selectedPdfIds.add(id);else selectedPdfIds.delete(id);updateBulkToolbar();const card=document.querySelector(`.pdf-library-card input[type="checkbox"][onchange*="${id}"]`)?.closest('.pdf-library-card');card?.classList.toggle('selected',!!checked)}
function selectAllVisible(){state.docs.forEach(d=>selectedPdfIds.add(d.id));updateBulkToolbar();render()}
function clearSelection(){selectedPdfIds.clear();updateBulkToolbar();render()}
async function deleteSelected(){
  const docs=state.docs.filter(d=>selectedPdfIds.has(d.id));if(!docs.length)return alert('Selecione pelo menos um PDF.');
  if(!confirm(`Excluir permanentemente ${docs.length} PDF(s) da Biblioteca Global?\n\nOs arquivos, vínculos, progresso e marcações associados serão removidos. Esta ação não pode ser desfeita.`))return;
  const btn=$('btnDeleteSelectedPdfs');try{if(btn)btn.disabled=true;status(`Excluindo ${docs.length} PDF(s)…`,'warn');const result=await global.PdfStudyLibrary.removeMany(docs,{onProgress:p=>status(`Excluindo PDFs… ${p.deleted}/${p.total}`,'warn')});selectedPdfIds.clear();state.docs=state.docs.filter(d=>!docs.some(x=>x.id===d.id));updateBulkToolbar();render();await load().catch(()=>{});status(`${result.deleted} PDF(s) excluídos da Biblioteca Global.`,'ok')}catch(e){handle(e)}finally{if(btn)btn.disabled=false}
}
function handleDrop(e){e.preventDefault();$('pdfDropZone')?.classList.remove('drag-over');addFiles(e.dataTransfer?.files)}
function handleDragOver(e){e.preventDefault();$('pdfDropZone')?.classList.add('drag-over')}
function handleDragLeave(){$('pdfDropZone')?.classList.remove('drag-over')}
function handle(e){
  console.error('[PDF Library]',e);
  const network=global.PdfStudyCore?.isNetworkError?.(e);
  if(network){status('Falha temporária de conexão. Seus PDFs salvos não foram apagados. Tente atualizar a Biblioteca em alguns segundos.','warn');return;}
  status(e?.message||'Erro.','error');alert(e?.message||'Erro.');
}

global.PdfStudyLibraryUI=Object.freeze({initialize,refresh:refreshLibrary,getCurrentContest:contest,onTabActivated:activateLibrary,setViewMode:applyLibraryViewMode,onScopeChange,onWorkspaceFilterChange,onMateriaFilterChange,onAssuntoFilterChange,onSearch,openWorkspaceModal,closeWorkspaceModal,createWorkspace,openUploadModal,closeUploadModal,chooseUploadFile,onDropZoneKeydown,onUploadFileChange,removeUploadFile,onUploadMateriaChange,submitUpload,retryFailedUploads,removeFailedUploads,copyUploadReport,openLinkModal,closeLinkModal,onLinkMateriaChange,submitLink,unlinkDocument,toggleFavorite,deleteDocument,toggleSelectionMode,toggleDocumentSelection,selectAllVisible,clearSelection,deleteSelected,openDocument,closeViewerNoticeModal,confirmOpenTemporaryView,handleDrop,handleDragOver,handleDragLeave});
})(window);

// V10.24 — acabamento responsivo da Biblioteca e posicionamento da guia.
function tuneLibraryUiV1024(){
  const ids=['pdfLibraryScope','pdfWorkspaceFilter','pdfMateriaFilter','pdfAssuntoFilter'];
  const controls=ids.map(id=>document.getElementById(id)).filter(Boolean);
  const search=document.getElementById('pdfLibrarySearch'); if(search)controls.push(search);
  const parent=controls.find(Boolean)?.parentElement;
  if(parent){parent.classList.add('pdf-library-filter-row-v1024'); controls.forEach(el=>el.classList.add('pdf-library-filter-control-v1024'));}
}
function scrollLibraryStartV1024(){
  const tab=document.getElementById('tab-biblioteca'); if(!tab)return;
  const target=tab.querySelector('h2,h3,.section-title,.pdf-library-header')||tab;
  const header=document.querySelector('.modern-header');
  const top=Math.max(0,target.getBoundingClientRect().top+window.scrollY-(header?.offsetHeight||0)-12);
  window.scrollTo({top,behavior:'auto'});
}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const oc=b.getAttribute('onclick')||'';if(oc.includes("switchTab('tab-biblioteca'"))requestAnimationFrame(()=>requestAnimationFrame(()=>{tuneLibraryUiV1024();scrollLibraryStartV1024()}));});
window.addEventListener('resize',tuneLibraryUiV1024,{passive:true});
setTimeout(tuneLibraryUiV1024,0);
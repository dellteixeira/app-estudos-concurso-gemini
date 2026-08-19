(function(global){
'use strict';
let state={docs:[],workspaces:[],scope:'contest',activeWorkspace:'',activeMateria:'',activeAssunto:'',search:'',initializedFor:''};
let selectedFile=null,linkPdfId=null,workspaceReturnContext='library',pendingOpenDocumentId=null;
const $=id=>document.getElementById(id);
const esc=v=>typeof global.escapeHtml==='function'?global.escapeHtml(v):String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function contest(){try{return global.getLastStudiedConcurso?.()||'Concurso Geral'}catch(_){return'Concurso Geral'}}
function materias(){try{return global.getUniqueMateriasFromEdital?.()||[]}catch(_){return[]}}
function assuntos(m){try{return global.getAssuntosForMateria?.(m)||[]}catch(_){return[]}}
function bytes(n){n=Number(n||0);return n<1048576?`${Math.max(1,Math.round(n/1024))} KB`:`${(n/1048576).toFixed(n>=10485760?0:1)} MB`}
function status(m,k=''){const e=$('pdfLibraryStatus');if(e){e.textContent=m||'';e.dataset.kind=k}}

async function ensureWorkspace(){
  let all=await global.PdfStudyWorkspaces.list();
  if(!all.length){
    all=[await global.PdfStudyWorkspaces.create({name:'Biblioteca Geral',description:'Workspace global padrão para materiais de estudo.',isDefault:true})];
  }
  state.workspaces=all;
  renderWs();
  return all;
}

function renderWs(preferredId=''){
  for(const id of ['pdfWorkspaceFilter','pdfUploadWorkspace','pdfLinkWorkspace']){
    const e=$(id);if(!e)continue;
    const previous=preferredId||e.value||'';
    const prefix=id==='pdfWorkspaceFilter'?'<option value="">Todos os Workspaces</option>':'';
    e.innerHTML=prefix+state.workspaces.map(w=>`<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('');
    if(id==='pdfWorkspaceFilter') e.value=state.activeWorkspace||'';
    else if(previous&&state.workspaces.some(w=>String(w.id)===String(previous))) e.value=previous;
    else {
      const def=state.workspaces.find(w=>w.is_default)||state.workspaces[0];
      if(def)e.value=def.id;
    }
  }
}

function renderMat(){
  const opts=materias().map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
  for(const id of ['pdfMateriaFilter','pdfUploadMateria','pdfLinkMateria']){
    const e=$(id);if(e)e.innerHTML=`<option value="">${id==='pdfMateriaFilter'?'Todas as matérias':'Selecione a matéria'}</option>`+opts;
  }
  renderAss('filter');renderAss('upload');renderAss('link');
}

function renderAss(mode){
  const mid=mode==='filter'?'pdfMateriaFilter':mode==='upload'?'pdfUploadMateria':'pdfLinkMateria';
  const tid=mode==='filter'?'pdfAssuntoFilter':mode==='upload'?'pdfUploadAssunto':'pdfLinkAssunto';
  const e=$(tid);if(!e)return;
  const arr=assuntos($(mid)?.value||'');
  e.innerHTML=`<option value="">${mode==='filter'?'Todos os assuntos':'Selecione o assunto'}</option>`+arr.map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('');
}

async function load(){
  status('Carregando biblioteca…');
  state.docs=await global.PdfStudyLibrary.list({scope:state.scope,concurso:contest(),workspaceId:state.activeWorkspace,materia:state.activeMateria,assunto:state.activeAssunto,search:state.search});
  render();
  status(`${state.docs.length} ${state.docs.length===1?'PDF encontrado':'PDFs encontrados'}.`,'ok');
}

function ws(id){return state.workspaces.find(w=>w.id===id)?.name||'Sem Workspace'}
function render(){
  const c=$('pdfLibraryGrid');if(!c)return;
  if(!state.docs.length){
    c.innerHTML='<div class="pdf-empty-state"><div class="pdf-empty-icon">📚</div><h4>Nenhum PDF nesta seleção</h4><p>Adicione um PDF à Biblioteca Global ou altere o filtro.</p><button class="btn btn-primary" onclick="PdfStudyLibraryUI.openUploadModal()">+ Adicionar PDF</button></div>';return;
  }
  c.innerHTML=state.docs.map(d=>{
    const p=Number(d.progress?.progress_percentage||0),pg=Number(d.progress?.current_page||1),l=d.activeLink;
    const context=l?`${esc(l.materia)} · ${esc(l.assunto)}`:`${d.links.length} vínculo${d.links.length===1?'':'s'} de estudo`;
    const wa=l?ws(l.workspace_id):'Biblioteca Global';
    const secondary=state.scope==='contest'&&l?`<button class="btn btn-secondary btn-sm" onclick="PdfStudyLibraryUI.unlinkDocument('${esc(d.id)}')">Desvincular</button>`:`<button class="btn btn-secondary btn-sm" onclick="PdfStudyLibraryUI.openLinkModal('${esc(d.id)}')">Vincular</button>`;
    const del=state.scope==='global'?`<button class="btn btn-danger btn-sm" onclick="PdfStudyLibraryUI.deleteDocument('${esc(d.id)}')">Excluir da Biblioteca</button>`:'';
    return `<article class="pdf-library-card"><div class="pdf-card-top"><span class="pdf-file-badge">PDF</span><button class="pdf-favorite-btn ${d.is_favorite?'active':''}" onclick="PdfStudyLibraryUI.toggleFavorite('${esc(d.id)}')">★</button></div><h4>${esc(d.title)}</h4><p class="pdf-card-context">${context}</p><p class="pdf-card-workspace">${esc(wa)}</p><div class="pdf-progress-line"><span style="width:${Math.min(100,Math.max(0,p))}%"></span></div><div class="pdf-card-meta"><span>${p.toFixed(0)}% lido · pág. ${pg}</span><span>${bytes(d.file_size)}</span></div><div class="pdf-card-actions"><button class="btn btn-primary btn-sm" onclick="PdfStudyLibraryUI.openDocument('${esc(d.id)}')">Visualizar PDF</button>${secondary}${del}</div></article>`;
  }).join('');
}

async function initialize(force=false){
  if(!global.PdfStudyLinks)return;
  const cc=contest();
  if(!force&&state.initializedFor===cc){await load();return}
  state={...state,docs:[],activeWorkspace:'',activeMateria:'',activeAssunto:'',search:'',initializedFor:cc};
  $('pdfLibraryContestName').textContent=cc;
  try{await global.PdfStudyLinks.processPendingContestOperations();await ensureWorkspace();renderMat();await load()}catch(e){handle(e)}
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
  try{
    if(btn)btn.disabled=true;
    const created=await global.PdfStudyWorkspaces.create({name:$('pdfWorkspaceName').value,description:$('pdfWorkspaceDescription').value});
    $('modalPdfWorkspace').style.display='none';
    await ensureWorkspace();renderWs(created.id);
    if(workspaceReturnContext==='upload'){$('pdfUploadWorkspace').value=created.id;$('modalPdfUpload').style.display='flex'}
    if(workspaceReturnContext==='link'){$('pdfLinkWorkspace').value=created.id;$('modalPdfLink').style.display='flex'}
    workspaceReturnContext='library';
    await load();
    status(`Workspace “${created.name}” criado.`,'ok');
  }catch(e){handle(e)}finally{if(btn)btn.disabled=false}
}

async function openUploadModal(){
  if(!materias().length)return alert('O concurso atual ainda não possui matérias no edital. Cadastre o edital para criar o primeiro vínculo do PDF.');
  try{
    await ensureWorkspace();
    selectedFile=null;
    $('pdfUploadFile').value='';$('pdfUploadTitle').value='';
    const fileName=$('pdfUploadFileName');fileName.textContent='Nenhum arquivo selecionado';fileName.dataset.selected='false';
    $('pdfUploadProgress').style.width='0%';$('pdfUploadProgressText').textContent='';
    renderWs();renderMat();
    $('modalPdfUpload').style.display='flex';
  }catch(e){handle(e)}
}
function closeUploadModal(){$('modalPdfUpload').style.display='none';selectedFile=null;$('pdfDropZone')?.classList.remove('drag-over')}
function chooseUploadFile(){$('pdfUploadFile')?.click()}
function onDropZoneKeydown(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseUploadFile()}}
function setFile(f){
  const v=global.PdfStudyCore.validatePdfFile(f);if(!v.ok){alert(v.error);return}
  selectedFile=f;
  const el=$('pdfUploadFileName');el.textContent=`✓ ${f.name} · ${bytes(f.size)}`;el.dataset.selected='true';
  if(!$('pdfUploadTitle').value.trim())$('pdfUploadTitle').value=f.name.replace(/\.pdf$/i,'');
}
function onUploadFileChange(i){setFile(i?.files?.[0])}
function onUploadMateriaChange(){renderAss('upload')}
async function submitUpload(){
  if(!selectedFile)return alert('Selecione um arquivo PDF antes de continuar.');
  const workspaceId=$('pdfUploadWorkspace').value;
  const materia=$('pdfUploadMateria').value;
  const assunto=$('pdfUploadAssunto').value;
  if(!workspaceId)return alert('Selecione um Workspace.');
  if(!materia)return alert('Selecione a matéria do edital.');
  if(!assunto)return alert('Selecione o assunto do edital.');
  const btn=$('btnSubmitPdfUpload');
  try{
    if(btn)btn.disabled=true;
    await global.PdfStudyUpload.upload({file:selectedFile,title:$('pdfUploadTitle').value,workspaceId,concurso:contest(),materia,assunto,onProgress:i=>{
      $('pdfUploadProgress').style.width=`${i.percent||0}%`;
      const labels={uploading:'Enviando PDF…',registering:'Registrando documento…',linking:'Criando vínculo de estudo…',done:'Concluído.'};
      $('pdfUploadProgressText').textContent=labels[i.stage]||'Processando…';
    }});
    closeUploadModal();await load();status('PDF salvo na Biblioteca Global e vinculado ao concurso atual.','ok');
  }catch(e){handle(e)}finally{if(btn)btn.disabled=false}
}

function openLinkModal(id){if(!materias().length)return alert('O concurso atual não possui matérias no edital.');linkPdfId=id;const d=state.docs.find(x=>x.id===id);$('pdfLinkDocumentTitle').textContent=d?.title||'';renderWs();renderMat();$('modalPdfLink').style.display='flex'}
function closeLinkModal(){$('modalPdfLink').style.display='none';linkPdfId=null}
function onLinkMateriaChange(){renderAss('link')}
async function submitLink(){try{await global.PdfStudyLinks.create({pdfId:linkPdfId,workspaceId:$('pdfLinkWorkspace').value,concurso:contest(),materia:$('pdfLinkMateria').value,assunto:$('pdfLinkAssunto').value});closeLinkModal();await load();status('Novo vínculo criado sem duplicar o PDF.','ok')}catch(e){handle(e)}}
async function unlinkDocument(id){if(!confirm('Remover este PDF apenas do concurso atual? O arquivo continuará na Biblioteca Global.'))return;try{await global.PdfStudyLinks.removeForPdfInConcurso(id,contest());await load();status('Vínculo removido. O PDF foi preservado na Biblioteca Global.','ok')}catch(e){handle(e)}}
async function toggleFavorite(id){const d=state.docs.find(x=>x.id===id);try{await global.PdfStudyLibrary.setFavorite(id,!d?.is_favorite);await load()}catch(e){handle(e)}}
async function deleteDocument(id){const d=state.docs.find(x=>x.id===id);if(!d||!confirm(`Excluir “${d.title}” da Biblioteca Global? Isso remove o arquivo e todos os vínculos.`))return;try{await global.PdfStudyLibrary.remove(d);await load()}catch(e){handle(e)}}
function openDocument(id){pendingOpenDocumentId=id;const title=$('pdfViewerNoticeTitle');if(title){const d=state.docs.find(x=>x.id===id);title.textContent=d?.title||'';}$('modalPdfViewerNotice').style.display='flex'}
function closeViewerNoticeModal(){$('modalPdfViewerNotice').style.display='none';pendingOpenDocumentId=null}
async function confirmOpenTemporaryView(){const btn=$('btnOpenPdfSignedUrl');try{if(btn)btn.disabled=true;const d=state.docs.find(x=>x.id===pendingOpenDocumentId);global.open(await global.PdfStudyLibrary.createSignedUrl(d,900),'_blank','noopener,noreferrer');closeViewerNoticeModal()}catch(e){handle(e)}finally{if(btn)btn.disabled=false}}
function handleDrop(e){e.preventDefault();$('pdfDropZone')?.classList.remove('drag-over');setFile(e.dataTransfer?.files?.[0])}
function handleDragOver(e){e.preventDefault();$('pdfDropZone')?.classList.add('drag-over')}
function handleDragLeave(){$('pdfDropZone')?.classList.remove('drag-over')}
function handle(e){console.error('[PDF Library]',e);status(e?.message||'Erro.','error');alert(e?.message||'Erro.')}

global.PdfStudyLibraryUI=Object.freeze({initialize,onTabActivated:()=>initialize(false),onScopeChange,onWorkspaceFilterChange,onMateriaFilterChange,onAssuntoFilterChange,onSearch,openWorkspaceModal,closeWorkspaceModal,createWorkspace,openUploadModal,closeUploadModal,chooseUploadFile,onDropZoneKeydown,onUploadFileChange,onUploadMateriaChange,submitUpload,openLinkModal,closeLinkModal,onLinkMateriaChange,submitLink,unlinkDocument,toggleFavorite,deleteDocument,openDocument,closeViewerNoticeModal,confirmOpenTemporaryView,handleDrop,handleDragOver,handleDragLeave});
})(window);

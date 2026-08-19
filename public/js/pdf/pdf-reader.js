(function(global){
'use strict';
const $=id=>document.getElementById(id);const core=()=>global.PdfStudyCore;const ann=()=>global.PdfStudyAnnotations;
let state={doc:null,pdf:null,page:1,total:0,scale:1.25,annotations:[],bookmarks:[],selected:null,openedAt:0,renderToken:0,importedNotes:[]};
let wheelLock=false;
function currentContest(){return document.getElementById('concursoSelect')?.value||global.getLastStudiedConcurso?.()||'Concurso Geral'}
function currentLink(){const links=state.doc?.links||[];return state.doc?.activeLink||links.find(l=>l.concurso===currentContest())||links[0]||null}
function setStatus(t){const e=$('pdfReaderStatus');if(e)e.textContent=t||''}
function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function clearSelection(){state.selected=null;const bar=$('pdfReaderSelectionBar');if(bar)bar.classList.remove('show');const txt=$('pdfReaderSelectionText');if(txt)txt.textContent='';try{window.getSelection()?.removeAllRanges()}catch(_){}}
function clamp(n,min,max){return Math.min(max,Math.max(min,n))}
function normalizeRects(clientRects,box){
  const out=[];
  for(const rect of [...clientRects]){
    if(!rect||rect.width<2||rect.height<4)continue;
    const left=clamp(rect.left-box.left,0,box.width), top=clamp(rect.top-box.top,0,box.height), right=clamp(rect.right-box.left,0,box.width), bottom=clamp(rect.bottom-box.top,0,box.height);
    const width=right-left, height=bottom-top;
    if(width<2||height<4)continue;
    out.push({x:left/box.width,y:top/box.height,w:width/box.width,h:height/box.height});
  }
  out.sort((a,b)=>a.y-b.y||a.x-b.x);
  const merged=[];
  for(const r of out){
    const last=merged[merged.length-1];
    if(last && Math.abs(last.y-r.y)<0.012 && Math.abs(last.h-r.h)<0.03 && r.x <= (last.x+last.w+0.012)){
      const right=Math.max(last.x+last.w,r.x+r.w), bottom=Math.max(last.y+last.h,r.y+r.h);
      last.x=Math.min(last.x,r.x); last.y=Math.min(last.y,r.y); last.w=right-last.x; last.h=bottom-last.y;
    }else merged.push({...r});
  }
  return merged.map(r=>({x:Number(r.x.toFixed(6)),y:Number(r.y.toFixed(6)),w:Number(r.w.toFixed(6)),h:Number(r.h.toFixed(6))}));
}
function getSelectedGeometry(){
  const sel=window.getSelection();
  if(!sel||sel.isCollapsed||!sel.rangeCount)return null;
  const text=sel.toString().replace(/\s+/g,' ').trim();
  if(!text)return null;
  const range=sel.getRangeAt(0);
  const node=range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;
  const pageEl=node?.closest?.('.pdf-reader-page');
  const textLayer=node?.closest?.('.pdf-reader-text-layer')||pageEl?.querySelector?.('.pdf-reader-text-layer');
  if(!pageEl||!textLayer)return null;
  const box=textLayer.getBoundingClientRect();
  const rects=normalizeRects(range.getClientRects(),box);
  if(!rects.length)return null;
  return {page:Number(pageEl.dataset.page),text:text.slice(0,20000),rects};
}
function updateSelection(){
  const g=getSelectedGeometry();
  if(!g){clearSelection();return}
  state.selected=g;
  const bar=$('pdfReaderSelectionBar');
  if(bar){$('pdfReaderSelectionText').textContent=g.text.length>90?g.text.slice(0,90)+'…':g.text;bar.classList.add('show')}
}
function inferQuestionFromSelection(text=''){
  const clean=String(text||'').replace(/\s+/g,' ').trim();
  if(!clean)return 'Qual é a ideia central deste trecho?';
  const lower=clean.toLocaleLowerCase('pt-BR');
  if(/significa|conceito|conceitua|define|é a|consagra|denomina/.test(lower)) return 'Qual conceito ou definição este trecho apresenta?';
  if(/requisito|requisitos|elemento|elementos|pressuposto|pressupostos/.test(lower)) return 'Quais são os requisitos ou elementos mencionados neste trecho?';
  if(/diferença|distingue|distinção|contravenção|crime/.test(lower)) return 'Qual distinção importante este trecho estabelece?';
  if(/pena|detenção|reclusão|multa/.test(lower)) return 'Qual consequência jurídica ou pena este trecho descreve?';
  const firstSentence=(clean.split(/[.!?;]\s/)[0]||clean).trim();
  const short=firstSentence.length>110?firstSentence.slice(0,107)+'…':firstSentence;
  return `O que o trecho “${short}” procura explicar?`;
}
async function saveAnnotation(type,noteText=''){
  if(!state.selected)return alert('Selecione um trecho do PDF primeiro.');
  try{
    const color=type==='underline'?'#38bdf8':type==='note'?'#c084fc':'#fde047';
    const a=await ann().create({pdfId:state.doc.id,pageNumber:state.selected.page,type,selectedText:state.selected.text,noteText,color,rects:state.selected.rects});
    state.annotations.push(a);clearSelection();await renderAnnotations();renderSideList();setStatus('Marcação salva on-line.');
  }catch(e){handle(e)}
}
function promptNote(){
  if(!state.selected)return alert('Selecione um trecho do PDF primeiro.');
  const note=prompt('Anotação para o trecho selecionado:',state.selected.text.length>120?state.selected.text.slice(0,120)+'…':'');
  if(note!==null)saveAnnotation('note',note)
}
// Pergunta sugerida automaticamente para o flashcard a partir do trecho selecionado.
function openFlashcardComposer(){
  if(!state.selected)return alert('Selecione um trecho do PDF primeiro.');
  const link=currentLink();
  if(!link)return alert('Vincule o PDF a um concurso/matéria antes de criar flashcard.');
  const modal=$('modalPdfFlashcard');
  if(!modal)return createFlashcard();
  $('pdfFlashcardQuestion').value=inferQuestionFromSelection(state.selected.text);
  $('pdfFlashcardAnswer').value=state.selected.text;
  $('pdfFlashcardContext').textContent=`${link.materia||'Sem matéria'} · ${link.assunto||'Sem assunto'} · pág. ${state.selected.page}`;
  modal.style.display='flex';
  setTimeout(()=>$('pdfFlashcardQuestion')?.focus(),0);
}
function closeFlashcardComposer(){const modal=$('modalPdfFlashcard');if(modal)modal.style.display='none'}
async function createFlashcard(){
  if(!state.selected)return alert('Selecione um trecho do PDF primeiro.');
  const link=currentLink();
  if(!link)return alert('Vincule o PDF a um concurso/matéria antes de criar flashcard.');
  const pergunta=($('pdfFlashcardQuestion')?.value||inferQuestionFromSelection(state.selected.text)).trim();
  const resposta=($('pdfFlashcardAnswer')?.value||state.selected.text).trim();
  if(!pergunta||!resposta)return alert('Pergunta e resposta são obrigatórias.');
  try{
    if(typeof global.addPdfStudyFlashcard!=='function')throw new Error('Integração com flashcards indisponível.');
    await global.addPdfStudyFlashcard({materia:link.materia,assunto:link.assunto,pergunta,resposta,sourcePdfId:state.doc.id,sourcePage:state.selected.page});
    closeFlashcardComposer();clearSelection();setStatus('Flashcard criado com pergunta sugerida automaticamente.');
  }catch(e){handle(e)}
}
async function exportToNotes(){
  const link=currentLink();
  if(!link)return alert('Vincule este PDF ao concurso atual antes de exportar para Anotações.');
  if(!state.annotations.length)return alert('Ainda não existem marcações para exportar.');
  const blocks=state.annotations.map(a=>`Página ${a.page_number}\n${a.annotation_type==='highlight'?'GRIFO':a.annotation_type==='underline'?'SUBLINHADO':'NOTA'}: ${a.selected_text||''}${a.note_text?`\nMinha anotação: ${a.note_text}`:''}`).join('\n\n');
  try{
    if(typeof global.addPdfStudyNote!=='function')throw new Error('Integração com Anotações indisponível.');
    await global.addPdfStudyNote({materia:link.materia,assunto:link.assunto,titulo:`Anotações — ${state.doc.title}`,conteudoTexto:`PDF: ${state.doc.title}\n\n${blocks}`});
    setStatus('Marcações exportadas para Anotações.');
  }catch(e){handle(e)}
}
async function importNotes(){
  const link=currentLink();
  if(!link)return alert('Vincule este PDF ao concurso atual antes de importar anotações.');
  try{
    const user=await core().getAuthenticatedUser();
    const key=`concursos_metadata_${user.id}`;
    const metadata=JSON.parse(localStorage.getItem(key)||'{}');
    const notes=Array.isArray(metadata?.[currentContest()]?.structuredNotes)?metadata[currentContest()].structuredNotes:[];
    const filtered=notes.filter(n=>String(n?.materia||'')===String(link.materia||'') && (!link.assunto || !String(n?.assunto||'') || String(n.assunto)===String(link.assunto)));
    state.importedNotes=filtered.slice(-12).reverse().map((n,idx)=>({
      id:`imported-${idx}-${Date.parse(n?.data||'')||idx}`,
      titulo:String(n?.titulo||'Anotação').trim()||'Anotação',
      conteudo:String(n?.conteudoTexto||n?.conteudo||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(),
      materia:n?.materia||'', assunto:n?.assunto||'', data:n?.data||''
    }));
    renderSideList();
    setStatus(state.importedNotes.length?`${state.importedNotes.length} anotação(ões) importada(s) para consulta rápida.`:'Nenhuma anotação do app encontrada para esta matéria/assunto.');
  }catch(e){handle(e)}
}
function bindReaderInteractions(){
  const wrap=$('pdfReaderCanvasWrap');
  if(!wrap||wrap.dataset.bound==='1')return;
  wrap.dataset.bound='1';
  wrap.addEventListener('scroll',()=>clearSelection(),{passive:true});
  wrap.addEventListener('wheel',async(e)=>{
    if(!state.pdf||wheelLock||e.ctrlKey)return;
    const atTop=wrap.scrollTop<=2;
    const atBottom=Math.ceil(wrap.scrollTop+wrap.clientHeight)>=wrap.scrollHeight-2;
    if(e.deltaY>22 && atBottom && state.page<state.total){
      e.preventDefault(); wheelLock=true; try{await next();wrap.scrollTop=0}finally{setTimeout(()=>wheelLock=false,180)}
    } else if(e.deltaY<-22 && atTop && state.page>1){
      e.preventDefault(); wheelLock=true; try{await prev();wrap.scrollTop=Math.max(0,wrap.scrollHeight)}finally{setTimeout(()=>wheelLock=false,180)}
    }
  },{passive:false});
  document.addEventListener('selectionchange',()=>{if(document.body.classList.contains('pdf-reader-open'))setTimeout(updateSelection,0)});
  document.addEventListener('keydown',onKeyDown);
}
function unbindReaderInteractions(){document.removeEventListener('keydown',onKeyDown)}
async function onKeyDown(e){
  if(!document.body.classList.contains('pdf-reader-open'))return;
  const tag=(document.activeElement?.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea')return;
  const wrap=$('pdfReaderCanvasWrap');
  if(!wrap)return;
  if(e.key==='ArrowLeft'){e.preventDefault();await prev();return}
  if(e.key==='ArrowRight'){e.preventDefault();await next();return}
  if(e.key==='ArrowUp'){e.preventDefault();if(wrap.scrollTop<=4&&state.page>1){await prev();wrap.scrollTop=Math.max(0,wrap.scrollHeight)}else wrap.scrollBy({top:-120,behavior:'smooth'});clearSelection();return}
  if(e.key==='ArrowDown'){e.preventDefault();const atBottom=Math.ceil(wrap.scrollTop+wrap.clientHeight)>=wrap.scrollHeight-4;if(atBottom&&state.page<state.total){await next();wrap.scrollTop=0}else wrap.scrollBy({top:120,behavior:'smooth'});clearSelection();return}
  if(e.key==='Escape'){if($('modalPdfFlashcard')?.style.display==='flex'){closeFlashcardComposer();return}clearSelection();}
}
async function open(doc){
  if(!doc?.id)return;
  try{
    if(!global.pdfjsLib)throw new Error('PDF.js não carregado.');
    pdfjsLib.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.min.js';
    state={doc,pdf:null,page:Number(doc.progress?.current_page||1),total:0,scale:window.innerWidth<700?1:1.25,annotations:[],bookmarks:[],selected:null,openedAt:Date.now(),renderToken:0,importedNotes:[]};
    $('pdfReaderOverlay').classList.add('open');document.body.classList.add('pdf-reader-open');$('pdfReaderTitle').textContent=doc.title||doc.original_file_name||'PDF';$('pdfReaderZoomLabel').textContent=Math.round(state.scale*100)+'%';setStatus('Carregando PDF…');bindReaderInteractions();
    const blob=await global.PdfStudyLibrary.downloadBlob(doc);const data=new Uint8Array(await blob.arrayBuffer());
    state.pdf=await pdfjsLib.getDocument({data}).promise;state.total=state.pdf.numPages;state.page=Math.min(Math.max(1,state.page),state.total);$('pdfReaderTotalPages').textContent=String(state.total);$('pdfReaderPageInput').max=String(state.total);
    const [annotations,bookmarks]=await Promise.all([ann().list(doc.id),ann().bookmarks(doc.id)]);state.annotations=annotations;state.bookmarks=bookmarks;
    await global.PdfStudyLibrary.updatePageCount?.(doc.id,state.total);renderSideList();await renderPage();setStatus('Selecione um trecho para grifar, sublinhar, anotar ou criar flashcard.');
  }catch(e){handle(e);close()}
}
async function close(){
  if(state.doc){await saveProgress(true).catch(()=>{})}
  $('pdfReaderOverlay')?.classList.remove('open');document.body.classList.remove('pdf-reader-open');clearSelection();closeFlashcardComposer();unbindReaderInteractions();
  state={doc:null,pdf:null,page:1,total:0,scale:1.25,annotations:[],bookmarks:[],selected:null,openedAt:0,renderToken:0,importedNotes:[]};global.PdfStudyLibraryUI?.refresh?.()
}
async function renderPage(){
  if(!state.pdf)return;
  clearSelection();
  const token=++state.renderToken;const page=await state.pdf.getPage(state.page);if(token!==state.renderToken)return;
  const viewport=page.getViewport({scale:state.scale});const host=$('pdfReaderPageHost');host.innerHTML='';
  const pageEl=document.createElement('div');pageEl.className='pdf-reader-page';pageEl.dataset.page=state.page;pageEl.style.width=viewport.width+'px';pageEl.style.height=viewport.height+'px';
  const canvas=document.createElement('canvas');canvas.width=Math.floor(viewport.width*devicePixelRatio);canvas.height=Math.floor(viewport.height*devicePixelRatio);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
  const ctx=canvas.getContext('2d');const textLayer=document.createElement('div');textLayer.className='pdf-reader-text-layer';const markLayer=document.createElement('div');markLayer.className='pdf-reader-mark-layer';pageEl.append(canvas,textLayer,markLayer);host.appendChild(pageEl);
  await page.render({canvasContext:ctx,viewport,transform:devicePixelRatio!==1?[devicePixelRatio,0,0,devicePixelRatio,0,0]:null}).promise;
  const text=await page.getTextContent();await pdfjsLib.renderTextLayer({textContentSource:text,container:textLayer,viewport,textDivs:[]}).promise;
  pageEl.addEventListener('mouseup',()=>setTimeout(updateSelection,0));pageEl.addEventListener('touchend',()=>setTimeout(updateSelection,60));pageEl.addEventListener('mousedown',()=>clearSelection());
  $('pdfReaderPageInput').value=String(state.page);updateBookmarkButton();await renderAnnotations();renderSideList();saveProgress(false).catch(()=>{})
}
async function renderAnnotations(){
  const layer=$('pdfReaderPageHost')?.querySelector('.pdf-reader-mark-layer');if(!layer)return;layer.innerHTML='';
  for(const a of state.annotations.filter(x=>Number(x.page_number)===state.page)){
    for(const r of Array.isArray(a.rects)?a.rects:[]){
      const el=document.createElement('button');el.type='button';el.className=`pdf-reader-mark ${a.annotation_type}`;el.style.left=(r.x*100)+'%';el.style.top=(r.y*100)+'%';el.style.width=(r.w*100)+'%';el.style.height=(r.h*100)+'%';el.style.setProperty('--mark-color',a.color||'#fde047');el.title=a.note_text||a.selected_text||'Marcação';el.onclick=e=>{e.stopPropagation();openAnnotation(a.id)};layer.appendChild(el)
    }
  }
}
function renderSideList(){
  const box=$('pdfReaderAnnotationsList');if(!box)return;
  const items=[...state.annotations].sort((a,b)=>a.page_number-b.page_number||new Date(a.created_at)-new Date(b.created_at));
  const imported=state.importedNotes||[];
  if(!items.length&&!imported.length){box.innerHTML='<p class="pdf-reader-empty-side">Selecione um trecho para criar sua primeira marcação.</p>';return}
  box.innerHTML=`${imported.length?`<section class="pdf-reader-side-section"><h4>Anotações importadas</h4>${imported.map(n=>`<article class="pdf-reader-side-item imported"><div class="pdf-reader-side-main"><span>${esc(n.data||'Anotação')}</span><strong>${esc(n.titulo)}</strong><em>${esc(n.conteudo)}</em></div></article>`).join('')}</section>`:''}${items.length?`<section class="pdf-reader-side-section"><h4>Marcações do PDF</h4>${items.map(a=>`<article class="pdf-reader-side-item" data-id="${a.id}"><button type="button" class="pdf-reader-side-main" onclick="PdfStudyReader.goToAnnotation('${a.id}')"><span>Pág. ${a.page_number} · ${a.annotation_type==='highlight'?'Grifo':a.annotation_type==='underline'?'Sublinhado':'Nota'}</span><strong>${esc(a.selected_text||a.note_text||'')}</strong>${a.note_text?`<em>${esc(a.note_text)}</em>`:''}</button><button class="pdf-reader-delete-mark" onclick="PdfStudyReader.deleteAnnotation('${a.id}')" title="Excluir">×</button></article>`).join('')}</section>`:''}`
}
async function openAnnotation(id){const a=state.annotations.find(x=>x.id===id);if(!a)return;if(a.annotation_type==='note'){const n=prompt('Editar anotação:',a.note_text||'');if(n!==null){const updated=await ann().update(id,{note_text:n});state.annotations=state.annotations.map(x=>x.id===id?updated:x);await renderAnnotations();renderSideList()}}else{if(confirm(`${a.selected_text||'Marcação'}\n\nExcluir esta marcação?`))await deleteAnnotation(id)}}
async function deleteAnnotation(id){try{await ann().remove(id);state.annotations=state.annotations.filter(x=>x.id!==id);await renderAnnotations();renderSideList();setStatus('Marcação excluída.')}catch(e){handle(e)}}
async function goToAnnotation(id){const a=state.annotations.find(x=>x.id===id);if(!a)return;state.page=Number(a.page_number);await renderPage();$('pdfReaderCanvasWrap')?.scrollTo({top:0,behavior:'smooth'})}
async function prev(){if(state.page>1){state.page--;await renderPage();$('pdfReaderCanvasWrap')?.scrollTo({top:0,behavior:'auto'})}}
async function next(){if(state.page<state.total){state.page++;await renderPage();$('pdfReaderCanvasWrap')?.scrollTo({top:0,behavior:'auto'})}}
async function goto(v){const n=Math.min(state.total,Math.max(1,Number(v)||1));if(n!==state.page){state.page=n;await renderPage();$('pdfReaderCanvasWrap')?.scrollTo({top:0,behavior:'auto'})}}
function scrollReader(delta){const wrap=$('pdfReaderCanvasWrap');if(wrap){wrap.scrollBy({top:delta,behavior:'smooth'});clearSelection()}}
async function moveVertical(direction){const wrap=$('pdfReaderCanvasWrap');if(!wrap)return;const atTop=wrap.scrollTop<=4;const atBottom=Math.ceil(wrap.scrollTop+wrap.clientHeight)>=wrap.scrollHeight-4;if(direction<0&&atTop&&state.page>1){await prev();wrap.scrollTop=Math.max(0,wrap.scrollHeight)}else if(direction>0&&atBottom&&state.page<state.total){await next();wrap.scrollTop=0}else{scrollReader(direction*140)}}
async function zoom(delta){state.scale=Math.min(2.5,Math.max(.65,state.scale+delta));$('pdfReaderZoomLabel').textContent=Math.round(state.scale*100)+'%';await renderPage()}
async function fitWidth(){const page=await state.pdf.getPage(state.page);const base=page.getViewport({scale:1});const available=Math.max(280,$('pdfReaderCanvasWrap').clientWidth-40);state.scale=Math.min(2.2,available/base.width);$('pdfReaderZoomLabel').textContent=Math.round(state.scale*100)+'%';await renderPage()}
async function toggleBookmark(){try{const active=await ann().toggleBookmark(state.doc.id,state.page);state.bookmarks=await ann().bookmarks(state.doc.id);updateBookmarkButton();setStatus(active?'Página marcada.':'Marcador removido.')}catch(e){handle(e)}}
function updateBookmarkButton(){const b=$('pdfReaderBookmark');if(b)b.classList.toggle('active',state.bookmarks.some(x=>Number(x.page_number)===state.page))}
async function saveProgress(closing){if(!state.doc||!state.total)return;const c=core().getSupabaseClient(),u=await core().getAuthenticatedUser();const elapsed=closing&&state.openedAt?Math.max(0,Math.round((Date.now()-state.openedAt)/1000)):0;const {error}=await c.from('pdf_progress').upsert({user_id:u.id,pdf_id:state.doc.id,current_page:state.page,progress_percentage:Math.round((state.page/state.total)*10000)/100,reading_seconds:Number(state.doc.progress?.reading_seconds||0)+elapsed,last_opened_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'user_id,pdf_id'});if(error)throw error}
function toggleSide(){document.getElementById('pdfReaderOverlay')?.classList.toggle('side-collapsed')}
function handle(e){console.error('[PDF Reader]',e);setStatus(e?.message||'Erro no Reader.');alert(e?.message||'Erro no Reader.')}
global.PdfStudyReader=Object.freeze({open,close,prev,next,goto,zoom,fitWidth,toggleBookmark,saveAnnotation,promptNote,createFlashcard,openFlashcardComposer,closeFlashcardComposer,exportToNotes,importNotes,deleteAnnotation,goToAnnotation,toggleSide,moveVertical,scrollReader});
})(window);

(function(global){
'use strict';
const $=id=>document.getElementById(id);const core=()=>global.PdfStudyCore;const ann=()=>global.PdfStudyAnnotations;
let state={doc:null,pdf:null,page:1,total:0,scale:1.25,annotations:[],bookmarks:[],selected:null,openedAt:0,renderToken:0,importedNotes:[],fitMode:'custom',selectionLocked:false};
let flashcardDraft=null;
let wheelLock=false,pinchState=null,selectionClearTimer=null,resizeTimer=null;
function currentContest(){return document.getElementById('concursoSelect')?.value||global.getLastStudiedConcurso?.()||'Concurso Geral'}
function currentLink(){const links=state.doc?.links||[];return state.doc?.activeLink||links.find(l=>l.concurso===currentContest())||null}
function setStatus(t){const e=$('pdfReaderStatus');if(e)e.textContent=t||''}
function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function clearSelection({preserveNative=false}={}){
  clearTimeout(selectionClearTimer);selectionClearTimer=null;state.selected=null;state.selectionLocked=false;
  const bar=$('pdfReaderSelectionBar');if(bar)bar.classList.remove('show');const txt=$('pdfReaderSelectionText');if(txt)txt.textContent='';
  if(!preserveNative){try{window.getSelection()?.removeAllRanges()}catch(_){}}
}
function scheduleSelectionClear(delay=480){
  clearTimeout(selectionClearTimer);
  selectionClearTimer=setTimeout(()=>{if(!state.selectionLocked)clearSelection({preserveNative:true})},delay);
}
function clamp(n,min,max){return Math.min(max,Math.max(min,n))}
function normalizeRects(clientRects,box){
  const raw=[];
  for(const rect of [...clientRects]){
    if(!rect||rect.width<1.5||rect.height<3)continue;
    const left=clamp(rect.left-box.left,0,box.width),top=clamp(rect.top-box.top,0,box.height),right=clamp(rect.right-box.left,0,box.width),bottom=clamp(rect.bottom-box.top,0,box.height);
    const width=right-left,height=bottom-top;if(width<1.5||height<3)continue;
    raw.push({x:left/box.width,y:top/box.height,w:width/box.width,h:height/box.height});
  }
  raw.sort((a,b)=>a.y-b.y||a.x-b.x);
  const dedup=[];
  for(const r of raw){
    const duplicate=dedup.some(x=>Math.abs(x.x-r.x)<.002&&Math.abs(x.y-r.y)<.002&&Math.abs(x.w-r.w)<.002&&Math.abs(x.h-r.h)<.002);
    if(!duplicate)dedup.push({...r});
  }
  const lines=[];
  for(const r of dedup){
    const line=lines.find(x=>Math.abs((x.y+x.h/2)-(r.y+r.h/2))<Math.max(.008,Math.min(x.h,r.h)*.55));
    if(!line){lines.push({...r});continue}
    const right=Math.max(line.x+line.w,r.x+r.w),bottom=Math.max(line.y+line.h,r.y+r.h);
    line.x=Math.min(line.x,r.x);line.y=Math.min(line.y,r.y);line.w=right-line.x;line.h=bottom-line.y;
  }
  return lines.filter(r=>r.w>.001&&r.h>.002).map(r=>({x:Number(r.x.toFixed(6)),y:Number(r.y.toFixed(6)),w:Number(r.w.toFixed(6)),h:Number(r.h.toFixed(6))}));
}
function getSelectedGeometry(){
  const sel=window.getSelection();if(!sel||sel.isCollapsed||!sel.rangeCount)return null;
  const text=sel.toString().replace(/\s+/g,' ').trim();if(!text)return null;
  const range=sel.getRangeAt(0);const startNode=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;const endNode=range.endContainer.nodeType===1?range.endContainer:range.endContainer.parentElement;
  const pageEl=startNode?.closest?.('.pdf-reader-page');if(!pageEl||endNode?.closest?.('.pdf-reader-page')!==pageEl)return null;
  const textLayer=pageEl.querySelector('.pdf-reader-text-layer');if(!textLayer)return null;
  const box=pageEl.getBoundingClientRect();const rects=normalizeRects(range.getClientRects(),box);if(!rects.length)return null;
  return {page:Number(pageEl.dataset.page),text:text.slice(0,20000),rects};
}
function updateSelection(){
  if(pinchState)return;
  const g=getSelectedGeometry();
  if(!g){if(state.selected)scheduleSelectionClear();return}
  clearTimeout(selectionClearTimer);selectionClearTimer=null;state.selected=g;
  const bar=$('pdfReaderSelectionBar');if(bar){$('pdfReaderSelectionText').textContent=g.text.length>90?g.text.slice(0,90)+'…':g.text;bar.classList.add('show')}
}
function lockSelectionForAction(){state.selectionLocked=true;clearTimeout(selectionClearTimer);selectionClearTimer=null;setTimeout(()=>{state.selectionLocked=false},900)}
function inferQuestionFromSelection(text=''){
  const clean=String(text||'').replace(/\s+/g,' ').trim();
  if(!clean)return 'O que deve ser lembrado neste ponto?';
  const lower=clean.toLocaleLowerCase('pt-BR');
  const firstSentence=(clean.split(/[.!?;]\s+/)[0]||clean).trim();
  const shortSentence=firstSentence.length>96?firstSentence.slice(0,93)+'…':firstSentence;
  const compact=s=>String(s||'').replace(/^[,.;:\-\s]+|[,.;:\-\s]+$/g,'').replace(/\s+/g,' ').trim();
  const clip=(s,max=74)=>{s=compact(s);return s.length>max?s.slice(0,max-1).replace(/\s+\S*$/,'')+'…':s};
  const subject=()=>{
    const patterns=[
      /(?:entende-se por|considera-se|denomina-se|chama-se)\s+([^,.;:()]{3,90})/i,
      /(?:^|[.;:]\s*)(?:o|a|os|as|um|uma)?\s*([^,.;:()]{3,90}?)\s+(?:é|são|consiste|corresponde|significa|constitui|representa)\s/i,
      /(?:sobre|quanto a|em relação a|relativo a|referente a)\s+([^,.;:()]{3,90})/i,
      /(?:art\.?\s*\d+[^\s,.;:]*)\s*[-–—:]?\s*([^,.;:()]{3,90})/i
    ];
    for(const p of patterns){const m=clean.match(p);if(m?.[1])return clip(m[1])}
    const noun=clean.match(/\b(?:direito|dever|competência|atribuição|requisito|condição|prazo|pena|crime|infração|ato|processo|procedimento|recurso|responsabilidade|servidor|administração|contrato|licitação|controle|princípio|garantia|vedação|exceção|nulidade|prescrição|decadência)\b(?:\s+(?:[a-zà-ú]+|de|da|do|dos|das)){0,6}/i);
    if(noun?.[0])return clip(noun[0]);
    return clip(shortSentence,68);
  };
  const topic=subject();
  const comparison=clean.match(/\b(.{3,80}?)\s+(?:diferencia-se de|distingue-se de|difere de|ao contrário de|enquanto)\s+(.{3,80}?)(?:[.;,]|$)/i);
  if(comparison)return `Como o trecho diferencia ${clip(comparison[1],38)} de ${clip(comparison[2],38)}?`;
  if(/\b(?:salvo|exceto|ressalvado|ressalvada|excepcionalmente|não se aplica|dispensa-se)\b/.test(lower))return `Qual é a exceção indicada sobre ${topic}?`;
  if(/\b(?:requisito|requisitos|elemento|elementos|pressuposto|pressupostos|condição|condições|depende de|exige|necessário|necessária|deve conter)\b/.test(lower))return `Quais requisitos o trecho aponta para ${topic}?`;
  if(/\b(?:se|quando|desde que|caso|na hipótese de|sempre que)\b/.test(lower)&&/\b(?:será|deverá|poderá|implica|gera|acarreta|resulta|produz|autoriza|veda|impede|permite)\b/.test(lower))return `O que ocorre quando ${topic}?`;
  if(/\b(?:pena|detenção|reclusão|multa|sanção|penalidade|punível|responde por|incide em)\b/.test(lower))return `Qual consequência jurídica recai sobre ${topic}?`;
  if(/\b(?:vedado|proibido|não pode|não poderá|é nulo|nulidade|ilícito|crime|contravenção)\b/.test(lower))return `O que é vedado ou inválido em ${topic}?`;
  if(/\b(?:compete|cabe|atribuição|competência|responsável|deverá|deve|obrigatório|obriga-se)\b/.test(lower))return `O que o trecho exige de ${topic}?`;
  if(/\b(?:define|conceitua|significa|conceito|consiste|considera-se|entende-se por|denomina-se|é a|é o|são os|são as)\b/.test(lower))return `Como o trecho define ${topic}?`;
  if(/\b(?:porque|pois|em razão de|decorre|decorrem|para que|a fim de|com o objetivo de|finalidade)\b/.test(lower))return `Por que ${topic} é relevante no trecho?`;
  return `O que o trecho afirma sobre ${topic}?`;
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
  flashcardDraft={text:state.selected.text,page:state.selected.page,materia:link.materia||'',assunto:link.assunto||'',sourcePdfId:state.doc?.id||null};
  const modal=$('modalPdfFlashcard');
  if(!modal)return createFlashcard();
  $('pdfFlashcardQuestion').value=inferQuestionFromSelection(flashcardDraft.text);
  $('pdfFlashcardAnswer').value=flashcardDraft.text;
  $('pdfFlashcardContext').textContent=`${flashcardDraft.materia||'Sem matéria'} · ${flashcardDraft.assunto||'Sem assunto'} · pág. ${flashcardDraft.page}`;
  modal.style.display='flex';
  setTimeout(()=>$('pdfFlashcardQuestion')?.focus(),0);
}
function closeFlashcardComposer({keepDraft=false}={}){const modal=$('modalPdfFlashcard');if(modal)modal.style.display='none';if(!keepDraft)flashcardDraft=null}
async function createFlashcard(){
  const draft=flashcardDraft||(
    state.selected?{text:state.selected.text,page:state.selected.page,materia:currentLink()?.materia||'',assunto:currentLink()?.assunto||'',sourcePdfId:state.doc?.id||null}:null
  );
  if(!draft)return alert('Abra o criador a partir de um trecho do PDF antes de salvar.');
  if(!draft.materia&&!draft.assunto)return alert('Vincule o PDF a um concurso/matéria antes de criar flashcard.');
  const pergunta=($('pdfFlashcardQuestion')?.value||inferQuestionFromSelection(draft.text)).trim();
  const resposta=($('pdfFlashcardAnswer')?.value||draft.text).trim();
  if(!pergunta||!resposta)return alert('Pergunta e resposta são obrigatórias.');
  try{
    if(typeof global.addPdfStudyFlashcard!=='function')throw new Error('Integração com flashcards indisponível.');
    await global.addPdfStudyFlashcard({materia:draft.materia,assunto:draft.assunto,pergunta,resposta,sourcePdfId:draft.sourcePdfId,sourcePage:draft.page});
    closeFlashcardComposer();clearSelection();setStatus('Flashcard salvo na área de Flashcards.');
    await close();
    global.openSearchFlashcardResult?.({materia:draft.materia,assunto:draft.assunto});
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
    const notes=typeof global.getPdfStudyNotesForCurrentContest==='function'
      ? global.getPdfStudyNotesForCurrentContest()
      : [];
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
function touchDistance(touches){const a=touches[0],b=touches[1];return Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY)}
function touchCenter(touches){return {x:(touches[0].clientX+touches[1].clientX)/2,y:(touches[0].clientY+touches[1].clientY)/2}}
function beginPinch(e){
  if(e.touches.length!==2||!state.pdf)return;const wrap=$('pdfReaderCanvasWrap'),pageEl=wrap?.querySelector('.pdf-reader-page');if(!wrap||!pageEl)return;
  clearSelection();const center=touchCenter(e.touches),pageRect=pageEl.getBoundingClientRect();pinchState={startDistance:touchDistance(e.touches),startScale:state.scale,lastScale:state.scale,anchorX:clamp((center.x-pageRect.left)/pageRect.width,0,1),anchorY:clamp((center.y-pageRect.top)/pageRect.height,0,1),centerX:center.x,centerY:center.y};wrap.classList.add('is-pinching');pageEl.style.transformOrigin=`${pinchState.anchorX*100}% ${pinchState.anchorY*100}%`;
}
function movePinch(e){
  if(!pinchState||e.touches.length!==2)return;e.preventDefault();const distance=touchDistance(e.touches);const scale=clamp(pinchState.startScale*(distance/pinchState.startDistance),.5,3);pinchState.lastScale=scale;const ratio=scale/pinchState.startScale;const pageEl=$('pdfReaderCanvasWrap')?.querySelector('.pdf-reader-page');if(pageEl)pageEl.style.transform=`scale(${ratio})`;const z=$('pdfReaderZoomLabel');if(z)z.textContent=Math.round(scale*100)+'%';
}
async function endPinch(e){
  if(!pinchState||e.touches?.length>=2)return;const snap=pinchState;pinchState=null;const wrap=$('pdfReaderCanvasWrap');wrap?.classList.remove('is-pinching');state.scale=snap.lastScale;state.fitMode='custom';updateZoomUi();await renderPage();requestAnimationFrame(()=>{const pageEl=wrap?.querySelector('.pdf-reader-page');if(!wrap||!pageEl)return;const wrapRect=wrap.getBoundingClientRect();const localX=snap.centerX-wrapRect.left,localY=snap.centerY-wrapRect.top;wrap.scrollLeft=pageEl.offsetLeft+(snap.anchorX*pageEl.offsetWidth)-localX;wrap.scrollTop=pageEl.offsetTop+(snap.anchorY*pageEl.offsetHeight)-localY;clampDocumentScroll()});
}
function bindReaderInteractions(){
  const wrap=$('pdfReaderCanvasWrap');if(!wrap)return;
  if(wrap.dataset.bound!=='1'){
    wrap.dataset.bound='1';
    wrap.addEventListener('scroll',()=>{if(!state.selectionLocked&&!pinchState)scheduleSelectionClear(220)},{passive:true});
    wrap.addEventListener('wheel',async(e)=>{if(!state.pdf||wheelLock||e.ctrlKey)return;const atTop=wrap.scrollTop<=2;const atBottom=Math.ceil(wrap.scrollTop+wrap.clientHeight)>=wrap.scrollHeight-2;if(e.deltaY>22&&atBottom&&state.page<state.total){e.preventDefault();wheelLock=true;try{await next();wrap.scrollTop=0}finally{setTimeout(()=>wheelLock=false,180)}}else if(e.deltaY<-22&&atTop&&state.page>1){e.preventDefault();wheelLock=true;try{await prev();wrap.scrollTop=Math.max(0,wrap.scrollHeight)}finally{setTimeout(()=>wheelLock=false,180)}}},{passive:false});
    wrap.addEventListener('touchstart',e=>{if(e.touches.length===2)beginPinch(e)},{passive:true});wrap.addEventListener('touchmove',movePinch,{passive:false});wrap.addEventListener('touchend',endPinch,{passive:true});wrap.addEventListener('touchcancel',endPinch,{passive:true});
    const actionBar=$('pdfReaderSelectionBar');if(actionBar){actionBar.addEventListener('pointerdown',lockSelectionForAction);actionBar.addEventListener('touchstart',lockSelectionForAction,{passive:true})}
  }
  document.removeEventListener('selectionchange',onSelectionChange);document.removeEventListener('keydown',onKeyDown);window.removeEventListener('resize',onReaderResize);
  document.addEventListener('selectionchange',onSelectionChange);document.addEventListener('keydown',onKeyDown);window.addEventListener('resize',onReaderResize);
}
function onSelectionChange(){if(document.body.classList.contains('pdf-reader-open'))setTimeout(updateSelection,90)}
function onReaderResize(){clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(document.body.classList.contains('pdf-reader-open')&&state.fitMode!=='custom')calculateFitScale(state.fitMode).then(()=>renderPage()).then(resetDocumentScroll).catch(()=>{})},180)}
function unbindReaderInteractions(){document.removeEventListener('keydown',onKeyDown);document.removeEventListener('selectionchange',onSelectionChange);window.removeEventListener('resize',onReaderResize);clearTimeout(resizeTimer);resizeTimer=null;pinchState=null}
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
    state={doc,pdf:null,page:Number(doc.progress?.current_page||1),total:0,scale:window.innerWidth<700?1:1.25,annotations:[],bookmarks:[],selected:null,openedAt:Date.now(),renderToken:0,importedNotes:[],fitMode:window.innerWidth<700?'width':'custom',selectionLocked:false};
    $('pdfReaderOverlay').classList.add('open');document.body.classList.add('pdf-reader-open');$('pdfReaderTitle').textContent=doc.title||doc.original_file_name||'PDF';$('pdfReaderZoomLabel').textContent=Math.round(state.scale*100)+'%';setStatus('Carregando PDF…');bindReaderInteractions();
    const blob=await global.PdfStudyLibrary.downloadBlob(doc);const data=new Uint8Array(await blob.arrayBuffer());
    state.pdf=await pdfjsLib.getDocument({data}).promise;state.total=state.pdf.numPages;state.page=Math.min(Math.max(1,state.page),state.total);$('pdfReaderTotalPages').textContent=String(state.total);$('pdfReaderPageInput').max=String(state.total);
    if(state.fitMode==='width')await calculateFitScale('width');
    // First meaningful paint: renderiza o PDF antes de aguardar metadados secundários.
    await renderPage();setStatus('PDF pronto. Sincronizando marcações…');
    const pageCountTask=typeof global.PdfStudyLibrary.updatePageCount==='function'
      ? global.PdfStudyLibrary.updatePageCount(doc.id,state.total).catch(error=>{console.warn('[PDF Reader] page_count não bloqueante:',error);return null})
      : Promise.resolve(null);
    const [annotations,bookmarks]=await Promise.all([
      ann().list(doc.id).catch(error=>{console.warn('[PDF Reader] marcações indisponíveis temporariamente:',error);return[]}),
      ann().bookmarks(doc.id).catch(error=>{console.warn('[PDF Reader] bookmarks indisponíveis temporariamente:',error);return[]}),
      pageCountTask
    ]);
    if(state.doc?.id!==doc.id)return;
    state.annotations=annotations||[];state.bookmarks=bookmarks||[];updateBookmarkButton();await renderAnnotations();renderSideList();setStatus('Selecione um trecho para grifar, sublinhar, anotar ou criar flashcard.');
  }catch(e){handle(e);close()}
}
async function close(){
  if(state.doc){await saveProgress(true).catch(()=>{})}
  $('pdfReaderOverlay')?.classList.remove('open');document.body.classList.remove('pdf-reader-open');clearSelection();closeFlashcardComposer();unbindReaderInteractions();
  state={doc:null,pdf:null,page:1,total:0,scale:1.25,annotations:[],bookmarks:[],selected:null,openedAt:0,renderToken:0,importedNotes:[],fitMode:'custom',selectionLocked:false};global.PdfStudyLibraryUI?.refresh?.()
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
  pageEl.addEventListener('mouseup',()=>setTimeout(updateSelection,20));pageEl.addEventListener('pointerup',()=>setTimeout(updateSelection,60));pageEl.addEventListener('touchend',()=>setTimeout(updateSelection,180),{passive:true});
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
async function prev(){if(state.page>1){state.page--;await renderPage();resetDocumentScroll()}}
async function next(){if(state.page<state.total){state.page++;await renderPage();resetDocumentScroll()}}
async function goto(v){const n=Math.min(state.total,Math.max(1,Number(v)||1));if(n!==state.page){state.page=n;await renderPage();resetDocumentScroll()}}
function scrollReader(delta){const wrap=$('pdfReaderCanvasWrap');if(wrap){wrap.scrollBy({top:delta,behavior:'smooth'});clearSelection()}}
async function moveVertical(direction){const wrap=$('pdfReaderCanvasWrap');if(!wrap)return;const atTop=wrap.scrollTop<=4;const atBottom=Math.ceil(wrap.scrollTop+wrap.clientHeight)>=wrap.scrollHeight-4;if(direction<0&&atTop&&state.page>1){await prev();wrap.scrollTop=Math.max(0,wrap.scrollHeight)}else if(direction>0&&atBottom&&state.page<state.total){await next();wrap.scrollTop=0}else{scrollReader(direction*140)}}
async function calculateFitScale(mode='width'){
  if(!state.pdf)return state.scale;const page=await state.pdf.getPage(state.page);const base=page.getViewport({scale:1});const wrap=$('pdfReaderCanvasWrap');
  const availableW=Math.max(240,wrap.clientWidth-(window.innerWidth<700?4:36));const availableH=Math.max(260,wrap.clientHeight-(window.innerWidth<700?8:24));
  state.scale=clamp(mode==='page'?Math.min(availableW/base.width,availableH/base.height):availableW/base.width,.5,2.5);state.fitMode=mode;updateZoomUi();return state.scale;
}
function updateZoomUi(){const z=$('pdfReaderZoomLabel');if(z)z.textContent=Math.round(state.scale*100)+'%';const b=$('pdfReaderFitButton');if(b)b.textContent=state.fitMode==='width'?'Largura':state.fitMode==='page'?'Página':'Ajustar'}
async function zoom(delta){state.fitMode='custom';state.scale=clamp(state.scale+delta,.5,3);updateZoomUi();await renderPage();centerScrollAfterRender()}
async function fitWidth(){await calculateFitScale('width');await renderPage();resetDocumentScroll()}
async function fitPage(){await calculateFitScale('page');await renderPage();resetDocumentScroll()}
async function toggleFit(){if(state.fitMode==='width')return fitPage();return fitWidth()}
function resetDocumentScroll(){const wrap=$('pdfReaderCanvasWrap');if(wrap){wrap.scrollLeft=0;wrap.scrollTop=0;clampDocumentScroll()}}
function centerScrollAfterRender(){requestAnimationFrame(()=>clampDocumentScroll())}
function clampDocumentScroll(){const wrap=$('pdfReaderCanvasWrap');if(!wrap)return;const maxX=Math.max(0,wrap.scrollWidth-wrap.clientWidth),maxY=Math.max(0,wrap.scrollHeight-wrap.clientHeight);wrap.scrollLeft=clamp(wrap.scrollLeft,0,maxX);wrap.scrollTop=clamp(wrap.scrollTop,0,maxY)}
async function toggleBookmark(){try{const active=await ann().toggleBookmark(state.doc.id,state.page);state.bookmarks=await ann().bookmarks(state.doc.id);updateBookmarkButton();setStatus(active?'Página marcada para voltar depois.':'Marcador da página removido.')}catch(e){handle(e)}}
function updateBookmarkButton(){const b=$('pdfReaderBookmark');if(!b)return;const active=state.bookmarks.some(x=>Number(x.page_number)===state.page);b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false');b.setAttribute('aria-label',active?'Remover marcador desta página':'Marcar esta página');b.title=active?'Remover marcador desta página':'Marcar esta página'}
async function saveProgress(closing){if(!state.doc||!state.total)return;const c=core().getSupabaseClient(),u=await core().getAuthenticatedUser();const elapsed=closing&&state.openedAt?Math.max(0,Math.round((Date.now()-state.openedAt)/1000)):0;const {error}=await c.from('pdf_progress').upsert({user_id:u.id,pdf_id:state.doc.id,current_page:state.page,progress_percentage:Math.round((state.page/state.total)*10000)/100,reading_seconds:Number(state.doc.progress?.reading_seconds||0)+elapsed,last_opened_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'user_id,pdf_id'});if(error)throw error}
function toggleSide(){document.getElementById('pdfReaderOverlay')?.classList.toggle('side-collapsed')}
function handle(e){console.error('[PDF Reader]',e);setStatus(e?.message||'Erro no Reader.');alert(e?.message||'Erro no Reader.')}
global.PdfStudyReader=Object.freeze({open,close,prev,next,goto,zoom,fitWidth,fitPage,toggleFit,toggleBookmark,saveAnnotation,promptNote,createFlashcard,openFlashcardComposer,closeFlashcardComposer,exportToNotes,importNotes,deleteAnnotation,goToAnnotation,toggleSide,moveVertical,scrollReader});
})(window);

(function(global){
'use strict';

const $ = id => document.getElementById(id);
let notesSelectionObserver = null;
let notesSelectionRestoreTimer = null;
let originalLoadNotesData = null;

const safeName = value => String(value || 'anotacoes')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-zA-Z0-9._-]+/g,'_')
  .replace(/^_+|_+$/g,'')
  .slice(0,120) || 'anotacoes';

function notice(message, title='Anotações') {
  if (typeof global.appNotice === 'function') return global.appNotice(message,{title});
  alert(message);
  return Promise.resolve();
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"]/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'
  }[ch]));
}

function escapeAttr(value){
  return escapeHtml(value).replace(/'/g,'&#39;');
}

function sanitizePrintableHtml(html){
  const holder = document.createElement('div');
  holder.innerHTML = String(html || '');
  holder.querySelectorAll('script,iframe,object,embed,meta,base').forEach(node => node.remove());
  holder.querySelectorAll('*').forEach(node => {
    [...node.attributes].forEach(attr => {
      const name = String(attr.name || '').toLowerCase();
      const value = String(attr.value || '').trim();
      if (name.startsWith('on')) node.removeAttribute(attr.name);
      if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^javascript:/i.test(value)) node.removeAttribute(attr.name);
    });
  });
  return holder.innerHTML;
}

function collectRootCssVariables(){
  try{
    const computed = getComputedStyle(document.documentElement);
    const vars = [];
    for(let i=0;i<computed.length;i++){
      const name = computed[i];
      if(!name || !name.startsWith('--')) continue;
      const value = computed.getPropertyValue(name);
      if(value) vars.push(`${name}:${value.trim()}`);
    }
    return vars.length ? `:root{${vars.join(';')}}` : '';
  }catch(_){ return ''; }
}

function collectPrintableStyles(){
  const pieces = [];
  try{
    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      const href = link.href || link.getAttribute('href');
      if(href) pieces.push(`<link rel="stylesheet" href="${escapeAttr(href)}">`);
    });
  }catch(_){ }
  try{
    document.querySelectorAll('style').forEach(style => {
      const media = style.getAttribute('media');
      pieces.push(`<style${media ? ` media="${escapeAttr(media)}"` : ''}>${style.textContent || ''}</style>`);
    });
  }catch(_){ }
  const vars = collectRootCssVariables();
  if(vars) pieces.push(`<style>${vars}</style>`);
  return pieces.join('\n');
}

function normalizeSavedMedia(html){
  const holder = document.createElement('div');
  holder.innerHTML = sanitizePrintableHtml(html);
  holder.querySelectorAll('img').forEach(img => {
    if(!img.getAttribute('alt')) img.setAttribute('alt','Imagem da anotação');
    img.setAttribute('loading','eager');
    img.setAttribute('decoding','sync');
  });
  holder.querySelectorAll('svg').forEach(svg => {
    if(!svg.getAttribute('xmlns')) svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
  });
  return holder.innerHTML;
}

function buildHighFidelityPrintHtml(materia,notes){
  const title = `${safeName(global.currentConcurso)}_${safeName(materia)}_anotacoes`;
  const baseHref = document.baseURI || global.location?.href || '/';
  const inheritedStyles = collectPrintableStyles();
  const noteHtml = notes.map((note,index) => {
    const rawBody = String(note?.conteudo || '');
    const body = rawBody.trim() ? normalizeSavedMedia(rawBody) : `<p>${escapeHtml(note?.conteudoTexto || '')}</p>`;
    const heading = escapeHtml(note?.titulo || note?.assunto || `Nota ${index+1}`);
    const assunto = note?.assunto && note.assunto !== note.titulo ? `<div class="pdf-note-subject">Assunto: ${escapeHtml(note.assunto)}</div>` : '';
    const data = note?.data ? `<div class="pdf-note-date">Editado em ${escapeHtml(note.data)}</div>` : '';
    return `<section class="pdf-note-section"><header class="pdf-note-head"><h2>${heading}</h2>${assunto}${data}</header><div class="pdf-note-body">${body}</div></section>`;
  }).join('');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${escapeAttr(baseHref)}"><title>${escapeHtml(title)}</title>${inheritedStyles}<style>
@page{size:A4;margin:15mm 16mm 16mm}
html,body{margin:0!important;padding:0!important;background:#fff!important;color:#16212f!important;overflow:visible!important}
body{width:auto!important;min-width:0!important;max-width:none!important;font-family:Arial,"Segoe UI","Segoe UI Symbol","Segoe UI Emoji","Apple Color Emoji","Noto Sans","Noto Sans Symbols 2","Noto Color Emoji",sans-serif!important;font-size:11pt!important;line-height:1.48!important;text-rendering:geometricPrecision;-webkit-font-smoothing:antialiased}
*,*::before,*::after{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
.pdf-report-head{border-top:3px solid #198f8a;padding-top:8mm;margin:0 0 8mm!important}
.pdf-report-head h1{margin:0 0 2mm!important;font-size:21pt!important;line-height:1.08!important;color:#0b293d!important;font-weight:700!important}
.pdf-report-head .pdf-materia{font-size:15pt!important;font-weight:700!important;color:#198f8a!important;margin:0 0 1.5mm!important}
.pdf-report-head .pdf-contest{font-size:9pt!important;color:#667788!important}
.pdf-note-section{display:block!important;position:static!important;float:none!important;width:100%!important;max-width:100%!important;margin:0 0 8mm!important;padding:0 0 7mm!important;border:0!important;border-bottom:.45pt solid #d8e2e8!important;background:transparent!important;box-shadow:none!important;transform:none!important;overflow:visible!important;break-inside:auto;page-break-inside:auto}
.pdf-note-section:last-child{border-bottom:0!important}
.pdf-note-head{display:block!important;position:static!important;break-after:avoid-page;page-break-after:avoid}
.pdf-note-head h2{margin:0 0 2mm!important;color:#0b293d!important;font-size:14pt!important;line-height:1.18!important;font-weight:700!important}
.pdf-note-subject{font-size:9pt!important;font-weight:700!important;color:#198f8a!important;margin:0 0 1mm!important}
.pdf-note-date{font-size:8.5pt!important;color:#778899!important;margin:0 0 4mm!important}
.pdf-note-body{display:block!important;position:static!important;float:none!important;width:100%!important;max-width:100%!important;min-width:0!important;height:auto!important;max-height:none!important;overflow:visible!important;word-break:normal;overflow-wrap:anywhere;transform:none!important;filter:none!important;opacity:1!important}
.pdf-note-body [contenteditable]{outline:0!important}.pdf-note-body [hidden],.pdf-note-body .no-print{display:none!important}
.pdf-note-body p{orphans:3;widows:3}.pdf-note-body h1,.pdf-note-body h2,.pdf-note-body h3,.pdf-note-body h4,.pdf-note-body h5,.pdf-note-body h6{break-after:avoid-page;page-break-after:avoid;line-height:1.2}
.pdf-note-body ul,.pdf-note-body ol{padding-left:1.6em}.pdf-note-body li{margin:.7mm 0}.pdf-note-body blockquote{break-inside:avoid-page;page-break-inside:avoid}
.pdf-note-body pre,.pdf-note-body code{white-space:pre-wrap!important;overflow-wrap:anywhere!important;max-width:100%!important}.pdf-note-body pre{break-inside:avoid-page;page-break-inside:avoid}
.pdf-note-body table{max-width:100%!important;break-inside:avoid-page;page-break-inside:avoid;border-collapse:collapse}
.pdf-note-body img,.pdf-note-body svg,.pdf-note-body picture,.pdf-note-body figure,.pdf-note-body video{max-width:100%!important;height:auto!important;object-fit:contain!important;break-inside:avoid-page!important;page-break-inside:avoid!important}
.pdf-note-body svg{overflow:visible!important}.pdf-note-body figure{margin-left:0!important;margin-right:0!important}.pdf-note-body a{color:inherit;text-decoration:underline}
.pdf-note-body [class*="icon"],.pdf-note-body [class*="symbol"],.pdf-note-body i,.pdf-note-body span{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
@media print{html,body{width:auto!important;min-width:0!important}.pdf-note-body *{animation:none!important;transition:none!important}}
</style></head><body><header class="pdf-report-head"><h1>Caderno de Anotações</h1><div class="pdf-materia">${escapeHtml(materia)}</div><div class="pdf-contest">Concurso: ${escapeHtml(String(global.currentConcurso || 'Concurso').trim())}</div></header>${noteHtml}</body></html>`;
}

function waitForPrintAssets(doc,timeoutMs=12000){
  const waits=[];
  try{ if(doc?.fonts?.ready) waits.push(Promise.resolve(doc.fonts.ready).catch(()=>{})); }catch(_){ }
  try{
    [...(doc?.images || [])].forEach(img => {
      if(img.complete && img.naturalWidth > 0) return;
      waits.push(new Promise(resolve => {
        const done=()=>resolve();
        img.addEventListener('load',done,{once:true});
        img.addEventListener('error',done,{once:true});
      }));
    });
  }catch(_){ }
  try{
    doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      if(link.sheet) return;
      waits.push(new Promise(resolve => {
        const done=()=>resolve();
        link.addEventListener('load',done,{once:true});
        link.addEventListener('error',done,{once:true});
      }));
    });
  }catch(_){ }
  return Promise.race([Promise.allSettled(waits),new Promise(resolve=>setTimeout(resolve,timeoutMs))]);
}

async function printHighFidelityDocument(materia,notes){
  const frame=document.createElement('iframe');
  frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
  Object.assign(frame.style,{position:'fixed',right:'0',bottom:'0',width:'1px',height:'1px',border:'0',opacity:'0',pointerEvents:'none'});
  document.body.appendChild(frame);
  let cleaned=false;
  const cleanup=()=>{if(cleaned)return;cleaned=true;setTimeout(()=>{try{frame.remove();}catch(_){}},700)};
  try{
    const doc=frame.contentDocument||frame.contentWindow?.document;
    if(!doc) throw new Error('O navegador não disponibilizou o documento de impressão.');
    doc.open();doc.write(buildHighFidelityPrintHtml(materia,notes));doc.close();
    await waitForPrintAssets(doc);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const win=frame.contentWindow;
    if(!win||typeof win.print!=='function') throw new Error('A impressão em PDF não está disponível neste navegador.');
    win.addEventListener?.('afterprint',cleanup,{once:true});
    win.focus();win.print();setTimeout(cleanup,120000);
  }catch(error){cleanup();throw error;}
}

async function exportRich(){
  const materia=String($('notesMateriaSelect')?.value||'').trim();
  if(!materia) return notice('Selecione uma matéria antes de exportar.');
  let notes=[];
  try{
    const metadata=typeof global.getConcursosMetadata==='function'?global.getConcursosMetadata():{};
    notes=(metadata?.[global.currentConcurso]?.structuredNotes||[]).filter(note=>String(note?.materia||'').trim()===materia);
  }catch(_){notes=[];}
  if(!notes.length) return notice(`Não há anotações em “${materia}” para exportar.`);
  try{await printHighFidelityDocument(materia,notes);}catch(error){console.error('[Rich notes export]',error);await notice(`Não foi possível preparar o PDF com fidelidade visual: ${error.message}`,'Falha na exportação');}
}

function selectionStorageKey(){const userId=String(global.currentUser?.id||global.currentUser?.email||'anon');const concurso=String(global.currentConcurso||'Concurso Geral');return `notes_selected_materia:${userId}:${concurso}`;}
function readSavedMateria(){try{return String(localStorage.getItem(selectionStorageKey())||'').trim();}catch(_){return '';}}
function saveSelectedMateria(value){const materia=String(value||'').trim();if(!materia)return;try{localStorage.setItem(selectionStorageKey(),materia);}catch(_){}}
function restoreSelectedMateria(preferred=''){const select=$('notesMateriaSelect');if(!select||!select.options?.length)return false;const desired=String(preferred||readSavedMateria()||'').trim();if(!desired)return false;if(![...select.options].some(option=>option.value===desired))return false;if(select.value!==desired){select.value=desired;if(typeof global.renderNotesList==='function')global.renderNotesList();}return true;}
function scheduleRestore(preferred=''){clearTimeout(notesSelectionRestoreTimer);notesSelectionRestoreTimer=setTimeout(()=>restoreSelectedMateria(preferred),0);}
function installSelectionPersistence(){const select=$('notesMateriaSelect');if(!select)return false;if(select.dataset.selectionPersistence!=='1'){select.dataset.selectionPersistence='1';select.addEventListener('change',()=>saveSelectedMateria(select.value));select.addEventListener('input',()=>saveSelectedMateria(select.value));}if(notesSelectionObserver)notesSelectionObserver.disconnect();notesSelectionObserver=new MutationObserver(()=>scheduleRestore());notesSelectionObserver.observe(select,{childList:true,subtree:true});scheduleRestore();if(typeof global.loadNotesData==='function'&&!global.loadNotesData.__notesSelectionWrapped){originalLoadNotesData=global.loadNotesData;const wrapped=function(...args){const desired=readSavedMateria()||String($('notesMateriaSelect')?.value||'');const result=originalLoadNotesData.apply(this,args);scheduleRestore(desired);return result;};wrapped.__notesSelectionWrapped=true;global.loadNotesData=wrapped;}return true;}
function install(){installSelectionPersistence();const wrap=$('notesIoActions');if(!wrap)return false;const old=[...wrap.querySelectorAll('button')].find(btn=>/^\s*Exportar\s*$/i.test(btn.textContent||''));if(!old)return false;if(old.dataset.richExport==='1')return true;const button=old.cloneNode(true);button.dataset.richExport='1';button.title='Exportar em PDF preservando Unicode, símbolos, imagens, SVGs, estilos, cores e formatação';button.removeAttribute('onclick');button.addEventListener('click',exportRich);old.replaceWith(button);return true;}
function boot(){if(!install())setTimeout(boot,120);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,80));else setTimeout(boot,80);
global.addEventListener('load',()=>setTimeout(boot,120));
document.addEventListener('click',event=>{const btn=event.target.closest('button');if((btn?.getAttribute('onclick')||'').includes("switchTab('tab-anotacoes'"))setTimeout(()=>{installSelectionPersistence();scheduleRestore();},20);});

function makeRichPdfBlob(){throw new Error('Exportação binária legada desativada: use printHighFidelityDocument para preservar Unicode e formatação.');}
function noteHtmlToBlocks(note){return normalizeSavedMedia(note?.conteudo||'');}

global.NotesRichExport=Object.freeze({exportRich,makeRichPdfBlob,noteHtmlToBlocks,buildHighFidelityPrintHtml,printHighFidelityDocument,sanitizePrintableHtml,restoreSelectedMateria,saveSelectedMateria});
})(window);

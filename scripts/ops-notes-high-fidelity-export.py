from pathlib import Path
import re

path = Path('public/js/notes-export-rich.js')
src = path.read_text(encoding='utf-8')

replacement = r'''function sanitizePrintableHtml(html){
  const holder=document.createElement('div');
  holder.innerHTML=String(html||'');
  holder.querySelectorAll('script,iframe,object,embed,link,meta,base').forEach(node=>node.remove());
  holder.querySelectorAll('*').forEach(node=>{
    [...node.attributes].forEach(attr=>{
      const name=String(attr.name||'').toLowerCase();
      const value=String(attr.value||'').trim();
      if(name.startsWith('on')) node.removeAttribute(attr.name);
      if((name==='href'||name==='src'||name==='xlink:href') && /^javascript:/i.test(value)) node.removeAttribute(attr.name);
    });
  });
  return holder.innerHTML;
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]));
}

function buildHighFidelityPrintHtml(materia,notes){
  const title=`${safeName(currentConcurso)}_${safeName(materia)}_anotacoes`;
  const noteHtml=notes.map((note,index)=>{
    const body=sanitizePrintableHtml(note?.conteudo||'') || `<p>${escapeHtml(note?.conteudoTexto||'')}</p>`;
    const heading=escapeHtml(note?.titulo||note?.assunto||`Nota ${index+1}`);
    const assunto=note?.assunto&&note.assunto!==note.titulo?`<div class="note-subject">Assunto: ${escapeHtml(note.assunto)}</div>`:'';
    const data=note?.data?`<div class="note-date">Editado em ${escapeHtml(note.data)}</div>`:'';
    return `<section class="note-section"><header class="note-head"><h2>${heading}</h2>${assunto}${data}</header><div class="note-body">${body}</div></section>`;
  }).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
    @page{size:A4;margin:15mm 16mm 16mm}
    *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    html,body{margin:0;padding:0;background:#fff;color:#16212f;font-family:Arial,"Segoe UI Symbol","Segoe UI Emoji","Apple Color Emoji","Noto Sans","Noto Color Emoji",sans-serif;font-size:11pt;line-height:1.48;text-rendering:geometricPrecision}
    body{overflow:visible}
    .report-head{border-top:3px solid #198f8a;padding-top:8mm;margin-bottom:8mm}
    .report-head h1{margin:0 0 2mm;font-size:21pt;line-height:1.08;color:#0b293d}
    .report-head .materia{font-size:15pt;font-weight:700;color:#198f8a;margin-bottom:1.5mm}
    .report-head .contest{font-size:9pt;color:#667788}
    .note-section{margin:0 0 8mm;padding:0 0 7mm;border-bottom:.45pt solid #d8e2e8;break-inside:auto;page-break-inside:auto}
    .note-section:last-child{border-bottom:0}
    .note-head{break-after:avoid-page;page-break-after:avoid}
    .note-head h2{margin:0 0 2mm;color:#0b293d;font-size:14pt;line-height:1.18}
    .note-subject{font-size:9pt;font-weight:700;color:#198f8a;margin:0 0 1mm}
    .note-date{font-size:8.5pt;color:#778899;margin:0 0 4mm}
    .note-body{min-width:0;overflow:visible;word-break:normal;overflow-wrap:break-word;hyphens:auto}
    .note-body p,.note-body div{max-width:100%}
    .note-body h1,.note-body h2,.note-body h3,.note-body h4,.note-body h5,.note-body h6{break-after:avoid-page;page-break-after:avoid;line-height:1.2}
    .note-body p{orphans:3;widows:3}
    .note-body ul,.note-body ol{padding-left:1.6em}
    .note-body li{margin:.7mm 0}
    .note-body blockquote{margin:4mm 0;padding:2mm 0 2mm 4mm;border-left:2.2pt solid #58cfc7;break-inside:avoid-page;page-break-inside:avoid}
    .note-body pre,.note-body code{white-space:pre-wrap;overflow-wrap:anywhere;font-family:Consolas,"Liberation Mono",Menlo,monospace}
    .note-body pre{break-inside:avoid-page;page-break-inside:avoid}
    .note-body table{width:100%;border-collapse:collapse;break-inside:avoid-page;page-break-inside:avoid}
    .note-body th,.note-body td{vertical-align:top}
    .note-body img,.note-body svg,.note-body figure,.note-body video{max-width:100%!important;height:auto!important;break-inside:avoid-page;page-break-inside:avoid;object-fit:contain}
    .note-body figure{margin:4mm 0}
    .note-body figcaption{font-size:9pt;color:#667788;margin-top:1.5mm}
    .note-body a{color:inherit;text-decoration:underline}
    @media print{html,body{width:auto!important;min-width:0!important}.no-print{display:none!important}}
  </style></head><body><header class="report-head"><h1>Caderno de Anotações</h1><div class="materia">${escapeHtml(materia)}</div><div class="contest">Concurso: ${escapeHtml(String(currentConcurso||'Concurso').trim())}</div></header>${noteHtml}</body></html>`;
}

function waitForPrintAssets(doc,timeoutMs=6000){
  const waits=[];
  if(doc?.fonts?.ready) waits.push(Promise.resolve(doc.fonts.ready).catch(()=>{}));
  [...(doc?.images||[])].forEach(img=>{
    if(img.complete) return;
    waits.push(new Promise(resolve=>{
      const done=()=>resolve();
      img.addEventListener('load',done,{once:true});
      img.addEventListener('error',done,{once:true});
    }));
  });
  return Promise.race([Promise.allSettled(waits),new Promise(resolve=>setTimeout(resolve,timeoutMs))]);
}

async function printHighFidelityDocument(materia,notes){
  const frame=document.createElement('iframe');
  frame.setAttribute('aria-hidden','true');
  frame.tabIndex=-1;
  Object.assign(frame.style,{position:'fixed',right:'0',bottom:'0',width:'1px',height:'1px',border:'0',opacity:'0',pointerEvents:'none'});
  document.body.appendChild(frame);
  const cleanup=()=>{setTimeout(()=>{try{frame.remove();}catch(_){}},700)};
  try{
    const doc=frame.contentDocument||frame.contentWindow?.document;
    if(!doc) throw new Error('O navegador não disponibilizou o documento de impressão.');
    doc.open();doc.write(buildHighFidelityPrintHtml(materia,notes));doc.close();
    await waitForPrintAssets(doc);
    const win=frame.contentWindow;
    if(!win||typeof win.print!=='function') throw new Error('A impressão em PDF não está disponível neste navegador.');
    win.addEventListener?.('afterprint',cleanup,{once:true});
    win.focus();
    win.print();
    setTimeout(cleanup,120000);
  }catch(error){cleanup();throw error;}
}

async function exportRich(){
  const materia=String($('notesMateriaSelect')?.value||'').trim();
  if(!materia)return notice('Selecione uma matéria antes de exportar.');
  let notes=[];
  try{const metadata=getConcursosMetadata();notes=(metadata?.[currentConcurso]?.structuredNotes||[]).filter(note=>String(note?.materia||'').trim()===materia);}catch(_){notes=[];}
  if(!notes.length)return notice(`Não há anotações em “${materia}” para exportar.`);
  try{
    await printHighFidelityDocument(materia,notes);
  }catch(error){console.error('[Rich notes export]',error);await notice(`Não foi possível preparar o PDF com fidelidade visual: ${error.message}`,'Falha na exportação');}
}

function selectionStorageKey(){'''

pattern = re.compile(r"async function exportRich\(\)\{.*?\n\}\n\nfunction selectionStorageKey\(\)\{", re.S)
if not pattern.search(src):
    raise SystemExit('exportRich block not found')
src = pattern.sub(replacement, src, count=1)
src = src.replace("button.title='Exportar em PDF preservando parágrafos, títulos e formatação';", "button.title='Exportar em PDF preservando caracteres especiais, símbolos, imagens, figuras, títulos e formatação';")
src = src.replace("global.NotesRichExport=Object.freeze({exportRich,makeRichPdfBlob,noteHtmlToBlocks,restoreSelectedMateria,saveSelectedMateria});", "global.NotesRichExport=Object.freeze({exportRich,makeRichPdfBlob,noteHtmlToBlocks,buildHighFidelityPrintHtml,printHighFidelityDocument,sanitizePrintableHtml,restoreSelectedMateria,saveSelectedMateria});")
path.write_text(src, encoding='utf-8')

Path('tests/notes-pdf-high-fidelity.test.cjs').write_text(r'''const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync('public/js/notes-export-rich.js','utf8');

test('exportação de anotações usa documento HTML UTF-8 de alta fidelidade',()=>{
  assert.match(src,/meta charset=\"UTF-8\"/);
  assert.match(src,/buildHighFidelityPrintHtml\(materia,notes\)/);
  assert.match(src,/await printHighFidelityDocument\(materia,notes\)/);
  assert.doesNotMatch(src,/const blob=makeRichPdfBlob\(materia,notes\);const url/);
});

test('caracteres especiais e símbolos não passam pela conversão WinAnsi no caminho principal',()=>{
  const exportBlock=src.slice(src.indexOf('async function exportRich()'),src.indexOf('function selectionStorageKey()'));
  assert.doesNotMatch(exportBlock,/normalizePdfChar|toPdfText|latin1Bytes|makeRichPdfBlob/);
  assert.match(src,/Segoe UI Symbol/);
  assert.match(src,/Segoe UI Emoji/);
  assert.match(src,/Noto Color Emoji/);
});

test('imagens figuras tabelas e SVG são preservados no layout de impressão',()=>{
  assert.match(src,/\.note-body img,\.note-body svg,\.note-body figure,\.note-body video/);
  assert.match(src,/\.note-body table/);
  assert.match(src,/break-inside:avoid-page/);
  assert.match(src,/print-color-adjust:exact/);
  assert.match(src,/doc\?\.images/);
});

test('HTML imprimível remove elementos e atributos executáveis sem destruir formatação rica',()=>{
  assert.match(src,/script,iframe,object,embed,link,meta,base/);
  assert.match(src,/name\.startsWith\('on'\)/);
  assert.match(src,/javascript:/i);
  assert.match(src,/holder\.innerHTML/);
});

test('impressão usa A4 e aguarda fontes e imagens antes de abrir o diálogo PDF',()=>{
  assert.match(src,/@page\{size:A4/);
  assert.match(src,/doc\?\.fonts\?\.ready/);
  assert.match(src,/await waitForPrintAssets\(doc\)/);
  assert.match(src,/win\.print\(\)/);
});
''',encoding='utf-8')

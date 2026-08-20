import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);
const must=(cond,msg)=>{if(!cond)throw new Error(msg)};
const replaceOnce=(src,re,next,label)=>{const out=src.replace(re,next);must(out!==src,`Pattern not found: ${label}`);return out};

// 1) Biblioteca: botões, filtros em linha e posicionamento ao abrir.
{
  const p='public/js/pdf/pdf-library-ui.js';
  let s=read(p);
  s=s.replace(/<button class=\"btn btn-primary btn-sm\" onclick=\"PdfStudyLibraryUI\.openDocument\('/g,'<button class="btn btn-secondary btn-sm pdf-library-card-action" onclick="PdfStudyLibraryUI.openDocument(\'');
  s=s.replace(/class=\"btn btn-secondary btn-sm\" onclick=\"PdfStudyLibraryUI\.(openLinkModal|unlinkDocument)\('/g,'class="btn btn-secondary btn-sm pdf-library-card-action" onclick="PdfStudyLibraryUI.$1(\'');
  s=s.replace(/class=\"btn btn-danger btn-sm\" onclick=\"PdfStudyLibraryUI\.deleteDocument\('/g,'class="btn btn-danger btn-sm pdf-library-card-action pdf-library-card-delete" onclick="PdfStudyLibraryUI.deleteDocument(\'');
  if(!s.includes('function tuneLibraryUiV1024')){
    s += `\n\n// V10.24 — acabamento responsivo da Biblioteca e posicionamento da guia.\nfunction tuneLibraryUiV1024(){\n  const ids=['pdfLibraryScope','pdfWorkspaceFilter','pdfMateriaFilter','pdfAssuntoFilter'];\n  const controls=ids.map(id=>document.getElementById(id)).filter(Boolean);\n  const search=document.getElementById('pdfLibrarySearch'); if(search)controls.push(search);\n  const parent=controls.find(Boolean)?.parentElement;\n  if(parent){parent.classList.add('pdf-library-filter-row-v1024'); controls.forEach(el=>el.classList.add('pdf-library-filter-control-v1024'));}\n}\nfunction scrollLibraryStartV1024(){\n  const tab=document.getElementById('tab-biblioteca'); if(!tab)return;\n  const target=tab.querySelector('h2,h3,.section-title,.pdf-library-header')||tab;\n  const header=document.querySelector('.modern-header');\n  const top=Math.max(0,target.getBoundingClientRect().top+window.scrollY-(header?.offsetHeight||0)-12);\n  window.scrollTo({top,behavior:'auto'});\n}\ndocument.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const oc=b.getAttribute('onclick')||'';if(oc.includes("switchTab('tab-biblioteca'"))requestAnimationFrame(()=>requestAnimationFrame(()=>{tuneLibraryUiV1024();scrollLibraryStartV1024()}));});\nwindow.addEventListener('resize',tuneLibraryUiV1024,{passive:true});\nsetTimeout(tuneLibraryUiV1024,0);\n`;
  }
  write(p,s);
}

{
  const p='public/css/pdf-library.css';
  let s=read(p);
  if(!s.includes('V10.24 — Biblioteca compacta')) s += `\n\n/* V10.24 — Biblioteca compacta e consistente. */\n.pdf-card-actions{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;align-items:stretch}.pdf-card-actions .pdf-library-card-action{width:100%;min-height:34px;display:inline-flex;align-items:center;justify-content:center;text-align:center}.pdf-card-actions .btn-secondary.pdf-library-card-action{background:var(--surface-2,#172636)!important;border-color:var(--border,#2a4154)!important;color:var(--text,#e7eef5)!important}.pdf-card-actions .pdf-library-card-delete{background:var(--danger,#dc3545)!important;color:#fff!important}.pdf-library-filter-row-v1024{display:grid!important;grid-template-columns:minmax(155px,.8fr) minmax(180px,1fr) minmax(160px,1fr) minmax(170px,1fr) minmax(220px,1.5fr) auto!important;gap:10px!important;align-items:center!important}.pdf-library-filter-control-v1024{width:100%!important;min-width:0!important;margin:0!important}@media(max-width:1050px){.pdf-library-filter-row-v1024{grid-template-columns:repeat(3,minmax(0,1fr))!important}}@media(max-width:700px){.pdf-library-filter-row-v1024{grid-template-columns:1fr!important}.pdf-card-actions{grid-template-columns:1fr!important}}\n`;
  write(p,s);
}

// 2) Reader: editor rico, exportação independente e previews seguros.
{
  const p='public/js/pdf/pdf-reader.js';
  let s=read(p);
  s=replaceOnce(s,/async function promptNote\(\)\{[^\n]*\}/,`async function promptNote(){if(!await ensureSelection())return;const editor=$('pdfNoteEditor');if(editor){editor.innerHTML='';$('modalPdfNoteEditor').style.display='flex';setTimeout(()=>editor.focus(),0)}else{const note=prompt('Escreva sua anotação:','');if(note!==null&&note.trim())saveAnnotation('note',note.trim())}}`,`promptNote`);
  s=replaceOnce(s,/async function exportToNotes\(\)\{[^\n]*\}/,`function stripNoteHtml(value=''){const d=document.createElement('div');d.innerHTML=String(value||'');return (d.textContent||d.innerText||'').trim()}\nfunction safeFileName(value='anotacoes'){return String(value||'anotacoes').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9_-]+/gi,'_').replace(/^_+|_+$/g,'')||'anotacoes'}\nfunction downloadNoteFile(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}\nfunction exportAnnotations(format='txt'){const notes=state.annotations.filter(a=>a.annotation_type==='note');if(!notes.length)return alert('Ainda não existem anotações para exportar.');const title=state.doc?.title||'PDF';const base=safeFileName('Anotacoes_'+title);if(format==='doc'){const body=notes.map(a=>'<h3>Página '+a.page_number+'</h3><div>'+String(a.note_text||'')+'</div>').join('<hr>');const html='<!doctype html><html><head><meta charset="utf-8"><title>Anotações — '+esc(title)+'</title></head><body><h1>Anotações — '+esc(title)+'</h1>'+body+'</body></html>';downloadNoteFile(new Blob(['\\ufeff',html],{type:'application/msword;charset=utf-8'}),base+'.doc');status('Anotações exportadas em DOC.');return}const text='PDF: '+title+'\\n\\n'+notes.map(a=>'Página '+a.page_number+'\\n'+stripNoteHtml(a.note_text||'')).join('\\n\\n');downloadNoteFile(new Blob(['\\ufeff',text],{type:'text/plain;charset=utf-8'}),base+'.txt');status('Anotações exportadas em TXT.')}\nasync function exportToNotes(){exportAnnotations('txt')}`,'exportToNotes');
  s=s.replace(/esc\(a\.note_text\|\|'Anotação'\)/g,"esc(stripNoteHtml(a.note_text||'Anotação'))");
  const helpers=`function formatPdfNote(command,value=null){const editor=$('pdfNoteEditor');if(!editor)return;editor.focus();document.execCommand(command,false,value)}\nfunction setPdfNoteFontSize(value){const editor=$('pdfNoteEditor');if(!editor)return;editor.focus();document.execCommand('fontSize',false,String(value||3))}\nfunction closePdfNoteEditor(){if($('modalPdfNoteEditor'))$('modalPdfNoteEditor').style.display='none'}\nasync function savePdfNoteEditor(){const editor=$('pdfNoteEditor');if(!editor)return;const html=editor.innerHTML.trim(),plain=stripNoteHtml(html);if(!plain)return alert('Digite o conteúdo da anotação.');closePdfNoteEditor();await saveAnnotation('note',html)}\n`;
  if(!s.includes('function formatPdfNote')) s=replaceOnce(s,/function openNativeTab\(\)\{/,helpers+'function openNativeTab(){','Reader helper insertion');
  s=replaceOnce(s,/global\.PdfStudyReader=Object\.freeze\(\{/,"global.PdfStudyReader=Object.freeze({formatPdfNote,setPdfNoteFontSize,closePdfNoteEditor,savePdfNoteEditor,exportAnnotations,",'Reader exports');
  write(p,s);
}

// 3) HTML: modal de folha e botões DOC/TXT.
{
  const p='public/index.html';
  let s=read(p);
  if(!s.includes('modalPdfNoteEditor')){
    const modal=`\n<div id="modalPdfNoteEditor" class="pdf-note-modal" style="display:none" role="dialog" aria-modal="true" aria-labelledby="pdfNoteEditorTitle"><div class="pdf-note-card"><div class="pdf-note-head"><div><h3 id="pdfNoteEditorTitle">Nova anotação</h3><p>Edite como em uma folha de estudos.</p></div><button type="button" class="btn btn-secondary btn-sm" onclick="PdfStudyReader.closePdfNoteEditor()">Fechar</button></div><div class="pdf-note-toolbar" role="toolbar" aria-label="Formatação da anotação"><button type="button" onclick="PdfStudyReader.formatPdfNote('bold')"><b>B</b></button><button type="button" onclick="PdfStudyReader.formatPdfNote('italic')"><i>I</i></button><button type="button" onclick="PdfStudyReader.formatPdfNote('underline')"><u>U</u></button><label>Tamanho <select onchange="PdfStudyReader.setPdfNoteFontSize(this.value)"><option value="2">Pequeno</option><option value="3" selected>Normal</option><option value="4">Grande</option><option value="5">Título</option></select></label></div><div id="pdfNoteEditor" class="pdf-note-paper" contenteditable="true" spellcheck="true" aria-label="Conteúdo da anotação"></div><div class="pdf-note-actions"><button type="button" class="btn btn-secondary" onclick="PdfStudyReader.closePdfNoteEditor()">Cancelar</button><button type="button" class="btn btn-primary" onclick="PdfStudyReader.savePdfNoteEditor()">Salvar anotação</button></div></div></div>\n`;
    s=s.replace('</body>',modal+'</body>');
  }
  s=s.replace(/<button([^>]*?)onclick="PdfStudyReader\.exportToNotes\(\)"([^>]*)>\s*Exportar\s*<\/button>/i,'<button$1onclick="PdfStudyReader.exportAnnotations(\'doc\')"$2>Exportar DOC</button><button class="pdf-reader-side-action" type="button" onclick="PdfStudyReader.exportAnnotations(\'txt\')">Exportar TXT</button>');
  write(p,s);
}

{
  const p='public/css/pdf-reader.css';
  let s=read(p);
  if(!s.includes('V10.24 — alinhamento do Reader')) s += `\n\n/* V10.24 — alinhamento do Reader e editor tipo folha. */\n.pdf-reader-selection-bar{display:grid!important;grid-template-columns:minmax(0,1fr) 360px!important;align-items:center!important}.pdf-reader-study-actions{justify-self:center;display:flex!important;align-items:center;justify-content:center;gap:8px}.pdf-reader-side-actions{display:flex!important;align-items:center!important;justify-content:center!important;gap:8px!important}.pdf-reader-side-action{min-width:104px}.pdf-note-modal{position:fixed;inset:0;z-index:3060;background:rgba(2,10,18,.76);align-items:center;justify-content:center;padding:18px}.pdf-note-card{width:min(780px,96vw);max-height:92vh;overflow:auto;background:#0b1c2a;border:1px solid #29445a;border-radius:18px;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.48)}.pdf-note-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.pdf-note-head h3,.pdf-note-head p{margin:0}.pdf-note-head p{color:#8fa6b8;margin-top:4px}.pdf-note-toolbar{display:flex;align-items:center;gap:7px;margin:14px 0 10px;flex-wrap:wrap}.pdf-note-toolbar button,.pdf-note-toolbar select{min-height:34px;border:1px solid #31506a;border-radius:8px;background:#10283a;color:#eff7fb;padding:6px 10px}.pdf-note-toolbar label{display:flex;align-items:center;gap:7px;color:#b7c9d6;font-size:.82rem}.pdf-note-paper{min-height:360px;background:#fff;color:#18212a;border-radius:6px;padding:34px 38px;line-height:1.65;font-size:16px;box-shadow:0 8px 28px rgba(0,0,0,.25) inset,0 8px 24px rgba(0,0,0,.18);outline:none;white-space:pre-wrap}.pdf-note-paper:focus{box-shadow:0 0 0 3px rgba(53,211,197,.25),0 8px 28px rgba(0,0,0,.18)}.pdf-note-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:12px}@media(max-width:900px){.pdf-reader-selection-bar{grid-template-columns:1fr!important}.pdf-reader-study-actions{justify-self:center}.pdf-note-paper{min-height:300px;padding:24px}}@media(max-width:700px){.pdf-reader-study-actions{overflow-x:auto;justify-content:flex-start;width:100%}.pdf-note-card{padding:12px}.pdf-note-paper{min-height:260px;padding:18px}.pdf-note-actions{flex-direction:column-reverse}.pdf-note-actions .btn{width:100%}}\n`;
  write(p,s);
}

// 4) Versão coerente.
for(const p of ['package.json','public/version.json','public/sw.js','public/index.html','src/index.js']){
  if(!fs.existsSync(p))continue;let s=read(p);s=s.replaceAll('10.23.0','10.24.0');write(p,s);
}

// 5) Atualiza teste legado para a nova regra de exportação sem vínculo.
{
  const p='tests/pdf-context-integrity.test.cjs';
  let s=read(p);
  s=s.replace(/assert\.match\(r,\/if\\\(!link\\\)return alert\\\('Vincule este PDF ao concurso atual antes de exportar para Anotações\\\.'\/\);/,"assert.doesNotMatch(r,/Vincule este PDF ao concurso atual antes de exportar/);assert.match(r,/function exportAnnotations\\(format='txt'\\)/);");
  write(p,s);
}

// 6) Teste específico de regressão.
const test=`const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');\nconst r=p=>fs.readFileSync(p,'utf8');\ntest('v10.24 biblioteca e reader',()=>{const lib=r('public/js/pdf/pdf-library-ui.js'),lc=r('public/css/pdf-library.css'),reader=r('public/js/pdf/pdf-reader.js'),rc=r('public/css/pdf-reader.css'),html=r('public/index.html'),pkg=require('../package.json');assert.equal(pkg.version,'10.24.0');assert.match(lib,/pdf-library-card-action/);assert.match(lib,/scrollLibraryStartV1024/);assert.match(lc,/pdf-library-filter-row-v1024/);assert.doesNotMatch(reader,/Vincule este PDF ao concurso atual antes de exportar/);assert.match(reader,/function exportAnnotations\\(format='txt'\\)/);assert.match(reader,/function savePdfNoteEditor/);assert.match(reader,/Object\\.freeze\\(\\{formatPdfNote,setPdfNoteFontSize,closePdfNoteEditor,savePdfNoteEditor,exportAnnotations,/);assert.match(html,/modalPdfNoteEditor/);assert.match(html,/Exportar DOC/);assert.match(html,/Exportar TXT/);assert.match(rc,/pdf-note-paper/);});\n`;
write('tests/library-reader-v10-24.test.cjs',test);
console.log('V10.24 migration applied.');

// Migração temporária v10.24.1 — já aplicada; mantida apenas até o merge para rastreabilidade.
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);
const must=(cond,msg)=>{if(!cond)throw new Error(msg)};

for(const p of ['package.json','public/version.json','public/sw.js','src/index.js']){
  if(!fs.existsSync(p)) continue;
  write(p,read(p).replaceAll('10.24.0','10.24.1'));
}

{
  const p='public/css/pdf-library.css';
  let s=read(p);
  if(!s.includes('V10.24.1 — correção de contenção')) s += `\n\n/* V10.24.1 — correção de contenção dos botões dos cards. */\n.pdf-card-actions{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.25fr)!important;gap:10px!important;align-items:stretch!important}.pdf-card-actions .pdf-library-card-action{box-sizing:border-box!important;width:100%!important;min-width:0!important;max-width:100%!important;min-height:44px!important;padding:8px 10px!important;display:flex!important;align-items:center!important;justify-content:center!important;white-space:normal!important;overflow:hidden!important;text-overflow:clip!important;line-height:1.15!important;font-size:clamp(.72rem,.86vw,.92rem)!important;text-align:center!important}.pdf-card-actions .pdf-library-card-delete{white-space:normal!important}@media(max-width:1180px){.pdf-card-actions{grid-template-columns:1fr 1fr!important}.pdf-card-actions .pdf-library-card-delete{grid-column:1/-1!important}}@media(max-width:700px){.pdf-card-actions{grid-template-columns:1fr!important}.pdf-card-actions .pdf-library-card-delete{grid-column:auto!important}.pdf-card-actions .pdf-library-card-action{font-size:.9rem!important}}\n`;
  write(p,s);
}

{
  const p='public/css/pdf-reader.css';
  let s=read(p);
  if(!s.includes('V10.24.1 — painel Marcações')) s += `\n\n/* V10.24.1 — painel Marcações conforme referência aprovada. */\n.pdf-reader-side{box-sizing:border-box!important;overflow:hidden!important}.pdf-reader-side-head{padding-left:22px!important;padding-right:22px!important}.pdf-reader-side-list{box-sizing:border-box!important;padding:18px 22px 28px!important;overflow-x:hidden!important}.pdf-reader-side-list>*{max-width:100%!important;box-sizing:border-box!important}.pdf-reader-side-list .pdf-reader-annotation-item,.pdf-reader-side-list .pdf-reader-mark-item,.pdf-reader-side-list [class*="annotation"],.pdf-reader-side-list [class*="mark"]{padding:16px 20px!important;margin-left:0!important;margin-right:0!important;overflow-wrap:anywhere!important;word-break:normal!important}.pdf-reader-side-actions{box-sizing:border-box!important;width:100%!important;padding:14px 22px 16px!important;display:flex!important;justify-content:center!important;align-items:center!important;gap:12px!important;overflow:visible!important}.pdf-reader-side-actions>.pdf-reader-side-action{flex:0 1 180px!important;width:auto!important;min-width:140px!important;max-width:190px!important;box-sizing:border-box!important}.pdf-export-menu-wrap{position:relative!important;flex:0 1 180px!important;max-width:190px!important}.pdf-export-menu-wrap>.pdf-reader-side-action{width:100%!important}.pdf-export-menu{position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%);z-index:30;min-width:180px;padding:8px;background:#10283a;border:1px solid #31506a;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.35)}.pdf-export-menu[hidden]{display:none!important}.pdf-export-menu button{width:100%;padding:10px 12px;border:0;border-radius:7px;background:transparent;color:#eef6fb;text-align:left;cursor:pointer}.pdf-export-menu button:hover,.pdf-export-menu button:focus{background:rgba(255,255,255,.08);outline:none}@media(max-width:700px){.pdf-reader-side-head{padding-left:16px!important;padding-right:16px!important}.pdf-reader-side-list{padding:16px!important}.pdf-reader-side-list .pdf-reader-annotation-item,.pdf-reader-side-list .pdf-reader-mark-item,.pdf-reader-side-list [class*="annotation"],.pdf-reader-side-list [class*="mark"]{padding:14px 16px!important}.pdf-reader-side-actions{padding:12px 16px 16px!important;display:grid!important;grid-template-columns:1fr!important;justify-items:stretch!important}.pdf-reader-side-actions>.pdf-reader-side-action,.pdf-export-menu-wrap{width:100%!important;max-width:none!important;min-width:0!important}.pdf-export-menu{left:0;right:0;bottom:calc(100% + 8px);transform:none;min-width:0;width:100%}}\n`;
  write(p,s);
}

{
  const p='public/index.html';
  let s=read(p);
  const re=/<div class="pdf-reader-side-actions">\s*<button class="pdf-reader-side-action primary" onclick="PdfStudyReader\.exportAnnotations\('doc'\)"[^>]*>[^<]*Exportar DOC<\/button><button class="pdf-reader-side-action" type="button" onclick="PdfStudyReader\.exportAnnotations\('txt'\)"[^>]*>[^<]*Exportar TXT<\/button>\s*<button class="pdf-reader-side-action" onclick="PdfStudyReader\.importNotes\(\)"[^>]*>[^<]*Importar<\/button>\s*<\/div>/;
  const replacement=`<div class="pdf-reader-side-actions"><div class="pdf-export-menu-wrap"><button id="pdfExportMenuButton" class="pdf-reader-side-action primary" type="button" aria-haspopup="menu" aria-expanded="false" onclick="PdfStudyReader.toggleExportMenu()">↑ Exportar⌄</button><div id="pdfExportMenu" class="pdf-export-menu" role="menu" hidden><button type="button" role="menuitem" onclick="PdfStudyReader.exportFromMenu('doc')">Exportar como DOC</button><button type="button" role="menuitem" onclick="PdfStudyReader.exportFromMenu('txt')">Exportar como TXT</button></div></div><button class="pdf-reader-side-action" onclick="PdfStudyReader.importNotes()" title="Importar anotações da matéria">↓ Importar</button></div>`;
  const next=s.replace(re,replacement);
  if(s.includes('pdfExportMenuButton')) write(p,s); else { must(next!==s,'Bloco de exportação v10.24 não encontrado'); write(p,next); }
}

{
  const p='public/js/pdf/pdf-reader.js';
  let s=read(p);
  const anchor="function exportAnnotations(format='txt')";
  must(s.includes(anchor),'exportAnnotations não localizada');
  if(!s.includes('function toggleExportMenu')){
    const helpers=`function closeExportMenu(){const menu=$('pdfExportMenu'),btn=$('pdfExportMenuButton');if(menu)menu.hidden=true;if(btn)btn.setAttribute('aria-expanded','false')}\nfunction toggleExportMenu(){const menu=$('pdfExportMenu'),btn=$('pdfExportMenuButton');if(!menu||!btn)return;const open=menu.hidden;menu.hidden=!open;btn.setAttribute('aria-expanded',open?'true':'false')}\nfunction exportFromMenu(format){closeExportMenu();exportAnnotations(format)}\n`;
    s=s.replace(anchor,helpers+anchor);
    s=s.replace('global.PdfStudyReader=Object.freeze({','global.PdfStudyReader=Object.freeze({toggleExportMenu,closeExportMenu,exportFromMenu,');
  }
  write(p,s);
}

{
  const p='tests/library-reader-v10-24.test.cjs';
  let s=read(p).replace("assert.equal(pkg.version,'10.24.0')","assert.equal(pkg.version,'10.24.1')");
  s=s.replace("assert.match(html,/Exportar DOC/);assert.match(html,/Exportar TXT/);","assert.match(html,/pdfExportMenuButton/);assert.match(html,/Exportar como DOC/);assert.match(html,/Exportar como TXT/);");
  s=s.replace("assert.match(reader,/Object\\.freeze\\(\\{formatPdfNote,setPdfNoteFontSize,closePdfNoteEditor,savePdfNoteEditor,exportAnnotations,/);","assert.match(reader,/Object\\.freeze\\(\\{[^}]*formatPdfNote[^}]*exportAnnotations/);");
  write(p,s);
}

if(!fs.existsSync('tests/v10-24-1-layout-fix.test.cjs')) write('tests/v10-24-1-layout-fix.test.cjs',`const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const r=p=>fs.readFileSync(p,'utf8');test('v10.24.1 layout aprovado',()=>{const lib=r('public/css/pdf-library.css'),rc=r('public/css/pdf-reader.css'),html=r('public/index.html'),reader=r('public/js/pdf/pdf-reader.js'),pkg=require('../package.json');assert.equal(pkg.version,'10.24.1');assert.match(lib,/minmax\\(0,1fr\\) minmax\\(0,1fr\\) minmax\\(0,1\\.25fr\\)/);assert.match(lib,/white-space:normal/);assert.match(html,/pdfExportMenuButton/);assert.match(html,/Exportar como DOC/);assert.match(html,/Exportar como TXT/);assert.match(reader,/function toggleExportMenu/);assert.match(reader,/function exportFromMenu/);assert.match(rc,/pdf-reader-side-list\\{[^}]*padding:18px 22px 28px/);assert.match(rc,/pdf-reader-side-actions\\{[^}]*justify-content:center/);assert.match(rc,/@media\\(max-width:700px\\)/);});\n`);
console.log('V10.24.1 layout fix verified.');

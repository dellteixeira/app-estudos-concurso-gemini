// Migração temporária v10.24.2 — funcionalidade já aplicada; este arquivo será removido após o merge.
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);

for(const p of ['package.json','public/version.json','public/sw.js','src/index.js']){
  if(!fs.existsSync(p)) continue;
  write(p,read(p).replaceAll('10.24.1','10.24.2'));
}

{
  const p='public/js/pdf/pdf-library-ui.js';
  let s=read(p);
  s=s.replace(/>Visualizar PDF<\/button>/g,'>Visualizar</button>');
  s=s.replace(/>Excluir da Biblioteca<\/button>/g,'>Excluir</button>');
  write(p,s);
}

{
  const p='public/css/pdf-library.css';
  let s=read(p);
  if(!s.includes('V10.24.2 — botões compactos')) s += `\n\n/* V10.24.2 — botões compactos conforme referência visual aprovada. */\n.pdf-card-actions{grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,.9fr)!important;gap:10px!important}.pdf-card-actions .pdf-library-card-action{min-height:38px!important;padding:7px 9px!important;font-size:clamp(.68rem,.72vw,.8rem)!important;font-weight:600!important;line-height:1.1!important;white-space:nowrap!important}.pdf-card-actions .pdf-library-card-delete{font-weight:600!important}@media(max-width:1180px){.pdf-card-actions{grid-template-columns:repeat(3,minmax(0,1fr))!important}.pdf-card-actions .pdf-library-card-delete{grid-column:auto!important}}@media(max-width:760px){.pdf-card-actions{grid-template-columns:1fr 1fr!important}.pdf-card-actions .pdf-library-card-delete{grid-column:1/-1!important}.pdf-card-actions .pdf-library-card-action{font-size:.78rem!important}}@media(max-width:520px){.pdf-card-actions{grid-template-columns:1fr!important}.pdf-card-actions .pdf-library-card-delete{grid-column:auto!important}}\n`;
  write(p,s);
}

{
  const p='public/css/pdf-reader.css';
  let s=read(p);
  if(!s.includes('V10.24.2 — respiro do painel')) s += `\n\n/* V10.24.2 — respiro e alinhamento do painel Marcações. */\n.pdf-reader-body{grid-template-columns:minmax(0,1fr) 382px!important}.pdf-reader-side{margin:12px 14px 12px 10px!important;border:1px solid #20384b!important;border-radius:14px!important;overflow:hidden!important;box-shadow:0 10px 28px rgba(0,0,0,.18)!important}.pdf-reader-side-head{padding:18px 22px!important}.pdf-reader-side-list{padding:20px 22px 30px!important}.pdf-reader-side-section{gap:14px!important}.pdf-reader-side-section h4{margin:0 0 2px!important}.pdf-reader-side-item{margin:0!important;border-radius:14px!important}.pdf-reader-side-main{padding:16px 18px!important;gap:8px!important}.pdf-reader-side-main span{font-size:.78rem!important}.pdf-reader-side-main strong{font-size:.82rem!important;line-height:1.5!important;font-weight:600!important}.pdf-reader-side-actions{padding:16px 22px 18px!important;justify-content:center!important;gap:14px!important}.pdf-reader-side-actions>.pdf-reader-side-action,.pdf-export-menu-wrap{flex:0 1 185px!important;max-width:200px!important}.pdf-reader-side-action{font-weight:600!important}@media(max-width:900px){.pdf-reader-body{grid-template-columns:minmax(0,1fr) 330px!important}.pdf-reader-side{margin:10px 10px 10px 8px!important}}@media(max-width:700px){.pdf-reader-body{grid-template-columns:1fr!important}.pdf-reader-side{right:12px!important;top:108px!important;bottom:12px!important;width:min(calc(100vw - 24px),340px)!important;margin:0!important;border-radius:14px!important}.pdf-reader-side-head{padding:16px!important}.pdf-reader-side-list{padding:18px 16px 24px!important}.pdf-reader-side-main{padding:14px 16px!important}.pdf-reader-side-actions{padding:14px 16px 16px!important;gap:10px!important}.pdf-reader-side-actions>.pdf-reader-side-action,.pdf-export-menu-wrap{max-width:none!important;width:100%!important}.pdf-reader-side-action{font-size:.72rem!important}}\n`;
  write(p,s);
}

for(const p of ['tests/v10-24-1-layout-fix.test.cjs','tests/library-reader-v10-24.test.cjs']){
  if(!fs.existsSync(p)) continue;
  write(p,read(p).replaceAll("'10.24.1'","'10.24.2'").replaceAll('"10.24.1"','"10.24.2"'));
}

{
  const p='tests/pdf-library.test.cjs';
  if(fs.existsSync(p)){
    let s=read(p);
    s=s.replace('assert.match(u,/Visualizar PDF/);','assert.match(u,/Visualizar<\\/button>/);');
    write(p,s);
  }
}

write('tests/v10-24-2-panel-buttons.test.cjs',`const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const r=p=>fs.readFileSync(p,'utf8');test('v10.24.2 painel e botões compactos',()=>{const lib=r('public/css/pdf-library.css'),ui=r('public/js/pdf/pdf-library-ui.js'),rc=r('public/css/pdf-reader.css'),pkg=require('../package.json');assert.equal(pkg.version,'10.24.2');assert.match(ui,/>Visualizar<\\/button>/);assert.match(ui,/>Excluir<\\/button>/);assert.doesNotMatch(ui,/>Visualizar PDF<\\/button>/);assert.doesNotMatch(ui,/>Excluir da Biblioteca<\\/button>/);assert.match(lib,/font-weight:600/);assert.match(lib,/font-size:clamp\\(\\.68rem,\\.72vw,\\.8rem\\)/);assert.match(rc,/grid-template-columns:minmax\\(0,1fr\\) 382px/);assert.match(rc,/margin:12px 14px 12px 10px/);assert.match(rc,/right:12px!important/);assert.match(rc,/width:min\\(calc\\(100vw - 24px\\),340px\\)/);});\n`);

console.log('V10.24.2 refinements applied.');

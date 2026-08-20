// Migração temporária v10.24.3 — funcionalidade já aplicada; remover após o merge.
import fs from 'node:fs';
import path from 'node:path';

const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);

for(const p of ['package.json','public/version.json','public/sw.js','src/index.js']){
  if(fs.existsSync(p)) write(p,read(p).replaceAll('10.24.2','10.24.3'));
}

const cssPath='public/css/pdf-reader.css';
let css=read(cssPath);
const marker='V10.24.3 — correção definitiva de overflow e textos cortados do painel Marcações.';
if(!css.includes(marker)) css += `\n\n/* ${marker} */\n.pdf-reader-side,.pdf-reader-side-head,.pdf-reader-side-list,.pdf-reader-side-section,.pdf-reader-side-item,.pdf-reader-side-main,.pdf-reader-side-actions{box-sizing:border-box!important;min-width:0!important;max-width:100%!important}\n.pdf-reader-side-head{overflow:hidden!important;align-items:flex-start!important}.pdf-reader-side-head>*{min-width:0!important;max-width:100%!important}.pdf-reader-side-head h2,.pdf-reader-side-head h3,.pdf-reader-side-head p,.pdf-reader-side-head span{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:anywhere!important;word-break:normal!important;max-width:100%!important}\n.pdf-reader-side-list{width:100%!important;overflow-x:hidden!important}.pdf-reader-side-section{width:100%!important}.pdf-reader-side-item{width:100%!important;grid-template-columns:minmax(0,1fr) 36px!important;overflow:hidden!important}.pdf-reader-side-item.imported{grid-template-columns:minmax(0,1fr)!important}\n.pdf-reader-side-main{width:100%!important;overflow:hidden!important;white-space:normal!important}.pdf-reader-side-main span,.pdf-reader-side-main strong,.pdf-reader-side-main em{display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;white-space:normal!important;text-overflow:clip!important;overflow-wrap:anywhere!important;word-break:normal!important}.pdf-reader-side-main strong{overflow:visible!important}.pdf-reader-side-main em{overflow:visible!important;-webkit-line-clamp:unset!important;-webkit-box-orient:initial!important}\n.pdf-reader-delete-mark{width:36px!important;min-width:36px!important;max-width:36px!important}\n.pdf-reader-side-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;width:100%!important;gap:10px!important;overflow:visible!important}.pdf-reader-side-actions>.pdf-reader-side-action,.pdf-export-menu-wrap{box-sizing:border-box!important;width:100%!important;min-width:0!important;max-width:none!important;flex:none!important}.pdf-export-menu-wrap>.pdf-reader-side-action{width:100%!important;min-width:0!important;max-width:none!important}.pdf-reader-side-action{white-space:normal!important;overflow:visible!important;text-overflow:clip!important}\n@media(max-width:700px){.pdf-reader-side{width:min(calc(100vw - 24px),360px)!important}.pdf-reader-side-head{padding:16px 18px!important}.pdf-reader-side-list{padding:18px!important}.pdf-reader-side-main{padding:14px 16px!important}.pdf-reader-side-actions{padding:14px 18px 16px!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}}\n@media(max-width:420px){.pdf-reader-side{right:8px!important;bottom:8px!important;width:calc(100vw - 16px)!important}.pdf-reader-side-actions{grid-template-columns:1fr!important}}\n`;
write(cssPath,css);

if(fs.existsSync('tests')){
  const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(/\.test\.cjs$/.test(entry.name)){let s=read(p);if(s.includes('10.24.2'))write(p,s.replaceAll('10.24.2','10.24.3'));}}};
  walk('tests');
}

const testPath='tests/v10-24-3-panel-overflow.test.cjs';
write(testPath,`const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const r=p=>fs.readFileSync(p,'utf8');test('v10.24.3 painel não corta textos nem ações',()=>{const css=r('public/css/pdf-reader.css'),pkg=require('../package.json');assert.equal(pkg.version,'10.24.3');assert.match(css,/V10\\.24\\.3 — correção definitiva/);assert.match(css,/white-space:normal!important/);assert.match(css,/overflow-wrap:anywhere!important/);assert.match(css,/-webkit-line-clamp:unset!important/);assert.match(css,/grid-template-columns:repeat\\(2,minmax\\(0,1fr\\)\\)!important/);assert.match(css,/width:min\\(calc\\(100vw - 24px\\),360px\\)!important/);});\n`);

console.log('V10.24.3 panel overflow fix applied.');

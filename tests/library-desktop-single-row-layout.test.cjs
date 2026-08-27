const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const layout=fs.readFileSync(path.join(__dirname,'..','public','js','pdf','pdf-library-layout-fix.js'),'utf8');
const adapter=fs.readFileSync(path.join(__dirname,'..','public','js','pdf','pdf-library-opfs-adapter.js'),'utf8');
test('painel offline fica fora da barra de filtros',()=>{assert.match(layout,/filters\.insertAdjacentElement\('afterend', panel\)/)});
test('desktop usa três ações e três filtros harmônicos',()=>{assert.match(layout,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);assert.doesNotMatch(layout,/pdfAssuntoFilter/)});
test('controles offline restantes ficam em uma linha',()=>{assert.match(layout,/grid-template-columns:max-content minmax\(220px,1fr\) auto!important/)});
test('layout não mantém linha própria obsoleta para Selecionar',()=>{assert.doesNotMatch(layout,/pdf-library-selection-row/);assert.doesNotMatch(layout,/btnPdfSelectionMode/)});
test('tablet e mobile preservam rolagem e alvos de toque',()=>{assert.match(layout,/@media \(max-width:1100px\)/);assert.match(layout,/overflow-x:auto!important/)});
test('adapter carrega a correção de layout',()=>{assert.match(adapter,/pdf-library-layout-fix\.js/);assert.match(adapter,/ui\.onload = loadLayoutFix/)});

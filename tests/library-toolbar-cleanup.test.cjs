const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const index=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const ui=fs.readFileSync(path.join(root,'public/js/pdf/pdf-library-ui.js'),'utf8');
const appUi=fs.readFileSync(path.join(root,'public/js/app-ui.js'),'utf8');
const ordering=fs.readFileSync(path.join(root,'public/js/pdf/pdf-library-ordering.js'),'utf8');
const layout=fs.readFileSync(path.join(root,'public/js/pdf/pdf-library-layout-fix.js'),'utf8');

test('Biblioteca não exibe nome do concurso nem controles de Workspace no cabeçalho',()=>{
  assert.doesNotMatch(index,/id="pdfLibraryContestName"/);
  assert.doesNotMatch(index,/id="pdfWorkspaceFilter"/);
  assert.doesNotMatch(index,/data-call="PdfStudyLibraryUI\.openWorkspaceModal"/);
  assert.doesNotMatch(index,/>\+ Workspace</);
  assert.doesNotMatch(index,/>Todos os Workspaces</);
});

test('handler visual do filtro Workspace foi removido',()=>{
  assert.doesNotMatch(ui,/onWorkspaceFilterChange/);
  assert.doesNotMatch(ui,/'pdfWorkspaceFilter'/);
  assert.doesNotMatch(appUi,/onWorkspaceFilterChange/);
});

test('barra de ações e filtros usam quatro posições',()=>{
  assert.match(ordering,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(layout,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
});

test('ordem funcional permanece Atualizar, Adicionar, Ordenar, Selecionar',()=>{
  const update=index.indexOf('PdfStudyLibraryUI.refresh');
  const add=index.indexOf('PdfStudyLibraryUI.openUploadModal');
  const select=index.indexOf('id="btnPdfSelectionMode"');
  assert.ok(update>=0&&add>update&&select>add);
  assert.match(ordering,/actions\.insertBefore\(wrap,selectBtn\)/);
});

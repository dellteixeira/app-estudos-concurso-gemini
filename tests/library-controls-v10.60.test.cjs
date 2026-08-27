// Final regression contract for Biblioteca controls v10.60.0.
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
const offlineUi=fs.readFileSync(path.join(root,'public/js/pdf/pdf-offline-library-ui.js'),'utf8');
const offlineManager=fs.readFileSync(path.join(root,'public/js/pdf/pdf-offline-library-manager.js'),'utf8');

test('Selecionar fica imediatamente antes da área de seleção e da grade de PDFs',()=>{
  const select=index.indexOf('id="btnPdfSelectionMode"');
  const bulk=index.indexOf('id="pdfBulkToolbar"');
  const grid=index.indexOf('id="pdfLibraryGrid"');
  assert.ok(select>=0&&bulk>select&&grid>bulk);
  assert.match(index,/class="pdf-library-selection-row"/);
  const heroStart=index.indexOf('class="pdf-library-actions"');
  const filtersStart=index.indexOf('class="pdf-library-filters"');
  assert.ok(select>filtersStart&&select>heroStart);
});

test('Biblioteca remove o filtro Todos os assuntos e seu handler visual',()=>{
  assert.doesNotMatch(index,/id="pdfAssuntoFilter"/);
  assert.doesNotMatch(index,/>Todos os assuntos</);
  assert.doesNotMatch(ui,/onAssuntoFilterChange/);
  assert.doesNotMatch(appUi,/onAssuntoFilterChange/);
  assert.doesNotMatch(appUi,/'ih-018'/);
});

test('ações e filtros restantes usam três posições harmônicas',()=>{
  assert.match(ordering,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(layout,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.doesNotMatch(layout,/#pdfAssuntoFilter/);
});

test('Biblioteca Offline não expõe limite nem pausa manual',()=>{
  assert.doesNotMatch(offlineUi,/id="pdfOfflineLimit"/);
  assert.doesNotMatch(offlineUi,/id="pdfOfflinePauseBtn"/);
  assert.doesNotMatch(offlineUi,/pdf-offline-limit-wrap/);
  assert.doesNotMatch(offlineUi,/setLimitMb/);
  assert.doesNotMatch(offlineManager,/function setLimitMb/);
  assert.doesNotMatch(offlineManager,/function pause\(/);
  assert.doesNotMatch(offlineManager,/function resume\(/);
});

test('política offline fica sem limite artificial e ação principal chama Enviar',()=>{
  assert.match(offlineUi,/id="pdfOfflineSyncBtn"[^>]*>Enviar<\/button>/);
  assert.match(offlineManager,/const configured=Number\.POSITIVE_INFINITY/);
  assert.doesNotMatch(offlineManager,/DEFAULT_LIMIT_MB_/);
});

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const ordering = fs.readFileSync(path.join(root, 'public/js/pdf/pdf-library-ordering.js'), 'utf8');
const offlineUi = fs.readFileSync(path.join(root, 'public/js/pdf/pdf-offline-library-ui.js'), 'utf8');

test('Ordenar é movido para a barra de ações antes de Selecionar', () => {
  assert.match(ordering, /actions\.insertBefore\(wrap,selectBtn\)/);
  assert.match(ordering, /pdf-library-sort-control--actions/);
});

test('ações da Biblioteca usam cinco colunas iguais e terminam em Selecionar', () => {
  assert.match(ordering, /\.pdf-library-actions\{display:grid!important;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
  assert.match(ordering, /width:min\(760px,100%\)!important;margin-left:auto!important/);
  assert.match(ordering, /selectBtn\.style\.width='100%'/);
  assert.match(ordering, /addBtn\.style\.width='100%'/);
  assert.match(ordering, /addBtn\.classList\.remove\('btn-primary'\)/);
  assert.match(ordering, /addBtn\.classList\.add\('btn-secondary'\)/);
});

test('filtros distribuem igualmente a largura e terminam em Todos os assuntos', () => {
  assert.match(offlineUi, /\.pdf-library-filters\{display:flex!important;grid-template-columns:none!important;flex-wrap:nowrap!important/);
  assert.match(offlineUi, /\.pdf-library-filters>\*\{flex:1 1 0!important;min-width:0!important;width:0!important/);
  assert.match(offlineUi, /#pdfAssuntoFilter\{flex:1 1 0!important;width:0!important;min-width:0!important\}/);
});

test('Preparar agora e Pausar usam o mesmo estilo e dimensão', () => {
  assert.match(offlineUi, /id="pdfOfflineSyncBtn"[^>]*class="btn btn-secondary"|class="btn btn-secondary"[^>]*id="pdfOfflineSyncBtn"/);
  assert.match(offlineUi, /id="pdfOfflinePauseBtn"[^>]*class="btn btn-secondary"|class="btn btn-secondary"[^>]*id="pdfOfflinePauseBtn"/);
  assert.match(offlineUi, /#pdfOfflineSyncBtn,#pdfOfflinePauseBtn/);
  assert.match(offlineUi, /width:118px/);
});

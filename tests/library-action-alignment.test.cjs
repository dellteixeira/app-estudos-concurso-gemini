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

test('Adicionar PDFs recebe o mesmo estilo e largura de Selecionar', () => {
  assert.match(ordering, /addBtn\.classList\.remove\('btn-primary'\)/);
  assert.match(ordering, /addBtn\.classList\.add\('btn-secondary'\)/);
  assert.match(ordering, /selectBtn\.style\.width=`\$\{width\}px`/);
  assert.match(ordering, /addBtn\.style\.width=`\$\{width\}px`/);
});

test('Preparar agora e Pausar usam o mesmo estilo e dimensão', () => {
  assert.match(offlineUi, /id="pdfOfflineSyncBtn"[^>]*class="btn btn-secondary"|class="btn btn-secondary"[^>]*id="pdfOfflineSyncBtn"/);
  assert.match(offlineUi, /id="pdfOfflinePauseBtn"[^>]*class="btn btn-secondary"|class="btn btn-secondary"[^>]*id="pdfOfflinePauseBtn"/);
  assert.match(offlineUi, /#pdfOfflineSyncBtn,#pdfOfflinePauseBtn/);
  assert.match(offlineUi, /width:118px/);
});

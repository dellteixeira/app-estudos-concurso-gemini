const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'pdf', 'pdf-offline-library-ui.js'), 'utf8');

test('filtros da Biblioteca permanecem em uma única linha com scroll horizontal', () => {
  assert.match(source, /\.pdf-library-filters\{display:flex!important;grid-template-columns:none!important;flex-wrap:nowrap!important/);
  assert.match(source, /overflow-x:auto/);
  assert.match(source, /-webkit-overflow-scrolling:touch/);
  assert.match(source, /#pdfLibrarySearch\{width:260px!important;min-width:260px!important\}/);
  assert.match(source, /\.pdf-library-sort-control\{width:210px!important;min-width:210px!important;grid-column:auto!important\}/);
});

test('controles offline ficam no mesmo trilho horizontal', () => {
  assert.match(source, /\.pdf-offline-controls\{display:flex;flex-wrap:nowrap/);
  assert.match(source, /class=\"pdf-offline-controls\" aria-label=\"Controles da Biblioteca Offline\"/);
  const controlsStart = source.indexOf('class="pdf-offline-controls" aria-label="Controles da Biblioteca Offline"');
  const controlsEnd = source.indexOf('</div>\n    <div class="pdf-offline-progress">', controlsStart);
  const controlsMarkup = source.slice(controlsStart, controlsEnd);
  assert.match(controlsMarkup, /id=\"pdfOfflineLimit\"/);
  assert.match(controlsMarkup, /id=\"pdfOfflineWifiOnly\"/);
  assert.match(controlsMarkup, /id=\"pdfOfflineSyncBtn\"/);
  assert.match(controlsMarkup, /id=\"pdfOfflinePauseBtn\"/);
  assert.match(controlsMarkup, /id=\"pdfOfflineCancelBtn\"/);
});

test('mobile mantém alvos de toque e usa scroll em vez de quebrar linha', () => {
  assert.match(source, /@media\(max-width:700px\)/);
  assert.match(source, /\.pdf-offline-actions button\{min-height:44px;min-width:116px\}/);
  assert.doesNotMatch(source, /\.pdf-offline-controls\{grid-template-columns:1fr/);
});

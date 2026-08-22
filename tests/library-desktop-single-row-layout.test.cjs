const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const layout = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'pdf', 'pdf-library-layout-fix.js'), 'utf8');
const adapter = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'pdf', 'pdf-library-opfs-adapter.js'), 'utf8');

test('painel offline é reposicionado para fora da barra de filtros', () => {
  assert.match(layout, /document\.querySelector\('\.pdf-library-filters'\)/);
  assert.match(layout, /filters\.insertAdjacentElement\('afterend', panel\)/);
});

test('desktop mantém filtros, visualização e ordenação em uma única linha', () => {
  assert.match(layout, /@media \(min-width:1101px\)/);
  assert.match(layout, /grid-template-columns:minmax\(220px,1\.35fr\).*minmax\(170px,\.82fr\)/s);
  assert.match(layout, /\.pdf-library-filters>\*\{min-width:0!important;width:100%!important/);
});

test('controles offline ficam em uma única linha no desktop', () => {
  assert.match(layout, /grid-template-columns:minmax\(170px,210px\) max-content minmax\(220px,1fr\) auto!important/);
  assert.match(layout, /\.pdf-offline-actions\{display:flex!important;flex-wrap:nowrap!important/);
});

test('tablet e mobile preservam linha única com rolagem horizontal', () => {
  assert.match(layout, /@media \(max-width:1100px\)/);
  assert.match(layout, /\.pdf-library-filters[\s\S]*display:flex!important;[\s\S]*flex-wrap:nowrap!important;[\s\S]*overflow-x:auto!important/);
  assert.match(layout, /#pdfOfflineManager \.pdf-offline-controls[\s\S]*display:flex!important;[\s\S]*flex-wrap:nowrap!important;[\s\S]*overflow-x:auto!important/);
});

test('adapter carrega a correção depois da UI offline', () => {
  assert.match(adapter, /pdf-library-layout-fix\.js/);
  assert.match(adapter, /ui\.onload = loadLayoutFix/);
});

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

test('desktop usa cabeçalho em largura total e ações em quatro colunas harmônicas', () => {
  assert.match(layout, /@media \(min-width:1101px\)/);
  assert.match(layout, /\.pdf-library-hero[\s\S]*display:grid!important;[\s\S]*width:100%!important/);
  assert.match(layout, /\.pdf-library-actions[\s\S]*display:grid!important;[\s\S]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important;[\s\S]*gap:10px!important;[\s\S]*width:100%!important/);
  assert.match(layout, /\.pdf-library-actions>\.btn,[\s\S]*\.pdf-library-actions>\.pdf-library-sort-control[\s\S]*width:100%!important;[\s\S]*min-width:0!important;[\s\S]*max-width:none!important/);
});

test('desktop distribui exatamente os quatro filtros por toda a linha', () => {
  assert.match(layout, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(layout, /\.pdf-library-filters>\*[\s\S]*min-width:0!important;[\s\S]*width:100%!important/);
  assert.match(layout, /#pdfAssuntoFilter[\s\S]*width:100%!important;[\s\S]*min-width:0!important/);
});

test('controles offline ficam em uma única linha no desktop', () => {
  assert.match(layout, /grid-template-columns:minmax\(170px,210px\) max-content minmax\(220px,1fr\) auto!important/);
  assert.match(layout, /\.pdf-offline-actions\{display:flex!important;flex-wrap:nowrap!important/);
});

test('tablet e mobile preservam linhas roláveis e alvos de toque', () => {
  assert.match(layout, /@media \(max-width:1100px\)/);
  assert.match(layout, /\.pdf-library-actions[\s\S]*display:flex!important;[\s\S]*overflow-x:auto!important/);
  assert.match(layout, /\.pdf-library-filters[\s\S]*display:flex!important;[\s\S]*flex-wrap:nowrap!important;[\s\S]*overflow-x:auto!important/);
  assert.match(layout, /#pdfOfflineManager \.pdf-offline-controls[\s\S]*display:flex!important;[\s\S]*flex-wrap:nowrap!important;[\s\S]*overflow-x:auto!important/);
});

test('adapter carrega a correção depois da UI offline', () => {
  assert.match(adapter, /pdf-library-layout-fix\.js/);
  assert.match(adapter, /ui\.onload = loadLayoutFix/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const ui=fs.readFileSync('public/js/app-ui.js','utf8');
const pwa=fs.readFileSync('public/js/app-pwa.js','utf8');
const nav=fs.readFileSync('public/js/ui/navigation.js','utf8');
const contract=JSON.parse(fs.readFileSync('config/release-contract.json','utf8'));
const releaseVersion=String(contract.version).replace(/\\./g,'\\\\.');
const loader=fs.readFileSync('public/js/core/asset-loader.js','utf8');
const assets=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));
const perf=fs.readFileSync('public/js/performance-loader.js','utf8');
const report=fs.readFileSync('public/js/study-performance-report.js','utf8');

test('abas principais permanecem navegáveis sem depender do módulo de IA',()=>{
  assert.match(ui,/function switchTab\(tabId, btn, options = \{\}\)/);
  assert.match(ui,/window\.switchTab = switchTab/);
  assert.doesNotMatch(pwa,/window\.switchTab = switchTab/);
  for(const tab of ['tab-edital','tab-calendario','tab-flashcards','tab-anotacoes']){
    assert.match(html,new RegExp('data-tab="'+tab+'"'));
  }
});

test('Biblioteca foi removida integralmente da interface e navegação',()=>{
  assert.doesNotMatch(html,/tab-biblioteca|Biblioteca de Estudos|Leitor próprio · Biblioteca|pdfReaderOverlay|modalPdfWorkspace|modalPdfUpload|modalPdfLink/);
  assert.doesNotMatch(nav,/tab-biblioteca|pdf-library|PdfStudyLibraryUI/);
  assert.doesNotMatch(loader,/pdf-library|pdf-engine|PdfStudyReader|PdfStudyLibraryUI/);
});

test('manifestos não carregam mais assets da Biblioteca PDF',()=>{
  const flattened=Object.values(assets).filter(Array.isArray).flat().join('\n');
  assert.doesNotMatch(flattened,/\/js\/pdf\/|pdf-library\.css|pdf-reader\.css|pdf-mobile-card-actions\.css|vendor\/pdf(?:\.min\.js|_viewer\.min\.css|\.worker\.min\.js)/);
});

test('HTML não deixa componentes PDF vazarem no fim da página',()=>{
  assert.doesNotMatch(html,/Novo flashcard a partir do trecho|Personalizar marca-texto|Selecione diretamente no PDF/);
});


test('nenhum preload ou relatório tenta ressuscitar o leitor PDF removido',()=>{
  assert.doesNotMatch(perf,/pdf-library|PdfStudyLibraryUI|\.\/js\/pdf\//);
  assert.doesNotMatch(report,/PdfStudyReader|pdfReader|\.\/js\/pdf\//);
});

test('estilos críticos da interface são carregados diretamente no HTML',()=>{
  assert.match(html,/data-canonical-ui="1"/);
  assert.match(html,new RegExp(`responsive-polish-v${releaseVersion}\\.css[^>]*data-responsive-release-delta="1"`));
});


test('menu compacto usa roteador único para ações principais',()=>{
  assert.match(html,/data-action="sync-now"/);
  assert.match(html,/data-action="view-edital-pdf"/);
  assert.match(html,/data-change-action="import-json"/);
  assert.match(html,/data-action="analyze-edital-ai"/);
  assert.match(html,/data-action="json-ai-help"/);
  assert.doesNotMatch(html,/data-inline-click="ih-00[1245]"/);
  assert.doesNotMatch(html,/data-inline-change="ih-003"/);
  assert.match(nav,/'sync-now'/);
  assert.match(nav,/'view-edital-pdf'/);
  assert.match(nav,/'analyze-edital-ai'/);
  assert.match(nav,/'json-ai-help'/);
  assert.match(nav,/changeAction === 'import-json'/);
});

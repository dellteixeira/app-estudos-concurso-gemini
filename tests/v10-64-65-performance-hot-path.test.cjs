const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const core=fs.readFileSync('public/js/app-core.js','utf8');
const loader=fs.readFileSync('public/js/core/asset-loader.js','utf8');
const nav=fs.readFileSync('public/js/ui/navigation.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const pwa=fs.readFileSync('public/pwa-update.js','utf8');

test('startup nao carrega PDF nem Chart.js antecipadamente',()=>{
  assert.doesNotMatch(html,/src="\.\/vendor\/chart\.umd\.min\.js"/);
  assert.doesNotMatch(html,/src="\.\/js\/pdf\//);
  assert.doesNotMatch(html,/src="\.\/vendor\/pdf\.min\.js"/);
  assert.doesNotMatch(html,/href="\.\/css\/pdf-library\.css"/);
  assert.doesNotMatch(html,/href="\.\/css\/pdf-reader\.css"/);
  assert.doesNotMatch(html,/href="\.\/vendor\/pdf_viewer\.min\.css"/);
});

test('delta responsivo legado nao e carregado junto com a release atual',()=>{
  assert.doesNotMatch(html,/responsive-polish-v10\.64\.46\.css/);
});

test('asset loader registra recursos pesados sob demanda',()=>{
  assert.match(loader,/defineFeature\('charts'/);
  assert.match(loader,/defineFeature\('pdf-library'/);
  assert.match(loader,/\.\/js\/pdf\/pdf-library-ui\.js/);
});

test('Biblioteca PDF e carregada apenas ao navegar para a aba',()=>{
  assert.match(nav,/function ensurePdfLibraryRuntime/);
  assert.match(nav,/tabId === 'tab-biblioteca'/);
  assert.match(nav,/loadFeature\('pdf-library'\)/);
});

test('metadados e fila de sync usam cache em memoria',()=>{
  assert.match(core,/metadataCacheStorageKey/);
  assert.match(core,/metadataSerializedCache/);
  assert.match(core,/syncStateCacheKey/);
  assert.match(core,/syncStateSerializedCache/);
});

test('indice canonico de materias e assuntos e calculado uma vez por lista',()=>{
  assert.match(core,/function getCanonicalEditalIndex/);
  assert.match(core,/canonicalEditalIndexSource === editalItems/);
  assert.match(core,/assuntosByMateria/);
});

test('Chart.js e carregado apenas quando o grafico precisa renderizar',()=>{
  assert.match(core,/function ensureChartRuntime/);
  assert.match(core,/loadFeature\('charts'\)/);
});

test('service worker nao bloqueia install com assets opcionais',()=>{
  assert.match(sw,/primeOfflineAssets\(\{ requireCritical:true, includeOptional:false \}\)/);
  assert.match(sw,/includeOptional = true/);
});

test('precache opcional e adiado para idle depois da primeira tela',()=>{
  assert.match(pwa,/requestIdleCallback\(primeOffline/);
  assert.match(pwa,/timeout: 8000/);
});

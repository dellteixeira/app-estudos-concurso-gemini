const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const core=fs.readFileSync('public/js/app-core.js','utf8');
const loader=fs.readFileSync('public/js/core/asset-loader.js','utf8');
const nav=fs.readFileSync('public/js/ui/navigation.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const pwa=fs.readFileSync('public/pwa-update.js','utf8');

test('startup mantém orçamento enxuto de scripts e nao carrega recursos pesados',()=>{
  const eagerScripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match=>match[1]);
  const eagerStyles=[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(match=>match[1]);
  assert.ok(eagerScripts.length<=12,`scripts iniciais demais: ${eagerScripts.length}`);
  assert.ok(eagerStyles.length<=4,`styles iniciais demais: ${eagerStyles.length}`);
  assert.doesNotMatch(html,/src="\.\/vendor\/chart\.umd\.min\.js"/);
  assert.doesNotMatch(html,/src="\.\/js\/pdf\//);
  assert.doesNotMatch(html,/src="\.\/vendor\/pdf\.min\.js"/);
  assert.doesNotMatch(html,/href="\.\/css\/pdf-library\.css"/);
  assert.doesNotMatch(html,/href="\.\/css\/pdf-reader\.css"/);
  assert.doesNotMatch(html,/href="\.\/vendor\/pdf_viewer\.min\.css"/);
  assert.doesNotMatch(html,/src="\.\/js\/app-ai\.js"/);
  assert.doesNotMatch(html,/src="\.\/js\/core\/cognitive-profile/);
  assert.doesNotMatch(html,/src="\.\/js\/core\/study-optimization-engine\.js"/);
  assert.doesNotMatch(html,/src="\.\/js\/core\/predictive-adaptive-tutor\.js"/);
});

test('delta responsivo legado nao e carregado junto com a release atual',()=>{
  assert.doesNotMatch(html,/responsive-polish-v10\.64\.46\.css/);
});

test('asset loader registra recursos pesados sob demanda',()=>{
  assert.match(loader,/defineFeature\('charts'/);
  assert.match(loader,/defineFeature\('app-ai'/);
  assert.match(loader,/defineFeature\('pdf-library'/);
  assert.match(loader,/\.\/js\/pdf\/pdf-library-ui\.js/);
});

test('IA de edital e Biblioteca PDF sao carregadas apenas por demanda',()=>{
  assert.match(fs.readFileSync('public/js/app-pwa.js','utf8'),/function ensureAppAiRuntime/);
  assert.match(fs.readFileSync('public/js/app-pwa.js','utf8'),/loadFeature\('app-ai'\)/);
  assert.match(fs.readFileSync('public/js/app-ai.js','utf8'),/window\.AppAiRuntime/);
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

test('precache e features opcionais sao adiados para idle depois da primeira tela',()=>{
  assert.match(pwa,/requestIdleCallback\(primeOffline/);
  assert.match(pwa,/timeout: 8000/);
  assert.match(pwa,/function schedulePostLoadOptionalFeatures/);
  assert.match(pwa,/requestIdleCallback\(task, \{ timeout: 7000 \}\)/);
});

test('persistencia do edital evita escrita identica consecutiva',()=>{
  assert.match(core,/editalSerializedCacheKey/);
  assert.match(core,/serialized === editalSerializedCache/);
  assert.match(core,/return false/);
});

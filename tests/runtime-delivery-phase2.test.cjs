const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'public', 'index.html');
const deliveryPath = path.join(root, 'src', 'runtime-delivery.js');
const workerPath = path.join(root, 'src', 'worker.js');
const androidPreparePath = path.join(root, 'scripts', 'prepare-android-assets.mjs');

async function deliveryModule() {
  return import(`${pathToFileURL(deliveryPath).href}?test=${Date.now()}`);
}

test('phase 2 removes eager PDF and AI assets from delivered app shell', async () => {
  const { EAGER_FEATURE_STYLES, EAGER_FEATURE_SCRIPTS, stripEagerFeatureAssets } = await deliveryModule();
  const source = fs.readFileSync(indexPath, 'utf8');
  const optimized = stripEagerFeatureAssets(source);

  assert.ok(optimized.length < source.length, 'optimized app shell must be smaller');

  for (const href of EAGER_FEATURE_STYLES) {
    assert.match(source, new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(optimized, new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const src of EAGER_FEATURE_SCRIPTS) {
    assert.match(source, new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(optimized, new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(optimized, /\.\/js\/app-core\.js/);
  assert.match(optimized, /\.\/vendor\/supabase\.js/);
  assert.match(optimized, /\.\/vendor\/chart\.umd\.min\.js/);
});

test('phase 2 delivery transform is idempotent and limited to app shell paths', async () => {
  const { stripEagerFeatureAssets, isAppShellPath } = await deliveryModule();
  const source = fs.readFileSync(indexPath, 'utf8');
  const once = stripEagerFeatureAssets(source);
  const twice = stripEagerFeatureAssets(once);

  assert.equal(twice, once);
  assert.equal(isAppShellPath('/'), true);
  assert.equal(isAppShellPath('/index.html'), true);
  assert.equal(isAppShellPath('/manifest.json'), false);
  assert.equal(isAppShellPath('/api/ai/learning-diagnosis'), false);
});

test('web and Android delivery use the same app-shell transformation', () => {
  const worker = fs.readFileSync(workerPath, 'utf8');
  const androidPrepare = fs.readFileSync(androidPreparePath, 'utf8');

  assert.match(worker, /stripEagerFeatureAssets/);
  assert.match(worker, /isAppShellPath/);
  assert.match(worker, /x-painel-runtime-delivery/);
  assert.match(androidPrepare, /stripEagerFeatureAssets/);
  assert.match(androidPrepare, /App shell Android otimizado/);
});

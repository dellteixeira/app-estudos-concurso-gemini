const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const performancePath = path.join(root, 'public/js/performance-loader.js');
const navigationPath = path.join(root, 'public/js/ui/navigation.js');

function source(file) {
  return fs.readFileSync(file, 'utf8');
}

test('runtime phase 1 defines isolated feature bundles', () => {
  const code = source(performancePath);
  assert.doesNotThrow(() => new vm.Script(code));
  assert.match(code, /FEATURE_BUNDLES/);
  assert.match(code, /pdf:\s*Object\.freeze/);
  assert.match(code, /ai:\s*Object\.freeze/);
  assert.match(code, /reports:\s*Object\.freeze/);
  assert.match(code, /notes:\s*Object\.freeze/);
  assert.match(code, /loadBundle/);
  assert.match(code, /ensureFeaturesForTab/);
});

test('pdf bundle preserves dependency order and owns heavy reader assets', () => {
  const code = source(performancePath);
  const pdfMin = code.indexOf("'./vendor/pdf.min.js'");
  const pdfCore = code.indexOf("'./js/pdf/pdf-core.js'");
  const pdfReader = code.indexOf("'./js/pdf/pdf-reader.js'");
  const pdfUi = code.indexOf("'./js/pdf/pdf-library-ui.js'");

  assert.ok(pdfMin >= 0 && pdfCore > pdfMin && pdfReader > pdfCore && pdfUi > pdfReader);
  assert.match(code, /pdf_viewer\.min\.css/);
  assert.match(code, /pdf-library\.css/);
  assert.match(code, /pdf-reader\.css/);
});

test('navigation waits for feature preparation before switching heavy tabs', () => {
  const code = source(navigationPath);
  assert.doesNotThrow(() => new vm.Script(code));
  assert.match(code, /async function prepareTabFeatures/);
  assert.match(code, /ensureFeaturesForTab/);
  assert.match(code, /async function navigateTo/);
  assert.match(code, /await prepareTabFeatures\(tabId\)/);
});

test('bundle loader deduplicates requests and recovers after failure', () => {
  const code = source(performancePath);
  assert.match(code, /loadedBundles\.has\(key\)/);
  assert.match(code, /loadedBundles\.set\(key, promise\)/);
  assert.match(code, /loadedBundles\.delete\(key\)/);
  assert.match(code, /loadScriptsInOrder/);
});

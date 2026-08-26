const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'public/js/performance-loader.js'), 'utf8');

const eagerPdfScripts = [
  './js/pdf/pdf-core.js',
  './js/pdf/pdf-workspaces.js',
  './js/pdf/pdf-links.js',
  './js/pdf/pdf-library.js',
  './js/pdf/pdf-upload.js',
  './js/pdf/pdf-annotations.js',
  './vendor/pdf.min.js',
  './js/pdf/pdf-reader.js',
  './js/pdf/pdf-library-ui.js',
  './js/pdf/pdf-offline-integrity.js',
  './js/pdf/pdf-device-storage.js'
];

test('performance loader is part of bootstrap exactly once', () => {
  const tag = '<script src="./js/performance-loader.js" defer></script>';
  assert.equal(html.split(tag).length - 1, 1);
});

test('PDF library scripts are absent from eager index bootstrap', () => {
  for (const src of eagerPdfScripts) {
    assert.doesNotMatch(html, new RegExp(`<script[^>]+src=["']${src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`), src);
  }
});

test('PDF feature is loaded sequentially on library intent', () => {
  assert.doesNotThrow(() => new vm.Script(loader));
  for (const src of eagerPdfScripts) assert.match(loader, new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), src);
  assert.match(loader, /function ensurePdfFeature\(\)/);
  assert.match(loader, /function pdfFeatureReady\(\)/);
  assert.match(loader, /global\.PdfOfflineIntegrity/);
  assert.match(loader, /global\.PdfDeviceStorage/);
  assert.match(loader, /pdfFeaturePromise\s*=\s*\(async \(\) => \{/);
  assert.match(loader, /for \(const src of PDF_FEATURE_SCRIPTS\) await loadScript\(src\)/);
  assert.match(loader, /\[data-tab="tab-biblioteca"\]/);
  assert.match(loader, /event\.stopImmediatePropagation\(\)/);
  assert.match(loader, /openLibraryAfterLoad\(target\)/);
});

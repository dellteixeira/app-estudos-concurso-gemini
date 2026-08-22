'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/js/pdf/pdf-offline-integrity.js'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'public/js/pdf/pdf-library-opfs-adapter.js'), 'utf8');

test('phase 4 exposes canonical offline integrity states', () => {
  for (const state of ['OFFLINE_READY', 'STALE', 'ERROR', 'EVICTED', 'UNVERIFIED_LARGE']) {
    assert.match(source, new RegExp(state));
  }
});

test('phase 4 performs SHA-256 validation with Web Crypto', () => {
  assert.match(source, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(source, /actual!==expected/);
  assert.match(source, /OfflinePdfStore\?\.remove/);
});

test('phase 4 remains mobile-first for very large PDFs', () => {
  assert.match(source, /MOBILE_HASH_SOFT_LIMIT=128\*1024\*1024/);
  assert.match(source, /isMobile\(\)&&blob\.size>MOBILE_HASH_SOFT_LIMIT/);
  assert.match(source, /UNVERIFIED_LARGE/);
});

test('LRU cleanup protects favorites and full-library policy', () => {
  assert.match(source, /filter\(r=>!r\.status\?\.isFavorite\)/);
  assert.match(source, /settings\.mode==='all'&&!force/);
  assert.match(source, /library-all-protected/);
});

test('storage pressure has conservative cleanup thresholds', () => {
  assert.match(source, /PRESSURE_USAGE_RATIO=0\.82/);
  assert.match(source, /TARGET_USAGE_RATIO=0\.72/);
  assert.match(source, /MIN_SAFE_FREE=512\*1024\*1024/);
});

test('integrity layer is loaded by the managed offline adapter', () => {
  assert.match(adapter, /pdf-offline-integrity\.js/);
  assert.match(adapter, /data-pdf-offline-integrity/);
});

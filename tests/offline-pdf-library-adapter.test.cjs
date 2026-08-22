const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const adapter = fs.readFileSync(path.join(root, 'public/js/pdf/pdf-library-opfs-adapter.js'), 'utf8');
const store = fs.readFileSync(path.join(root, 'public/js/pdf/offline-pdf-store.js'), 'utf8');

test('adapter uses OfflinePdfStore and keeps legacy migration enabled', () => {
  assert.match(adapter, /OfflinePdfStore/);
  assert.match(adapter, /migrateLegacy:\s*true/);
  assert.match(adapter, /store\.put/);
  assert.match(adapter, /store\.removeMany/);
});

test('offline PDF store prefers OPFS with IndexedDB fallback', () => {
  assert.match(store, /navigator\.storage\.getDirectory/);
  assert.match(store, /preferredBackend:\s*hasOpfs\(\)\s*\?\s*'opfs'/);
  assert.match(store, /FALLBACK_BLOB_STORE/);
});

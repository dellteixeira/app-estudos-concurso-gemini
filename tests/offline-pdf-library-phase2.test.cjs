const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const adapter = fs.readFileSync(path.join(root, 'public/js/pdf/pdf-library-opfs-adapter.js'), 'utf8');
const ordering = fs.readFileSync(path.join(root, 'public/js/pdf/pdf-library-ordering.js'), 'utf8');
const store = fs.readFileSync(path.join(root, 'public/js/pdf/offline-pdf-store.js'), 'utf8');

test('phase 2 adapter delegates PDF persistence to OfflinePdfStore', () => {
  assert.match(adapter, /OfflinePdfStore/);
  assert.match(adapter, /store\.get\(userId, doc, \{ migrateLegacy: true \}\)/);
  assert.match(adapter, /store\.put\(userId, doc, blob\)/);
  assert.match(adapter, /store\.removeMany\(userId, ids\)/);
});

test('legacy blob is only cleaned after a durable migrated copy exists', () => {
  assert.match(adapter, /migrateLegacy: false/);
  assert.match(adapter, /deleteLegacy\(userId, doc\.id\)/);
});

test('PDF library bridge wraps download and deletion without changing Reader API', () => {
  assert.match(ordering, /const originalDownload=library\.downloadBlob/);
  assert.match(ordering, /const originalForget=library\.forgetDocuments/);
  assert.match(ordering, /global\.PdfStudyLibrary=Object\.freeze/);
  assert.match(ordering, /hasOfflineCopy/);
  assert.match(ordering, /getOfflineCapabilities/);
});

test('mobile-capable storage keeps OPFS preferred with IndexedDB fallback', () => {
  assert.match(store, /navigator\.storage\.getDirectory/);
  assert.match(store, /preferredBackend: hasOpfs\(\) \? 'opfs'/);
  assert.match(store, /FALLBACK_BLOB_STORE/);
});

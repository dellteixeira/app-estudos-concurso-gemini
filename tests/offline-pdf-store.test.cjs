const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'pdf', 'offline-pdf-store.js'), 'utf8');

function loadStore(windowOverrides = {}) {
  const window = {
    navigator: {},
    ...windowOverrides
  };
  const context = vm.createContext({ window, console, setTimeout, clearTimeout });
  vm.runInContext(source, context, { filename: 'offline-pdf-store.js' });
  return window.OfflinePdfStore;
}

test('expõe API estável mesmo sem OPFS ou IndexedDB', async () => {
  const store = loadStore();
  assert.ok(store);
  assert.equal(typeof store.put, 'function');
  assert.equal(typeof store.get, 'function');
  assert.equal(typeof store.removeMany, 'function');
  assert.equal(typeof store.capabilities, 'function');

  const capabilities = await store.capabilities();
  assert.equal(capabilities.opfs, false);
  assert.equal(capabilities.indexedDb, false);
  assert.equal(capabilities.preferredBackend, 'none');
});

test('detecta OPFS e consulta quota sem pedir persistência automaticamente', async () => {
  let persistCalls = 0;
  const fakeRoot = {};
  const store = loadStore({
    navigator: {
      storage: {
        getDirectory: async () => fakeRoot,
        estimate: async () => ({ usage: 250, quota: 1000 }),
        persisted: async () => false,
        persist: async () => { persistCalls += 1; return true; }
      }
    }
  });

  const capabilities = await store.capabilities();
  assert.equal(capabilities.opfs, true);
  assert.equal(capabilities.preferredBackend, 'opfs');
  assert.equal(capabilities.storage.available, 750);
  assert.equal(capabilities.storage.usageRatio, 0.25);
  assert.equal(capabilities.persistence.persisted, false);
  assert.equal(persistCalls, 0);

  const persistence = await store.requestPersistence();
  assert.equal(persistence.persisted, true);
  assert.equal(persistCalls, 1);
});

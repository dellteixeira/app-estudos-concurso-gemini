'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const file = 'public/js/core/offline-outbox-store.js';
const source = fs.readFileSync(file, 'utf8');

function createContext() {
  const memory = new Map();
  let uuid = 0;
  const context = {
    console,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Set,
    Promise,
    TypeError,
    Error,
    localStorage: {
      getItem(key) { return memory.has(key) ? memory.get(key) : null; },
      setItem(key, value) { memory.set(key, String(value)); },
      removeItem(key) { memory.delete(key); }
    },
    crypto: { randomUUID() { uuid += 1; return `uuid-${uuid}`; } }
  };
  context.globalThis = context;
  return context;
}

test('módulo da outbox possui sintaxe JavaScript válida', () => {
  const result = spawnSync(process.execPath, ['--check', file], { encoding:'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('fundação usa IndexedDB com fallback persistente e identidade estável do dispositivo', () => {
  assert.match(source, /estudo-adaptativo-offline-sync/);
  assert.match(source, /indexedDB/);
  assert.match(source, /offline_outbox_fallback_/);
  assert.match(source, /offline_sync_device_id_v1/);
  assert.match(source, /idempotencyKey/);
  assert.match(source, /status:\s*\['pending','sending','failed','synced','shadow'\]/);
});

test('fallback local preserva idempotência e ciclo de status sem tocar no sync legado', async () => {
  const context = createContext();
  vm.runInNewContext(source, context, { filename:file });
  const store = context.OfflineOutboxStore;
  assert.ok(store);

  const first = await store.enqueue({
    userId:'user-1',
    entity:'edital',
    entityId:'topic-1',
    action:'upsert',
    idempotencyKey:'user-1:edital:topic-1:rev-1',
    payload:{ teoria:true }
  });
  const duplicate = await store.enqueue({
    userId:'user-1',
    entity:'edital',
    entityId:'topic-1',
    action:'upsert',
    idempotencyKey:'user-1:edital:topic-1:rev-1',
    payload:{ teoria:false }
  });

  assert.equal(first.idempotencyKey, duplicate.idempotencyKey);
  assert.equal(duplicate.payload.teoria, true);
  assert.equal(await store.countPending('user-1'), 1);

  const sending = await store.updateStatus('user-1', first.idempotencyKey, 'sending', { attempts:1 });
  assert.equal(sending.status, 'sending');
  assert.equal(sending.attempts, 1);

  const synced = await store.updateStatus('user-1', first.idempotencyKey, 'synced');
  assert.equal(synced.status, 'synced');
  assert.equal(await store.countPending('user-1'), 0);

  const diagnostics = await store.getDiagnostics('user-1');
  assert.equal(diagnostics.synced, 1);
  assert.equal(diagnostics.deviceId, store.getDeviceId());
  assert.equal(store.getDeviceId(), store.getDeviceId());

  const removed = await store.removeSynced('user-1');
  assert.equal(removed, 1);
  assert.equal((await store.list('user-1')).length, 0);
});

test('outbox rejeita operações sem usuário autenticado ou identidade de entidade', async () => {
  const context = createContext();
  vm.runInNewContext(source, context, { filename:file });
  const store = context.OfflineOutboxStore;
  await assert.rejects(() => store.enqueue({ userId:'guest', entity:'edital', entityId:'1', action:'upsert' }), /autenticado/);
  await assert.rejects(() => store.enqueue({ userId:'user-1', entity:'', entityId:'1', action:'upsert' }), /entity/);
});

test('esta fase não substitui pending_sync nem intercepta syncAllWithSupabase', () => {
  assert.doesNotMatch(source, /pending_sync_/);
  assert.doesNotMatch(source, /syncAllWithSupabase\s*\(/);
  assert.doesNotMatch(source, /queueEditalUpsert\s*\(/);
});

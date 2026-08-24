(function offlineOutboxStoreFactory(global) {
  'use strict';

  if (!global || global.OfflineOutboxStore) return;

  const DB_NAME = 'estudo-adaptativo-offline-sync';
  const DB_VERSION = 1;
  const OUTBOX_STORE = 'outbox';
  const META_STORE = 'meta';
  const DEVICE_KEY = 'offline_sync_device_id_v1';
  const FALLBACK_PREFIX = 'offline_outbox_fallback_';
  const MAX_FALLBACK_ITEMS = 500;

  function nowIso() {
    return new Date().toISOString();
  }

  function safeUuid() {
    try {
      if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    } catch (_) {}
    return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function getDeviceId() {
    try {
      let value = global.localStorage?.getItem(DEVICE_KEY);
      if (!value) {
        value = safeUuid();
        global.localStorage?.setItem(DEVICE_KEY, value);
      }
      return value;
    } catch (_) {
      if (!getDeviceId.memoryValue) getDeviceId.memoryValue = safeUuid();
      return getDeviceId.memoryValue;
    }
  }

  function normalizeUserId(value) {
    const userId = String(value || '').trim();
    if (!userId || userId === 'guest') throw new Error('Outbox requer usuário autenticado.');
    return userId;
  }

  function normalizeOperation(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Operação de outbox inválida.');
    const userId = normalizeUserId(input.userId);
    const entity = String(input.entity || '').trim();
    const entityId = String(input.entityId || '').trim();
    const action = String(input.action || '').trim();
    if (!entity || !entityId || !action) throw new Error('Outbox requer entity, entityId e action.');

    const createdAt = String(input.createdAt || nowIso());
    const idempotencyKey = String(input.idempotencyKey || `${userId}:${entity}:${entityId}:${action}:${createdAt}`);
    return Object.freeze({
      id: String(input.id || safeUuid()),
      idempotencyKey,
      userId,
      deviceId: String(input.deviceId || getDeviceId()),
      entity,
      entityId,
      action,
      payload: input.payload == null ? null : input.payload,
      status: ['pending','sending','failed','synced','shadow'].includes(input.status) ? input.status : 'pending',
      attempts: Math.max(0, Number(input.attempts) || 0),
      lastError: input.lastError ? String(input.lastError) : null,
      createdAt,
      clientUpdatedAt: String(input.clientUpdatedAt || createdAt),
      updatedAt: nowIso()
    });
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) return reject(new Error('IndexedDB indisponível.'));
      const request = global.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
          const store = db.createObjectStore(OUTBOX_STORE, { keyPath:'idempotencyKey' });
          store.createIndex('userStatusCreatedAt', ['userId','status','createdAt'], { unique:false });
          store.createIndex('userCreatedAt', ['userId','createdAt'], { unique:false });
        }
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath:'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Não foi possível abrir a outbox offline.'));
    });
  }

  function fallbackKey(userId) {
    return `${FALLBACK_PREFIX}${normalizeUserId(userId)}`;
  }

  function readFallback(userId) {
    try {
      const value = JSON.parse(global.localStorage?.getItem(fallbackKey(userId)) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  }

  function writeFallback(userId, items) {
    const trimmed = items.slice(-MAX_FALLBACK_ITEMS);
    global.localStorage?.setItem(fallbackKey(userId), JSON.stringify(trimmed));
  }

  async function enqueue(input) {
    const operation = normalizeOperation(input);
    try {
      const db = await openDatabase();
      return await new Promise((resolve, reject) => {
        const store = db.transaction(OUTBOX_STORE, 'readwrite').objectStore(OUTBOX_STORE);
        const get = store.get(operation.idempotencyKey);
        get.onsuccess = () => {
          if (get.result) return resolve(Object.freeze({ ...get.result }));
          const put = store.put(operation);
          put.onsuccess = () => resolve(operation);
          put.onerror = () => reject(put.error || new Error('Não foi possível gravar operação na outbox.'));
        };
        get.onerror = () => reject(get.error || new Error('Não foi possível consultar a outbox.'));
      });
    } catch (error) {
      try {
        const items = readFallback(operation.userId);
        const existing = items.find(item => item.idempotencyKey === operation.idempotencyKey);
        if (existing) return Object.freeze({ ...existing });
        items.push(operation);
        writeFallback(operation.userId, items);
        return operation;
      } catch (_) {
        throw error;
      }
    }
  }

  async function list(userId, options = {}) {
    const uid = normalizeUserId(userId);
    const statuses = Array.isArray(options.statuses) && options.statuses.length ? new Set(options.statuses.map(String)) : null;
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    try {
      const db = await openDatabase();
      const rows = await new Promise((resolve, reject) => {
        const request = db.transaction(OUTBOX_STORE, 'readonly').objectStore(OUTBOX_STORE).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error || new Error('Não foi possível listar a outbox.'));
      });
      return rows
        .filter(item => item.userId === uid && (!statuses || statuses.has(item.status)))
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .slice(0, limit)
        .map(item => Object.freeze({ ...item }));
    } catch (_) {
      return readFallback(uid)
        .filter(item => !statuses || statuses.has(item.status))
        .slice(0, limit)
        .map(item => Object.freeze({ ...item }));
    }
  }

  async function countPending(userId) {
    const rows = await list(userId, { statuses:['pending','sending','failed'], limit:500 });
    return rows.length;
  }

  async function updateStatus(userId, idempotencyKey, status, patch = {}) {
    const uid = normalizeUserId(userId);
    const key = String(idempotencyKey || '').trim();
    if (!key) throw new Error('Chave idempotente ausente.');
    if (!['pending','sending','failed','synced','shadow'].includes(status)) throw new Error('Status de outbox inválido.');

    try {
      const db = await openDatabase();
      return await new Promise((resolve, reject) => {
        const store = db.transaction(OUTBOX_STORE, 'readwrite').objectStore(OUTBOX_STORE);
        const get = store.get(key);
        get.onsuccess = () => {
          const current = get.result;
          if (!current || current.userId !== uid) return resolve(null);
          const next = normalizeOperation({ ...current, ...patch, status, idempotencyKey:key, userId:uid, updatedAt:nowIso() });
          const put = store.put(next);
          put.onsuccess = () => resolve(next);
          put.onerror = () => reject(put.error || new Error('Não foi possível atualizar a outbox.'));
        };
        get.onerror = () => reject(get.error || new Error('Não foi possível consultar a outbox.'));
      });
    } catch (_) {
      const items = readFallback(uid);
      const index = items.findIndex(item => item.idempotencyKey === key);
      if (index < 0) return null;
      items[index] = normalizeOperation({ ...items[index], ...patch, status, idempotencyKey:key, userId:uid });
      writeFallback(uid, items);
      return Object.freeze({ ...items[index] });
    }
  }

  async function removeSynced(userId, olderThanIso = null) {
    const uid = normalizeUserId(userId);
    const cutoff = olderThanIso ? String(olderThanIso) : null;
    try {
      const db = await openDatabase();
      const rows = await list(uid, { statuses:['synced'], limit:500 });
      const keys = rows.filter(item => !cutoff || String(item.updatedAt || item.createdAt) <= cutoff).map(item => item.idempotencyKey);
      if (!keys.length) return 0;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(OUTBOX_STORE, 'readwrite');
        const store = tx.objectStore(OUTBOX_STORE);
        keys.forEach(key => store.delete(key));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Não foi possível limpar a outbox.'));
      });
      return keys.length;
    } catch (_) {
      const items = readFallback(uid);
      const keep = items.filter(item => item.status !== 'synced' || (cutoff && String(item.updatedAt || item.createdAt) > cutoff));
      writeFallback(uid, keep);
      return items.length - keep.length;
    }
  }

  async function getDiagnostics(userId) {
    const uid = normalizeUserId(userId);
    const rows = await list(uid, { limit:500 });
    const counts = { pending:0, sending:0, failed:0, synced:0, shadow:0 };
    rows.forEach(item => { if (Object.prototype.hasOwnProperty.call(counts, item.status)) counts[item.status] += 1; });
    return Object.freeze({
      schemaVersion:1,
      deviceId:getDeviceId(),
      userId:uid,
      total:rows.length,
      ...counts
    });
  }

  global.OfflineOutboxStore = Object.freeze({
    DB_NAME,
    DB_VERSION,
    OUTBOX_STORE,
    META_STORE,
    getDeviceId,
    openDatabase,
    enqueue,
    list,
    countPending,
    updateStatus,
    removeSynced,
    getDiagnostics
  });
})(typeof window !== 'undefined' ? window : globalThis);

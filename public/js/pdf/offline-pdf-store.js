(function (global) {
  'use strict';

  const DB_NAME = 'estudo-adaptativo-offline-pdf-store';
  const DB_VERSION = 1;
  const RECORD_STORE = 'pdf_records';
  const FALLBACK_BLOB_STORE = 'pdf_blobs';
  const LEGACY_DB_NAME = 'estudo-adaptativo-pdf-cache';
  const LEGACY_BLOB_STORE = 'pdf_blobs';
  const OPFS_ROOT_DIR = 'estudo-adaptativo-pdfs';

  const safeSegment = value => String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || '_';
  const recordKey = (userId, pdfId) => `${String(userId)}:${String(pdfId)}`;

  function hasIndexedDb() {
    return typeof global.indexedDB !== 'undefined';
  }

  function hasOpfs() {
    return !!global.navigator?.storage?.getDirectory;
  }

  function openDb(name = DB_NAME, version = DB_VERSION) {
    if (!hasIndexedDb()) return Promise.resolve(null);
    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      try {
        const request = global.indexedDB.open(name, version);
        request.onupgradeneeded = () => {
          if (name !== DB_NAME) return;
          const db = request.result;
          if (!db.objectStoreNames.contains(RECORD_STORE)) {
            const store = db.createObjectStore(RECORD_STORE, { keyPath: 'key' });
            store.createIndex('by_user', 'userId', { unique: false });
            store.createIndex('by_saved_at', 'savedAt', { unique: false });
          }
          if (!db.objectStoreNames.contains(FALLBACK_BLOB_STORE)) {
            const store = db.createObjectStore(FALLBACK_BLOB_STORE, { keyPath: 'key' });
            store.createIndex('by_user', 'userId', { unique: false });
          }
        };
        request.onsuccess = () => finish(request.result);
        request.onerror = () => finish(null);
        request.onblocked = () => finish(null);
      } catch (_) {
        finish(null);
      }
    });
  }

  function idbGet(db, storeName, key) {
    if (!db || !db.objectStoreNames.contains(storeName)) return Promise.resolve(null);
    return new Promise(resolve => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  function idbPut(db, storeName, value) {
    if (!db || !db.objectStoreNames.contains(storeName)) return Promise.resolve(false);
    return new Promise(resolve => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  function idbDelete(db, storeName, key) {
    if (!db || !db.objectStoreNames.contains(storeName)) return Promise.resolve(false);
    return new Promise(resolve => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function getOpfsUserDir(userId, { create = true } = {}) {
    if (!hasOpfs()) return null;
    try {
      const root = await global.navigator.storage.getDirectory();
      const appDir = await root.getDirectoryHandle(OPFS_ROOT_DIR, { create });
      return await appDir.getDirectoryHandle(safeSegment(userId), { create });
    } catch (_) {
      return null;
    }
  }

  async function getOpfsFileHandle(userId, pdfId, { create = false } = {}) {
    const userDir = await getOpfsUserDir(userId, { create });
    if (!userDir) return null;
    try {
      return await userDir.getFileHandle(`${safeSegment(pdfId)}.pdf`, { create });
    } catch (_) {
      return null;
    }
  }

  async function readFromOpfs(userId, pdfId) {
    const handle = await getOpfsFileHandle(userId, pdfId, { create: false });
    if (!handle) return null;
    try {
      const file = await handle.getFile();
      return file?.size ? file : null;
    } catch (_) {
      return null;
    }
  }

  async function writeToOpfs(userId, pdfId, blob) {
    if (!blob?.size) return false;
    const handle = await getOpfsFileHandle(userId, pdfId, { create: true });
    if (!handle) return false;
    let writable;
    try {
      writable = await handle.createWritable({ keepExistingData: false });
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (_) {
      try { await writable?.abort?.(); } catch (_) {}
      return false;
    }
  }

  async function deleteFromOpfs(userId, pdfId) {
    const userDir = await getOpfsUserDir(userId, { create: false });
    if (!userDir) return false;
    try {
      await userDir.removeEntry(`${safeSegment(pdfId)}.pdf`);
      return true;
    } catch (_) {
      return false;
    }
  }

  function normalizeMeta(userId, doc, backend, blob) {
    return {
      key: recordKey(userId, doc.id),
      userId: String(userId),
      pdfId: String(doc.id),
      backend,
      sha256: String(doc.sha256 || ''),
      updatedAt: String(doc.updated_at || ''),
      size: Number(blob?.size || doc.file_size || 0),
      savedAt: Date.now(),
      lastAccessedAt: Date.now()
    };
  }

  function matchesDocument(record, doc) {
    if (!record || !doc) return false;
    const expectedHash = String(doc.sha256 || '');
    const expectedUpdatedAt = String(doc.updated_at || '');
    if (expectedHash && record.sha256 && record.sha256 !== expectedHash) return false;
    if (!expectedHash && expectedUpdatedAt && record.updatedAt && record.updatedAt !== expectedUpdatedAt) return false;
    return true;
  }

  async function readLegacyBlob(userId, doc) {
    if (!hasIndexedDb()) return null;
    try {
      const db = await new Promise(resolve => {
        let settled = false;
        const finish = value => { if (!settled) { settled = true; resolve(value); } };
        const request = global.indexedDB.open(LEGACY_DB_NAME);
        request.onsuccess = () => finish(request.result);
        request.onerror = () => finish(null);
        request.onblocked = () => finish(null);
      });
      if (!db || !db.objectStoreNames.contains(LEGACY_BLOB_STORE)) return null;
      const legacy = await idbGet(db, LEGACY_BLOB_STORE, recordKey(userId, doc.id));
      if (!legacy?.blob?.size) return null;
      if (String(doc.updated_at || '') && legacy.updatedAt && legacy.updatedAt !== String(doc.updated_at || '')) return null;
      return legacy.blob;
    } catch (_) {
      return null;
    }
  }

  async function put(userId, doc, blob) {
    if (!userId || !doc?.id || !blob?.size) return { stored: false, backend: 'none' };
    const db = await openDb();

    if (hasOpfs()) {
      const stored = await writeToOpfs(userId, doc.id, blob);
      if (stored) {
        await idbPut(db, RECORD_STORE, normalizeMeta(userId, doc, 'opfs', blob));
        await idbDelete(db, FALLBACK_BLOB_STORE, recordKey(userId, doc.id));
        return { stored: true, backend: 'opfs' };
      }
    }

    const fallbackRecord = {
      ...normalizeMeta(userId, doc, 'indexeddb', blob),
      blob
    };
    const stored = await idbPut(db, FALLBACK_BLOB_STORE, fallbackRecord);
    if (stored) await idbPut(db, RECORD_STORE, normalizeMeta(userId, doc, 'indexeddb', blob));
    return { stored, backend: stored ? 'indexeddb' : 'none' };
  }

  async function get(userId, doc, { migrateLegacy = true } = {}) {
    if (!userId || !doc?.id) return null;
    const db = await openDb();
    const key = recordKey(userId, doc.id);
    const meta = await idbGet(db, RECORD_STORE, key);

    if (meta && matchesDocument(meta, doc)) {
      let blob = null;
      if (meta.backend === 'opfs') blob = await readFromOpfs(userId, doc.id);
      if (!blob && meta.backend === 'indexeddb') {
        const record = await idbGet(db, FALLBACK_BLOB_STORE, key);
        blob = record?.blob?.size ? record.blob : null;
      }
      if (blob?.size) {
        meta.lastAccessedAt = Date.now();
        idbPut(db, RECORD_STORE, meta).catch(() => false);
        return blob;
      }
    }

    if (migrateLegacy) {
      const legacyBlob = await readLegacyBlob(userId, doc);
      if (legacyBlob?.size) {
        await put(userId, doc, legacyBlob);
        return legacyBlob;
      }
    }

    return null;
  }

  async function has(userId, doc) {
    return !!(await get(userId, doc));
  }

  async function remove(userId, pdfId) {
    if (!userId || !pdfId) return false;
    const db = await openDb();
    const key = recordKey(userId, pdfId);
    await Promise.allSettled([
      deleteFromOpfs(userId, pdfId),
      idbDelete(db, FALLBACK_BLOB_STORE, key),
      idbDelete(db, RECORD_STORE, key)
    ]);
    return true;
  }

  async function removeMany(userId, pdfIds) {
    const ids = [...new Set((Array.isArray(pdfIds) ? pdfIds : [pdfIds]).filter(Boolean))];
    for (const pdfId of ids) await remove(userId, pdfId);
    return ids.length;
  }

  async function getStorageEstimate() {
    try {
      const estimate = await global.navigator?.storage?.estimate?.();
      const usage = Number(estimate?.usage || 0);
      const quota = Number(estimate?.quota || 0);
      return {
        usage,
        quota,
        available: Math.max(0, quota - usage),
        usageRatio: quota > 0 ? usage / quota : 0
      };
    } catch (_) {
      return { usage: 0, quota: 0, available: 0, usageRatio: 0 };
    }
  }

  async function getPersistenceStatus() {
    try {
      if (!global.navigator?.storage?.persisted) return { supported: false, persisted: false };
      return { supported: true, persisted: !!(await global.navigator.storage.persisted()) };
    } catch (_) {
      return { supported: false, persisted: false };
    }
  }

  async function requestPersistence() {
    try {
      if (!global.navigator?.storage?.persist) return { supported: false, persisted: false };
      return { supported: true, persisted: !!(await global.navigator.storage.persist()) };
    } catch (_) {
      return { supported: true, persisted: false };
    }
  }

  async function capabilities() {
    const [estimate, persistence] = await Promise.all([
      getStorageEstimate(),
      getPersistenceStatus()
    ]);
    return {
      opfs: hasOpfs(),
      indexedDb: hasIndexedDb(),
      preferredBackend: hasOpfs() ? 'opfs' : (hasIndexedDb() ? 'indexeddb' : 'none'),
      storage: estimate,
      persistence
    };
  }

  global.OfflinePdfStore = Object.freeze({
    put,
    get,
    has,
    remove,
    removeMany,
    capabilities,
    getStorageEstimate,
    getPersistenceStatus,
    requestPersistence
  });
})(window);

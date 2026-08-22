(function (global) {
  'use strict';

  const LEGACY_DB_NAME = 'estudo-adaptativo-pdf-cache';
  const LEGACY_STORE = 'pdf_blobs';
  let storePromise = null;

  function key(userId, pdfId) { return `${String(userId)}:${String(pdfId)}`; }
  function hasStore() { return !!global.OfflinePdfStore; }

  function loadStore() {
    if (hasStore()) return Promise.resolve(global.OfflinePdfStore);
    if (storePromise) return storePromise;

    storePromise = new Promise(resolve => {
      const existing = document.querySelector('script[data-offline-pdf-store]');
      if (existing) {
        if (hasStore()) return resolve(global.OfflinePdfStore);
        existing.addEventListener('load', () => resolve(global.OfflinePdfStore || null), { once: true });
        existing.addEventListener('error', () => resolve(null), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = './js/pdf/offline-pdf-store.js';
      script.defer = true;
      script.dataset.offlinePdfStore = 'true';
      script.onload = () => resolve(global.OfflinePdfStore || null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });

    return storePromise;
  }

  async function deleteLegacy(userId, pdfId) {
    if (!global.indexedDB || !userId || !pdfId) return false;
    return new Promise(resolve => {
      try {
        const request = global.indexedDB.open(LEGACY_DB_NAME);
        request.onerror = () => resolve(false);
        request.onblocked = () => resolve(false);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(LEGACY_STORE)) return resolve(false);
          try {
            const tx = db.transaction(LEGACY_STORE, 'readwrite');
            tx.objectStore(LEGACY_STORE).delete(key(userId, pdfId));
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
            tx.onabort = () => resolve(false);
          } catch (_) { resolve(false); }
        };
      } catch (_) { resolve(false); }
    });
  }

  async function get(userId, doc) {
    const store = await loadStore();
    if (!store?.get) return null;
    try {
      const blob = await store.get(userId, doc, { migrateLegacy: true });
      if (!blob?.size) return null;
      const durable = await store.get(userId, doc, { migrateLegacy: false });
      if (durable?.size) deleteLegacy(userId, doc.id).catch(() => false);
      return blob;
    } catch (_) {
      return null;
    }
  }

  async function put(userId, doc, blob) {
    const store = await loadStore();
    if (!store?.put) return { stored: false, backend: 'none' };
    try {
      const result = await store.put(userId, doc, blob);
      if (result?.stored) deleteLegacy(userId, doc.id).catch(() => false);
      return result;
    } catch (_) {
      return { stored: false, backend: 'none' };
    }
  }

  async function removeMany(userId, pdfIds) {
    const ids = [...new Set((Array.isArray(pdfIds) ? pdfIds : [pdfIds]).filter(Boolean))];
    const store = await loadStore();
    let removed = 0;
    if (store?.removeMany) {
      try { removed = await store.removeMany(userId, ids); } catch (_) {}
    }
    await Promise.allSettled(ids.map(id => deleteLegacy(userId, id)));
    return removed;
  }

  async function has(userId, doc) {
    return !!(await get(userId, doc));
  }

  async function capabilities() {
    const store = await loadStore();
    if (!store?.capabilities) {
      return {
        opfs: false,
        indexedDb: !!global.indexedDB,
        preferredBackend: global.indexedDB ? 'indexeddb' : 'none',
        storage: { usage: 0, quota: 0, available: 0, usageRatio: 0 },
        persistence: { supported: false, persisted: false }
      };
    }
    return store.capabilities();
  }

  global.PdfLibraryOfflineAdapter = Object.freeze({ loadStore, get, put, removeMany, has, capabilities });

  function loadManagedOfflineLibrary() {
    if (document.querySelector('script[data-pdf-offline-manager]')) return;
    const manager = document.createElement('script');
    manager.src = './js/pdf/pdf-offline-library-manager.js';
    manager.defer = true;
    manager.dataset.pdfOfflineManager = '1';
    manager.onload = () => {
      if (document.querySelector('script[data-pdf-offline-ui]')) return;
      const ui = document.createElement('script');
      ui.src = './js/pdf/pdf-offline-library-ui.js';
      ui.defer = true;
      ui.dataset.pdfOfflineUi = '1';
      document.head.appendChild(ui);
    };
    document.head.appendChild(manager);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadManagedOfflineLibrary, { once: true });
  else loadManagedOfflineLibrary();
})(window);

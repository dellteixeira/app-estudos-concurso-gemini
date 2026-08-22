(function (global) {
  'use strict';

  let storePromise = null;

  function hasStore() {
    return !!global.OfflinePdfStore;
  }

  function loadStore() {
    if (hasStore()) return Promise.resolve(global.OfflinePdfStore);
    if (storePromise) return storePromise;

    storePromise = new Promise(resolve => {
      const existing = document.querySelector('script[data-offline-pdf-store]');
      if (existing) {
        existing.addEventListener('load', () => resolve(global.OfflinePdfStore || null), { once: true });
        existing.addEventListener('error', () => resolve(null), { once: true });
        if (hasStore()) resolve(global.OfflinePdfStore);
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

  async function get(userId, doc) {
    const store = await loadStore();
    if (!store?.get) return null;
    try { return await store.get(userId, doc, { migrateLegacy: true }); }
    catch (_) { return null; }
  }

  async function put(userId, doc, blob) {
    const store = await loadStore();
    if (!store?.put) return { stored: false, backend: 'none' };
    try { return await store.put(userId, doc, blob); }
    catch (_) { return { stored: false, backend: 'none' }; }
  }

  async function removeMany(userId, pdfIds) {
    const store = await loadStore();
    if (!store?.removeMany) return 0;
    try { return await store.removeMany(userId, pdfIds); }
    catch (_) { return 0; }
  }

  async function has(userId, doc) {
    const store = await loadStore();
    if (!store?.has) return false;
    try { return await store.has(userId, doc); }
    catch (_) { return false; }
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
})(window);

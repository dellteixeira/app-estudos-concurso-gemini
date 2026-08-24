(function localBackupStoreFactory(global) {
  'use strict';

  if (!global || global.AppLocalBackupStore) return;

  const DB_NAME = 'painel-estudos-backups';
  const STORE_NAME = 'snapshots';

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Não foi possível abrir o armazenamento de backups.'));
    });
  }

  async function read(userId, slot = 'current') {
    if (!userId) return null;
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const key = `${userId}:${slot}`;
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Não foi possível ler o backup.'));
    });
  }

  async function write(record) {
    if (!record?.key) throw new Error('Backup local inválido: chave ausente.');
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Não foi possível gravar o backup.'));
    });
  }

  function fingerprint(core) {
    const raw = JSON.stringify(core || {});
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i++) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${raw.length}:${(hash >>> 0).toString(16)}`;
  }

  function countStats(snapshot) {
    const core = snapshot?.core || {};
    const metadata = core.concursosMetadata || {};
    const realContests = Object.keys(metadata).filter(name => name && name !== 'Concurso Geral');
    const edital = Array.isArray(core.editalItems) ? core.editalItems : [];
    let flashcards = 0;
    let sessions = 0;
    Object.values(metadata).forEach(contest => {
      flashcards += Array.isArray(contest?.flashcards) ? contest.flashcards.length : 0;
      sessions += Array.isArray(contest?.studySessions) ? contest.studySessions.length : 0;
    });
    return { concursos: realContests.length, topicos: edital.length, flashcards, sessions };
  }

  global.AppLocalBackupStore = Object.freeze({
    DB_NAME,
    STORE_NAME,
    openDatabase,
    read,
    write,
    fingerprint,
    countStats
  });
})(typeof window !== 'undefined' ? window : globalThis);

(function offlineSyncMetadataShadowFactory(global) {
  'use strict';

  if (!global || global.OfflineSyncMetadataShadow) return;

  const MODE = 'shadow-v1';
  const ENTITY = 'concursos-metadata';
  const ENTITY_ID = 'concursos_metadata';
  const HISTORY_KEY = 'offline_sync_metadata_shadow_parity_v1';
  const MAX_HISTORY = 100;
  let installed = false;
  let originalSetMetadataDirty = null;
  let lastMirror = null;
  let lastError = null;

  function nowIso() {
    return new Date().toISOString();
  }

  function safeUserId() {
    try {
      if (typeof currentUser !== 'undefined' && currentUser?.id) return String(currentUser.id).trim();
    } catch (_) {}
    try {
      return String(global.currentUser?.id || '').trim();
    } catch (_) {
      return '';
    }
  }

  function safeSyncState() {
    try {
      return typeof global.getSyncState === 'function' ? global.getSyncState() || {} : {};
    } catch (_) {
      return {};
    }
  }

  function safeMetadata() {
    try {
      return typeof global.getConcursosMetadata === 'function' ? global.getConcursosMetadata() || {} : {};
    } catch (_) {
      return {};
    }
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
      return Object.keys(value).sort().reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
      }, {});
    }
    return value;
  }

  function stableStringify(value) {
    return JSON.stringify(stableValue(value));
  }

  function fingerprint(value) {
    const input = stableStringify(value);
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function readHistory() {
    try {
      const parsed = JSON.parse(global.localStorage?.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY) : [];
    } catch (_) {
      return [];
    }
  }

  function writeHistory(history) {
    try {
      global.localStorage?.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
    } catch (_) {}
  }

  function recordParity(sample) {
    const history = readHistory();
    history.push(Object.freeze({ at:nowIso(), ...sample }));
    writeHistory(history);
    return history[history.length - 1];
  }

  function getParityHistory(options = {}) {
    const requested = Math.max(1, Math.min(MAX_HISTORY, Number(options.limit) || MAX_HISTORY));
    return Object.freeze(readHistory().slice(-requested).map(sample => Object.freeze({ ...sample })));
  }

  function getParityReport(options = {}) {
    const history = getParityHistory(options);
    const healthySamples = history.filter(sample => sample?.ok === true).length;
    const unhealthySamples = history.length - healthySamples;
    return Object.freeze({
      sampleCount:history.length,
      healthySamples,
      unhealthySamples,
      healthy:history.length > 0 && unhealthySamples === 0,
      latest:history.length ? history[history.length - 1] : null
    });
  }

  function clearParityHistory() {
    writeHistory([]);
    return true;
  }

  function buildOperation(userId) {
    const state = safeSyncState();
    const snapshot = safeMetadata();
    const revision = Math.max(0, Number(state.metadataRevision) || 0);
    const payloadFingerprint = fingerprint(snapshot);
    return {
      userId,
      entity:ENTITY,
      entityId:ENTITY_ID,
      action:'upsert',
      status:'shadow',
      idempotencyKey:`${userId}:${ENTITY}:${ENTITY_ID}:upsert:r${revision}:${payloadFingerprint}`,
      clientUpdatedAt:nowIso(),
      payload:{
        mode:MODE,
        settingKey:ENTITY_ID,
        metadataRevision:revision,
        payloadFingerprint,
        snapshot
      }
    };
  }

  async function mirrorDirtyMetadata() {
    const userId = safeUserId();
    if (!userId) return null;
    const store = global.OfflineOutboxStore;
    if (!store?.enqueue) return null;

    const operation = buildOperation(userId);
    try {
      const mirrored = await store.enqueue(operation);
      const state = safeSyncState();
      const currentSnapshot = safeMetadata();
      const parity = {
        ok:Boolean(state.metadataDirty) &&
          Math.max(0, Number(state.metadataRevision) || 0) === operation.payload.metadataRevision &&
          fingerprint(currentSnapshot) === operation.payload.payloadFingerprint,
        metadataDirty:Boolean(state.metadataDirty),
        metadataRevision:Math.max(0, Number(state.metadataRevision) || 0),
        shadowRevision:operation.payload.metadataRevision,
        payloadFingerprint:operation.payload.payloadFingerprint
      };
      recordParity(parity);
      lastMirror = Object.freeze({
        at:nowIso(),
        idempotencyKey:mirrored?.idempotencyKey || operation.idempotencyKey,
        revision:operation.payload.metadataRevision,
        payloadFingerprint:operation.payload.payloadFingerprint,
        parity:parity.ok
      });
      lastError = null;
      try {
        global.dispatchEvent?.(new CustomEvent('offline-sync-metadata-shadow:mirrored', { detail:lastMirror }));
      } catch (_) {}
      return mirrored;
    } catch (error) {
      lastError = Object.freeze({ at:nowIso(), message:String(error?.message || error) });
      try {
        global.dispatchEvent?.(new CustomEvent('offline-sync-metadata-shadow:error', { detail:lastError }));
      } catch (_) {}
      return null;
    }
  }

  function scheduleMirror() {
    Promise.resolve().then(mirrorDirtyMetadata).catch(() => {});
  }

  function install() {
    if (installed) return true;
    if (typeof global.setMetadataDirty !== 'function') return false;

    originalSetMetadataDirty = global.setMetadataDirty;
    global.setMetadataDirty = function offlineMetadataShadowSetMetadataDirty(isDirty) {
      const result = originalSetMetadataDirty.apply(this, arguments);
      if (isDirty) scheduleMirror();
      return result;
    };
    global.setMetadataDirty.__offlineMetadataShadowOriginal = originalSetMetadataDirty;
    installed = true;
    return true;
  }

  function uninstall() {
    if (!installed) return false;
    if (originalSetMetadataDirty && global.setMetadataDirty?.__offlineMetadataShadowOriginal === originalSetMetadataDirty) {
      global.setMetadataDirty = originalSetMetadataDirty;
    }
    installed = false;
    return true;
  }

  async function getDiagnostics() {
    const userId = safeUserId();
    const state = safeSyncState();
    const report = getParityReport({ limit:MAX_HISTORY });
    let shadowRows = [];
    if (userId && global.OfflineOutboxStore?.list) {
      try {
        const rows = await global.OfflineOutboxStore.list(userId, { statuses:['shadow'], limit:500 });
        shadowRows = rows.filter(row => row.entity === ENTITY && row.entityId === ENTITY_ID);
      } catch (_) {}
    }
    return Object.freeze({
      mode:MODE,
      entity:ENTITY,
      entityId:ENTITY_ID,
      installed,
      remoteAuthority:false,
      userId:userId || null,
      legacy:{
        metadataDirty:Boolean(state.metadataDirty),
        metadataRevision:Math.max(0, Number(state.metadataRevision) || 0)
      },
      shadowCount:shadowRows.length,
      parity:report,
      lastMirror,
      lastError
    });
  }

  global.OfflineSyncMetadataShadow = Object.freeze({
    MODE,
    ENTITY,
    ENTITY_ID,
    install,
    uninstall,
    mirrorDirtyMetadata,
    getParityHistory,
    getParityReport,
    clearParityHistory,
    fingerprint,
    getDiagnostics
  });
})(typeof window !== 'undefined' ? window : globalThis);

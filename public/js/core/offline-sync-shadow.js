(function offlineSyncShadowFactory(global) {
  'use strict';

  if (!global || global.OfflineSyncShadow) return;

  const MODE = 'shadow-v1';
  const ENTITY = 'edital-topic';
  const PARITY_SCHEMA_VERSION = 1;
  const PARITY_STORAGE_PREFIX = 'offline_sync_shadow_parity_v1_';
  const DELETE_PARITY_STORAGE_PREFIX = 'offline_sync_shadow_delete_parity_v1_';
  const MAX_PARITY_SAMPLES = 100;
  let installed = false;
  let legacyQueueEditalUpsert = null;
  let legacyQueueEditalDelete = null;

  function currentUserId() {
    try {
      if (typeof currentUser !== 'undefined' && currentUser?.id) return String(currentUser.id);
    } catch (_) {}
    return null;
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
      return Object.keys(value).sort().reduce((acc, key) => {
        if (typeof value[key] !== 'undefined' && typeof value[key] !== 'function') acc[key] = stableValue(value[key]);
        return acc;
      }, {});
    }
    return value;
  }

  function stableStringify(value) {
    try { return JSON.stringify(stableValue(value)); }
    catch (_) { return JSON.stringify(String(value)); }
  }

  function fingerprint(value) {
    const text = stableStringify(value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function parityStorageKey(userId) { return `${PARITY_STORAGE_PREFIX}${String(userId || '')}`; }
  function deleteParityStorageKey(userId) { return `${DELETE_PARITY_STORAGE_PREFIX}${String(userId || '')}`; }

  function readHistory(key) {
    try {
      const value = JSON.parse(global.localStorage?.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  }

  function writeHistory(key, samples) {
    try { global.localStorage?.setItem(key, JSON.stringify(samples.slice(-MAX_PARITY_SAMPLES))); }
    catch (_) {}
  }

  function readParityHistory(userId) {
    if (!userId) return [];
    return readHistory(parityStorageKey(userId));
  }

  function writeParityHistory(userId, samples) {
    if (!userId) return;
    writeHistory(parityStorageKey(userId), samples);
  }

  function readDeleteParityHistory(userId) {
    if (!userId) return [];
    return readHistory(deleteParityStorageKey(userId));
  }

  function writeDeleteParityHistory(userId, samples) {
    if (!userId) return;
    writeHistory(deleteParityStorageKey(userId), samples);
  }

  async function shadowEditalUpsert(item, reason = 'queueEditalUpsert', options = {}) {
    const store = global.OfflineOutboxStore;
    const userId = currentUserId();
    if (!store || !userId || !item || item.id == null) return null;

    const entityId = String(item.id);
    const payload = stableValue({ ...item, id:entityId });
    const payloadFingerprint = fingerprint(payload);
    const idempotencyKey = `${userId}:${ENTITY}:${entityId}:upsert:${payloadFingerprint}`;
    const operation = await store.enqueue({
      userId,
      entity:ENTITY,
      entityId,
      action:'upsert',
      payload:{ record:payload, source:'pending_sync', mode:MODE, payloadFingerprint },
      idempotencyKey,
      clientUpdatedAt:String(item.updated_at || item.updatedAt || new Date().toISOString()),
      status:'shadow'
    });

    try {
      global.dispatchEvent(new CustomEvent('offline-sync-shadow:queued', {
        detail:{ mode:MODE, entity:ENTITY, entityId, action:'upsert', idempotencyKey:operation.idempotencyKey, reason }
      }));
    } catch (_) {}

    if (options.recordParity !== false) await recordParitySnapshot(reason).catch(() => null);
    return operation;
  }

  async function shadowEditalDelete(id, reason = 'queueEditalDelete', options = {}) {
    const store = global.OfflineOutboxStore;
    const userId = currentUserId();
    if (!store || !userId || id == null) return null;

    const entityId = String(id);
    const idempotencyKey = `${userId}:${ENTITY}:${entityId}:delete`;
    const operation = await store.enqueue({
      userId,
      entity:ENTITY,
      entityId,
      action:'delete',
      payload:{ source:'pending_sync', mode:MODE, deleted:true },
      idempotencyKey,
      clientUpdatedAt:new Date().toISOString(),
      status:'shadow'
    });

    try {
      global.dispatchEvent(new CustomEvent('offline-sync-shadow:queued', {
        detail:{ mode:MODE, entity:ENTITY, entityId, action:'delete', idempotencyKey:operation.idempotencyKey, reason }
      }));
    } catch (_) {}

    if (options.recordParity !== false) await recordDeleteParitySnapshot(reason).catch(() => null);
    return operation;
  }

  function legacyUpsertIds() {
    try {
      if (typeof getSyncState !== 'function') return [];
      const state = getSyncState() || {};
      return Object.keys(state.editalUpserts || {}).map(String).sort();
    } catch (_) { return []; }
  }

  function legacyDeleteIds() {
    try {
      if (typeof getSyncState !== 'function') return [];
      const state = getSyncState() || {};
      return [...new Set((Array.isArray(state.editalDeletes) ? state.editalDeletes : []).map(String))].sort();
    } catch (_) { return []; }
  }

  function compareIds(legacyIds, shadowIds) {
    const legacySet = new Set(legacyIds);
    const shadowSet = new Set(shadowIds);
    const matchedIds = legacyIds.filter(id => shadowSet.has(id));
    const missingShadowIds = legacyIds.filter(id => !shadowSet.has(id));
    const shadowOnlyIds = shadowIds.filter(id => !legacySet.has(id));
    const coverage = legacyIds.length ? matchedIds.length / legacyIds.length : 1;
    return { matchedIds, missingShadowIds, shadowOnlyIds, coverage, healthy:missingShadowIds.length === 0 };
  }

  async function getDiagnostics() {
    const userId = currentUserId();
    const store = global.OfflineOutboxStore;
    const legacyIds = legacyUpsertIds();
    const legacyDeleteIdsList = legacyDeleteIds();
    if (!userId || !store) {
      const upsertComparison = compareIds(legacyIds, []);
      const deleteComparison = compareIds(legacyDeleteIdsList, []);
      return Object.freeze({
        mode:MODE, installed, userId:userId || null,
        legacyUpserts:legacyIds.length, shadowUpserts:0, matched:upsertComparison.matchedIds.length,
        matchedIds:upsertComparison.matchedIds, missingShadowIds:upsertComparison.missingShadowIds,
        shadowOnlyIds:upsertComparison.shadowOnlyIds, coverage:upsertComparison.coverage, healthy:upsertComparison.healthy,
        legacyDeletes:legacyDeleteIdsList.length, shadowDeletes:0, deleteMatched:deleteComparison.matchedIds.length,
        deleteMatchedIds:deleteComparison.matchedIds, missingDeleteShadowIds:deleteComparison.missingShadowIds,
        deleteShadowOnlyIds:deleteComparison.shadowOnlyIds, deleteCoverage:deleteComparison.coverage, deleteHealthy:deleteComparison.healthy
      });
    }

    // Operações continuam sendo evidência do espelho ao longo de todo o ciclo
    // shadow/sending/failed/synced. Isso evita falso negativo após o sync.
    const rows = await store.list(userId, { limit:500 });
    const shadowIds = [...new Set(rows.filter(row => row.entity === ENTITY && row.action === 'upsert').map(row => String(row.entityId)))].sort();
    const shadowDeleteIds = [...new Set(rows.filter(row => row.entity === ENTITY && row.action === 'delete').map(row => String(row.entityId)))].sort();
    const upsertComparison = compareIds(legacyIds, shadowIds);
    const deleteComparison = compareIds(legacyDeleteIdsList, shadowDeleteIds);

    return Object.freeze({
      mode:MODE,
      installed,
      userId,
      deviceId:store.getDeviceId(),
      legacyUpserts:legacyIds.length,
      shadowUpserts:shadowIds.length,
      matched:upsertComparison.matchedIds.length,
      matchedIds:upsertComparison.matchedIds,
      missingShadowIds:upsertComparison.missingShadowIds,
      shadowOnlyIds:upsertComparison.shadowOnlyIds,
      coverage:upsertComparison.coverage,
      healthy:upsertComparison.healthy,
      legacyDeletes:legacyDeleteIdsList.length,
      shadowDeletes:shadowDeleteIds.length,
      deleteMatched:deleteComparison.matchedIds.length,
      deleteMatchedIds:deleteComparison.matchedIds,
      missingDeleteShadowIds:deleteComparison.missingShadowIds,
      deleteShadowOnlyIds:deleteComparison.shadowOnlyIds,
      deleteCoverage:deleteComparison.coverage,
      deleteHealthy:deleteComparison.healthy
    });
  }

  async function recordParitySnapshot(reason = 'manual') {
    const diagnostics = await getDiagnostics();
    if (!diagnostics.userId) return null;

    const sample = Object.freeze({
      schemaVersion:PARITY_SCHEMA_VERSION,
      capturedAt:new Date().toISOString(),
      reason:String(reason || 'manual'),
      mode:MODE,
      action:'upsert',
      deviceId:diagnostics.deviceId || null,
      legacyUpserts:diagnostics.legacyUpserts,
      shadowUpserts:diagnostics.shadowUpserts,
      matched:diagnostics.matched,
      coverage:diagnostics.coverage,
      healthy:diagnostics.healthy,
      missingShadowIds:[...diagnostics.missingShadowIds],
      shadowOnlyIds:[...diagnostics.shadowOnlyIds]
    });

    const history = readParityHistory(diagnostics.userId);
    history.push(sample);
    writeParityHistory(diagnostics.userId, history);

    try { global.dispatchEvent(new CustomEvent('offline-sync-shadow:parity', { detail:sample })); }
    catch (_) {}
    return sample;
  }

  async function recordDeleteParitySnapshot(reason = 'manual') {
    const diagnostics = await getDiagnostics();
    if (!diagnostics.userId) return null;

    const sample = Object.freeze({
      schemaVersion:PARITY_SCHEMA_VERSION,
      capturedAt:new Date().toISOString(),
      reason:String(reason || 'manual'),
      mode:MODE,
      action:'delete',
      deviceId:diagnostics.deviceId || null,
      legacyDeletes:diagnostics.legacyDeletes,
      shadowDeletes:diagnostics.shadowDeletes,
      matched:diagnostics.deleteMatched,
      coverage:diagnostics.deleteCoverage,
      healthy:diagnostics.deleteHealthy,
      missingShadowIds:[...diagnostics.missingDeleteShadowIds],
      shadowOnlyIds:[...diagnostics.deleteShadowOnlyIds]
    });

    const history = readDeleteParityHistory(diagnostics.userId);
    history.push(sample);
    writeDeleteParityHistory(diagnostics.userId, history);

    try { global.dispatchEvent(new CustomEvent('offline-sync-shadow:delete-parity', { detail:sample })); }
    catch (_) {}
    return sample;
  }

  function getParityHistory(options = {}) {
    const userId = currentUserId();
    if (!userId) return [];
    const limit = Math.max(1, Math.min(MAX_PARITY_SAMPLES, Number(options.limit) || 50));
    return readParityHistory(userId).slice(-limit).map(sample => Object.freeze({ ...sample }));
  }

  function getDeleteParityHistory(options = {}) {
    const userId = currentUserId();
    if (!userId) return [];
    const limit = Math.max(1, Math.min(MAX_PARITY_SAMPLES, Number(options.limit) || 50));
    return readDeleteParityHistory(userId).slice(-limit).map(sample => Object.freeze({ ...sample }));
  }

  function buildParityReport(samples) {
    const missingOccurrences = {};
    let healthySamples = 0;
    let lowestCoverage = 1;

    samples.forEach(sample => {
      if (sample.healthy) healthySamples += 1;
      lowestCoverage = Math.min(lowestCoverage, Number.isFinite(Number(sample.coverage)) ? Number(sample.coverage) : 0);
      (sample.missingShadowIds || []).forEach(id => {
        const key = String(id);
        missingOccurrences[key] = (missingOccurrences[key] || 0) + 1;
      });
    });

    const unhealthySamples = samples.length - healthySamples;
    return {
      schemaVersion:PARITY_SCHEMA_VERSION,
      mode:MODE,
      sampleCount:samples.length,
      healthySamples,
      unhealthySamples,
      healthyRate:samples.length ? healthySamples / samples.length : 1,
      lowestCoverage:samples.length ? lowestCoverage : 1,
      latest:samples.length ? samples[samples.length - 1] : null,
      missingOccurrences:Object.freeze({ ...missingOccurrences })
    };
  }

  function getParityReport(options = {}) {
    return Object.freeze({ ...buildParityReport(getParityHistory(options)), action:'upsert' });
  }

  function getDeleteParityReport(options = {}) {
    return Object.freeze({ ...buildParityReport(getDeleteParityHistory(options)), action:'delete' });
  }

  function clearParityHistory() {
    const userId = currentUserId();
    if (!userId) return false;
    try { global.localStorage?.removeItem(parityStorageKey(userId)); return true; }
    catch (_) { return false; }
  }

  function clearDeleteParityHistory() {
    const userId = currentUserId();
    if (!userId) return false;
    try { global.localStorage?.removeItem(deleteParityStorageKey(userId)); return true; }
    catch (_) { return false; }
  }

  function install() {
    if (installed) return true;
    if (!global.OfflineOutboxStore) return false;
    if (typeof global.queueEditalUpsert !== 'function' || typeof global.queueEditalDelete !== 'function') return false;

    legacyQueueEditalUpsert = global.queueEditalUpsert;
    legacyQueueEditalDelete = global.queueEditalDelete;

    global.queueEditalUpsert = function shadowedQueueEditalUpsert(item) {
      const result = legacyQueueEditalUpsert.apply(this, arguments);
      Promise.resolve(shadowEditalUpsert(item)).catch(error => {
        console.warn('Offline sync shadow de upsert não registrado; fila legada preservada:', error);
      });
      return result;
    };

    global.queueEditalDelete = function shadowedQueueEditalDelete(id) {
      const result = legacyQueueEditalDelete.apply(this, arguments);
      Promise.resolve(shadowEditalDelete(id)).catch(error => {
        console.warn('Offline sync shadow de exclusão não registrado; fila legada preservada:', error);
      });
      return result;
    };

    installed = true;
    return true;
  }

  global.OfflineSyncShadow = Object.freeze({
    MODE,
    ENTITY,
    PARITY_SCHEMA_VERSION,
    MAX_PARITY_SAMPLES,
    install,
    shadowEditalUpsert,
    shadowEditalDelete,
    getDiagnostics,
    recordParitySnapshot,
    recordDeleteParitySnapshot,
    getParityHistory,
    getDeleteParityHistory,
    getParityReport,
    getDeleteParityReport,
    clearParityHistory,
    clearDeleteParityHistory,
    isInstalled:() => installed
  });

  install();
})(typeof window !== 'undefined' ? window : globalThis);

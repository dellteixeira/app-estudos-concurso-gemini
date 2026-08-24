(function offlineSyncShadowFactory(global) {
  'use strict';

  if (!global || global.OfflineSyncShadow) return;

  const MODE = 'shadow-v1';
  const ENTITY = 'edital-topic';
  const PARITY_SCHEMA_VERSION = 1;
  const PARITY_STORAGE_PREFIX = 'offline_sync_shadow_parity_v1_';
  const MAX_PARITY_SAMPLES = 100;
  let installed = false;
  let legacyQueueEditalUpsert = null;

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

  function readParityHistory(userId) {
    if (!userId) return [];
    try {
      const value = JSON.parse(global.localStorage?.getItem(parityStorageKey(userId)) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  }

  function writeParityHistory(userId, samples) {
    if (!userId) return;
    try { global.localStorage?.setItem(parityStorageKey(userId), JSON.stringify(samples.slice(-MAX_PARITY_SAMPLES))); }
    catch (_) {}
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
        detail:{ mode:MODE, entity:ENTITY, entityId, idempotencyKey:operation.idempotencyKey, reason }
      }));
    } catch (_) {}

    if (options.recordParity !== false) await recordParitySnapshot(reason).catch(() => null);
    return operation;
  }

  function legacyUpsertIds() {
    try {
      if (typeof getSyncState !== 'function') return [];
      const state = getSyncState() || {};
      return Object.keys(state.editalUpserts || {}).map(String).sort();
    } catch (_) { return []; }
  }

  async function getDiagnostics() {
    const userId = currentUserId();
    const store = global.OfflineOutboxStore;
    const legacyIds = legacyUpsertIds();
    if (!userId || !store) {
      return Object.freeze({ mode:MODE, installed, userId:userId || null, legacyUpserts:legacyIds.length, shadowUpserts:0, matched:0, matchedIds:[], missingShadowIds:legacyIds, shadowOnlyIds:[], coverage:legacyIds.length ? 0 : 1, healthy:legacyIds.length === 0 });
    }

    // A operação continua sendo evidência do espelho após avançar de shadow para
    // sending/failed/synced. Filtrar apenas status=shadow geraria falso negativo
    // de paridade justamente depois de uma sincronização bem-sucedida.
    const rows = await store.list(userId, { limit:500 });
    const shadowIds = [...new Set(rows.filter(row => row.entity === ENTITY && row.action === 'upsert').map(row => String(row.entityId)))].sort();
    const legacySet = new Set(legacyIds);
    const shadowSet = new Set(shadowIds);
    const matchedIds = legacyIds.filter(id => shadowSet.has(id));
    const missingShadowIds = legacyIds.filter(id => !shadowSet.has(id));
    const shadowOnlyIds = shadowIds.filter(id => !legacySet.has(id));
    const coverage = legacyIds.length ? matchedIds.length / legacyIds.length : 1;

    return Object.freeze({
      mode:MODE,
      installed,
      userId,
      deviceId:store.getDeviceId(),
      legacyUpserts:legacyIds.length,
      shadowUpserts:shadowIds.length,
      matched:matchedIds.length,
      matchedIds,
      missingShadowIds,
      shadowOnlyIds,
      coverage,
      healthy:missingShadowIds.length === 0
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

  function getParityHistory(options = {}) {
    const userId = currentUserId();
    if (!userId) return [];
    const limit = Math.max(1, Math.min(MAX_PARITY_SAMPLES, Number(options.limit) || 50));
    return readParityHistory(userId).slice(-limit).map(sample => Object.freeze({ ...sample }));
  }

  function getParityReport(options = {}) {
    const samples = getParityHistory(options);
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
    return Object.freeze({
      schemaVersion:PARITY_SCHEMA_VERSION,
      mode:MODE,
      sampleCount:samples.length,
      healthySamples,
      unhealthySamples,
      healthyRate:samples.length ? healthySamples / samples.length : 1,
      lowestCoverage:samples.length ? lowestCoverage : 1,
      latest:samples.length ? samples[samples.length - 1] : null,
      missingOccurrences:Object.freeze({ ...missingOccurrences })
    });
  }

  function clearParityHistory() {
    const userId = currentUserId();
    if (!userId) return false;
    try { global.localStorage?.removeItem(parityStorageKey(userId)); return true; }
    catch (_) { return false; }
  }

  function install() {
    if (installed) return true;
    if (!global.OfflineOutboxStore) return false;
    if (typeof global.queueEditalUpsert !== 'function') return false;

    legacyQueueEditalUpsert = global.queueEditalUpsert;
    global.queueEditalUpsert = function shadowedQueueEditalUpsert(item) {
      const result = legacyQueueEditalUpsert.apply(this, arguments);
      Promise.resolve(shadowEditalUpsert(item)).catch(error => {
        console.warn('Offline sync shadow não registrado; fila legada preservada:', error);
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
    getDiagnostics,
    recordParitySnapshot,
    getParityHistory,
    getParityReport,
    clearParityHistory,
    isInstalled:() => installed
  });

  install();
})(typeof window !== 'undefined' ? window : globalThis);

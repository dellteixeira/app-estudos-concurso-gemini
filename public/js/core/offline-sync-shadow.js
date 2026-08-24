(function offlineSyncShadowFactory(global) {
  'use strict';

  if (!global || global.OfflineSyncShadow) return;

  const MODE = 'shadow-v1';
  const ENTITY = 'edital-topic';
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

  async function shadowEditalUpsert(item, reason = 'queueEditalUpsert') {
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
      return Object.freeze({ mode:MODE, installed, userId:userId || null, legacyUpserts:legacyIds.length, shadowUpserts:0, matched:0, missingShadowIds:legacyIds, shadowOnlyIds:[] });
    }

    const rows = await store.list(userId, { statuses:['shadow'], limit:500 });
    const shadowIds = [...new Set(rows.filter(row => row.entity === ENTITY && row.action === 'upsert').map(row => String(row.entityId)))].sort();
    const legacySet = new Set(legacyIds);
    const shadowSet = new Set(shadowIds);
    const matchedIds = legacyIds.filter(id => shadowSet.has(id));
    const missingShadowIds = legacyIds.filter(id => !shadowSet.has(id));
    const shadowOnlyIds = shadowIds.filter(id => !legacySet.has(id));

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
      shadowOnlyIds
    });
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
    install,
    shadowEditalUpsert,
    getDiagnostics,
    isInstalled:() => installed
  });

  install();
})(typeof window !== 'undefined' ? window : globalThis);

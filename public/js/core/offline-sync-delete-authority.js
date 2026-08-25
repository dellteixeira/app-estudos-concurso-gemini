(function offlineSyncDeleteAuthorityFactory(global) {
  'use strict';

  if (!global || global.OfflineSyncDeleteAuthority) return;

  const MODE = 'delete-authority-canary-v1';
  const ENTITY = 'edital-topic';
  const ACTION = 'delete';
  const ENABLE_PREFIX = 'offline_sync_outbox_delete_authority_v1_';
  const CIRCUIT_PREFIX = 'offline_sync_outbox_delete_circuit_v1_';
  const SESSION_PREFIX = 'offline_sync_outbox_delete_canary_session_v1_';
  const KILL_SWITCH_KEY = 'offline_sync_outbox_kill_switch_v1';
  const BATCH_SIZE = 10;
  const ELIGIBILITY_MIN_SAMPLES = 8;
  const ELIGIBILITY_WINDOW = 20;
  const MAX_CANARY_BATCHES = 2;
  const MAX_CANARY_ITEMS = 20;

  let installed = false;
  let legacySyncAllWithSupabase = null;
  let authoritySyncPromise = null;
  let lastRun = null;

  function currentUserId() {
    try {
      if (typeof currentUser !== 'undefined' && currentUser?.id) return String(currentUser.id);
    } catch (_) {}
    return null;
  }

  function storageGet(key) {
    try { return global.localStorage?.getItem(key) ?? null; }
    catch (_) { return null; }
  }

  function storageSet(key, value) {
    try { global.localStorage?.setItem(key, String(value)); return true; }
    catch (_) { return false; }
  }

  function storageRemove(key) {
    try { global.localStorage?.removeItem(key); return true; }
    catch (_) { return false; }
  }

  function enableKey(userId) { return `${ENABLE_PREFIX}${String(userId || '')}`; }
  function circuitKey(userId) { return `${CIRCUIT_PREFIX}${String(userId || '')}`; }
  function sessionKey(userId) { return `${SESSION_PREFIX}${String(userId || '')}`; }

  function getCircuit(userId = currentUserId()) {
    if (!userId) return null;
    try {
      const value = JSON.parse(storageGet(circuitKey(userId)) || 'null');
      return value && typeof value === 'object' ? Object.freeze({ ...value }) : null;
    } catch (_) { return null; }
  }

  function getCanarySession(userId = currentUserId()) {
    if (!userId) return null;
    try {
      const value = JSON.parse(storageGet(sessionKey(userId)) || 'null');
      return value && typeof value === 'object' ? Object.freeze({ ...value }) : null;
    } catch (_) { return null; }
  }

  function writeCanarySession(userId, patch = {}) {
    if (!userId) return null;
    const current = getCanarySession(userId) || {};
    const next = {
      startedAt:current.startedAt || new Date().toISOString(),
      batches:Math.max(0, Number(current.batches) || 0),
      items:Math.max(0, Number(current.items) || 0),
      ...patch
    };
    storageSet(sessionKey(userId), JSON.stringify(next));
    return Object.freeze({ ...next });
  }

  function clearCanarySession(userId = currentUserId()) {
    if (!userId) return false;
    return storageRemove(sessionKey(userId));
  }

  function getEligibility() {
    const report = global.OfflineSyncShadow?.getDeleteParityReport?.({ limit:ELIGIBILITY_WINDOW }) || null;
    const sampleCount = Math.max(0, Number(report?.sampleCount) || 0);
    const unhealthySamples = Math.max(0, Number(report?.unhealthySamples) || 0);
    const lowestCoverage = Number.isFinite(Number(report?.lowestCoverage)) ? Number(report.lowestCoverage) : 0;
    const missingCount = Object.keys(report?.missingOccurrences || {}).length;
    const reasons = [];
    if (sampleCount < ELIGIBILITY_MIN_SAMPLES) reasons.push('insufficient-delete-parity-samples');
    if (unhealthySamples > 0) reasons.push('unhealthy-delete-parity-samples');
    if (lowestCoverage < 1) reasons.push('delete-coverage-below-100');
    if (missingCount > 0) reasons.push('missing-delete-shadow-observations');
    return Object.freeze({
      eligible:reasons.length === 0,
      sampleCount,
      requiredSamples:ELIGIBILITY_MIN_SAMPLES,
      unhealthySamples,
      lowestCoverage,
      missingCount,
      window:ELIGIBILITY_WINDOW,
      reasons:Object.freeze(reasons)
    });
  }

  function getBudget(userId = currentUserId()) {
    const session = getCanarySession(userId);
    const batches = Math.max(0, Number(session?.batches) || 0);
    const items = Math.max(0, Number(session?.items) || 0);
    return Object.freeze({
      batches,
      items,
      maxBatches:MAX_CANARY_BATCHES,
      maxItems:MAX_CANARY_ITEMS,
      remainingBatches:Math.max(0, MAX_CANARY_BATCHES - batches),
      remainingItems:Math.max(0, MAX_CANARY_ITEMS - items),
      exhausted:batches >= MAX_CANARY_BATCHES || items >= MAX_CANARY_ITEMS
    });
  }

  function isHardKilled() { return storageGet(KILL_SWITCH_KEY) === '1'; }
  function isOptedIn(userId = currentUserId()) { return Boolean(userId) && storageGet(enableKey(userId)) === '1'; }

  function isEnabled(userId = currentUserId()) {
    return Boolean(userId) && isOptedIn(userId) && !isHardKilled() && !getCircuit(userId) && getEligibility().eligible && !getBudget(userId).exhausted;
  }

  function setEnabled(enabled) {
    const userId = currentUserId();
    if (!userId) return false;
    if (enabled) {
      const eligibility = getEligibility();
      if (!eligibility.eligible || isHardKilled()) return false;
      storageSet(enableKey(userId), '1');
      storageRemove(circuitKey(userId));
      writeCanarySession(userId, { startedAt:new Date().toISOString(), batches:0, items:0, completedAt:null, stopReason:null });
    } else {
      storageSet(enableKey(userId), '0');
    }
    return true;
  }

  function stopCanary(reason, detail = {}) {
    const userId = currentUserId();
    if (!userId) return false;
    storageSet(enableKey(userId), '0');
    const session = writeCanarySession(userId, { completedAt:new Date().toISOString(), stopReason:String(reason || 'stopped'), ...detail });
    try {
      global.dispatchEvent(new CustomEvent('offline-sync-delete-authority:canary-stopped', { detail:{ reason, session, userId } }));
    } catch (_) {}
    return true;
  }

  function setKillSwitch(active) {
    if (active) {
      storageSet(KILL_SWITCH_KEY, '1');
      if (isOptedIn()) stopCanary('kill-switch');
    } else storageRemove(KILL_SWITCH_KEY);
    return isHardKilled();
  }

  function resetCircuit() {
    const userId = currentUserId();
    if (!userId) return false;
    return storageRemove(circuitKey(userId));
  }

  function serializeError(error) { return String(error?.message || error || 'Falha desconhecida').slice(0, 500); }

  function tripCircuit(error) {
    const userId = currentUserId();
    if (!userId) return null;
    const state = { openedAt:new Date().toISOString(), error:serializeError(error), mode:MODE, action:ACTION };
    storageSet(circuitKey(userId), JSON.stringify(state));
    storageSet(enableKey(userId), '0');
    writeCanarySession(userId, { completedAt:new Date().toISOString(), stopReason:'circuit-open', lastError:state.error });
    try { global.dispatchEvent(new CustomEvent('offline-sync-delete-authority:circuit-open', { detail:{ ...state, userId } })); }
    catch (_) {}
    return Object.freeze(state);
  }

  function chunkArray(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
  }

  function getLegacyState() {
    try { if (typeof getSyncState === 'function') return getSyncState() || {}; }
    catch (_) {}
    return {};
  }

  function saveLegacyState(state) {
    try {
      if (typeof saveSyncState === 'function') { saveSyncState(state); return true; }
    } catch (_) {}
    return false;
  }

  function getSupabaseClient() {
    try { if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient; }
    catch (_) {}
    return global.supabaseClient || null;
  }

  async function runRemoteDelete(ids, userId) {
    const client = getSupabaseClient();
    if (!client?.from) throw new Error('Cliente Supabase indisponível para autoridade de exclusão da outbox.');
    const factory = () => client.from('edital').delete().in('id', ids).eq('user_id', userId);
    const result = typeof runSupabaseRequest === 'function' ? await runSupabaseRequest(factory) : await factory();
    if (result?.error) throw result.error;
    return result;
  }

  function removeLegacyDeleteIds(ids) {
    const latestState = getLegacyState();
    if (!Array.isArray(latestState?.editalDeletes)) return 0;
    const confirmedIds = new Set(ids.map(String));
    const before = latestState.editalDeletes.length;
    latestState.editalDeletes = latestState.editalDeletes.filter(id => !confirmedIds.has(String(id)));
    const removed = before - latestState.editalDeletes.length;
    if (removed) saveLegacyState(latestState);
    return removed;
  }

  async function prepareOperation(id) {
    const shadow = global.OfflineSyncShadow;
    if (!shadow?.shadowEditalDelete) throw new Error('Shadow offline de exclusão indisponível para preflight.');
    const operation = await shadow.shadowEditalDelete(id, 'delete-authority-preflight', { recordParity:false });
    if (!operation?.idempotencyKey) throw new Error(`Outbox não preparou a exclusão ${String(id || '')}.`);
    return operation;
  }

  async function markBatchFailed(userId, prepared, error) {
    const store = global.OfflineOutboxStore;
    if (!store) return;
    await Promise.allSettled(prepared.map(({ operation }) => store.updateStatus(
      userId, operation.idempotencyKey, 'failed',
      { attempts:Math.max(0, Number(operation.attempts) || 0) + 1, lastError:serializeError(error) }
    )));
  }

  function recordBudgetUse(userId, sentItems) {
    const current = getCanarySession(userId) || {};
    return writeCanarySession(userId, {
      batches:Math.max(0, Number(current.batches) || 0) + 1,
      items:Math.max(0, Number(current.items) || 0) + Math.max(0, Number(sentItems) || 0),
      lastBatchAt:new Date().toISOString()
    });
  }

  async function flushAuthorizedEditalDeletes() {
    const userId = currentUserId();
    const eligibility = getEligibility();
    if (!isEnabled(userId)) return Object.freeze({ handled:false, sent:0, reusedSynced:0, remaining:null, mode:MODE, eligibility, budget:getBudget(userId) });
    if (global.navigator && global.navigator.onLine === false) return Object.freeze({ handled:false, sent:0, reusedSynced:0, remaining:null, mode:MODE, eligibility, budget:getBudget(userId) });

    const store = global.OfflineOutboxStore;
    if (!store) throw new Error('Outbox offline indisponível.');

    const state = getLegacyState();
    const pendingIds = [...new Set((Array.isArray(state.editalDeletes) ? state.editalDeletes : []).map(String))];
    let sent = 0;
    let reusedSynced = 0;

    for (const sourceBatch of chunkArray(pendingIds, BATCH_SIZE)) {
      const budgetBefore = getBudget(userId);
      if (budgetBefore.exhausted) { stopCanary('budget-exhausted'); break; }
      const allowedCount = Math.max(0, Math.min(sourceBatch.length, budgetBefore.remainingItems, BATCH_SIZE));
      if (!allowedCount) { stopCanary('budget-exhausted'); break; }
      const boundedBatch = sourceBatch.slice(0, allowedCount);
      const prepared = [];
      for (const id of boundedBatch) prepared.push({ id, operation:await prepareOperation(id) });
      await global.OfflineSyncShadow?.recordDeleteParitySnapshot?.('delete-authority-preflight-batch');

      const alreadySynced = prepared.filter(entry => entry.operation.status === 'synced');
      if (alreadySynced.length) reusedSynced += removeLegacyDeleteIds(alreadySynced.map(entry => entry.id));

      const toSend = prepared.filter(entry => entry.operation.status !== 'synced');
      if (!toSend.length) continue;

      await Promise.all(toSend.map(({ operation }) => store.updateStatus(
        userId, operation.idempotencyKey, 'sending',
        { attempts:Math.max(0, Number(operation.attempts) || 0) + 1, lastError:null }
      )));

      try { await runRemoteDelete(toSend.map(entry => String(entry.id)), userId); }
      catch (error) { await markBatchFailed(userId, toSend, error); throw error; }

      await Promise.all(toSend.map(({ operation }) => store.updateStatus(userId, operation.idempotencyKey, 'synced', { lastError:null })));
      sent += removeLegacyDeleteIds(toSend.map(entry => entry.id));
      recordBudgetUse(userId, toSend.length);
      if (getBudget(userId).exhausted) stopCanary('budget-exhausted');
    }

    const remaining = Array.isArray(getLegacyState().editalDeletes) ? getLegacyState().editalDeletes.length : 0;
    const result = Object.freeze({ handled:true, sent, reusedSynced, remaining, mode:MODE, eligibility:getEligibility(), budget:getBudget(userId) });
    lastRun = Object.freeze({ ...result, completedAt:new Date().toISOString(), fallback:false });
    try { global.dispatchEvent(new CustomEvent('offline-sync-delete-authority:flushed', { detail:lastRun })); }
    catch (_) {}
    return result;
  }

  function getDiagnostics() {
    const userId = currentUserId();
    return Object.freeze({
      mode:MODE,
      installed,
      userId,
      optedIn:isOptedIn(userId),
      hardKill:isHardKilled(),
      circuit:getCircuit(userId),
      enabled:isEnabled(userId),
      batchSize:BATCH_SIZE,
      eligibility:getEligibility(),
      budget:getBudget(userId),
      canarySession:getCanarySession(userId),
      scope:Object.freeze(['edital-topic:delete']),
      lastRun
    });
  }

  function install() {
    if (installed) return true;
    if (!global.OfflineOutboxStore || !global.OfflineSyncShadow) return false;
    if (typeof global.syncAllWithSupabase !== 'function') return false;

    legacySyncAllWithSupabase = global.syncAllWithSupabase;
    global.syncAllWithSupabase = function controlledDeleteSyncAllWithSupabase() {
      if (!isEnabled()) return legacySyncAllWithSupabase.apply(this, arguments);
      if (authoritySyncPromise) return authoritySyncPromise;

      const self = this;
      const args = arguments;
      authoritySyncPromise = (async () => {
        let fallback = false;
        try { await flushAuthorizedEditalDeletes(); }
        catch (error) {
          fallback = true;
          tripCircuit(error);
          lastRun = Object.freeze({ mode:MODE, handled:true, fallback:true, error:serializeError(error), completedAt:new Date().toISOString() });
          console.warn('Autoridade de exclusão da outbox falhou; sincronização legada reassumirá o restante:', error);
          try { global.dispatchEvent(new CustomEvent('offline-sync-delete-authority:fallback', { detail:lastRun })); }
          catch (_) {}
        }

        const result = await legacySyncAllWithSupabase.apply(self, args);
        if (!fallback && lastRun) lastRun = Object.freeze({ ...lastRun, fallback:false });
        return result;
      })().finally(() => { authoritySyncPromise = null; });
      return authoritySyncPromise;
    };

    installed = true;
    return true;
  }

  global.OfflineSyncDeleteAuthority = Object.freeze({
    MODE,
    ENTITY,
    ACTION,
    BATCH_SIZE,
    ELIGIBILITY_MIN_SAMPLES,
    ELIGIBILITY_WINDOW,
    MAX_CANARY_BATCHES,
    MAX_CANARY_ITEMS,
    install,
    isEnabled,
    isOptedIn,
    isHardKilled,
    setEnabled,
    setKillSwitch,
    stopCanary,
    resetCircuit,
    getCircuit,
    getEligibility,
    getBudget,
    getCanarySession,
    clearCanarySession,
    getDiagnostics,
    flushAuthorizedEditalDeletes
  });

  install();
})(typeof window !== 'undefined' ? window : globalThis);

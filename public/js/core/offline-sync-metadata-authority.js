(function offlineSyncMetadataAuthorityFactory(global) {
  'use strict';

  if (!global || global.OfflineSyncMetadataAuthority) return;

  const MODE = 'metadata-authority-canary-v1';
  const ENTITY = 'concursos-metadata';
  const ENTITY_ID = 'concursos_metadata';
  const ENABLE_PREFIX = 'offline_sync_metadata_authority_v1_';
  const CIRCUIT_PREFIX = 'offline_sync_metadata_authority_circuit_v1_';
  const SESSION_PREFIX = 'offline_sync_metadata_authority_session_v1_';
  const KILL_SWITCH_KEY = 'offline_sync_outbox_kill_switch_v1';
  const ELIGIBILITY_MIN_SAMPLES = 8;
  const ELIGIBILITY_WINDOW = 20;
  const MAX_REMOTE_WRITES = 1;

  let installed = false;
  let legacyFlushPendingMetadata = null;
  let authorityPromise = null;
  let lastRun = null;

  function nowIso() { return new Date().toISOString(); }

  function currentUserId() {
    try {
      if (typeof currentUser !== 'undefined' && currentUser?.id) return String(currentUser.id);
    } catch (_) {}
    try { return global.currentUser?.id ? String(global.currentUser.id) : null; }
    catch (_) { return null; }
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

  function getLegacyState() {
    try { return typeof global.getSyncState === 'function' ? global.getSyncState() || {} : {}; }
    catch (_) { return {}; }
  }

  function saveLegacyState(state) {
    try {
      if (typeof global.saveSyncState === 'function') { global.saveSyncState(state); return true; }
    } catch (_) {}
    return false;
  }

  function getLocalMetadata() {
    try { return typeof global.getConcursosMetadata === 'function' ? global.getConcursosMetadata() || {} : {}; }
    catch (_) { return {}; }
  }

  function mergeMetadata(localSnapshot, remoteSnapshot) {
    try {
      if (typeof mergeConcursosMetadataPreservingHistory === 'function') {
        return mergeConcursosMetadataPreservingHistory(localSnapshot, remoteSnapshot);
      }
    } catch (_) {}
    try {
      if (typeof global.mergeConcursosMetadataPreservingHistory === 'function') {
        return global.mergeConcursosMetadataPreservingHistory(localSnapshot, remoteSnapshot);
      }
    } catch (_) {}
    throw new Error('Merge canônico de concursos_metadata indisponível.');
  }

  function persistMergedMetadata(snapshot) {
    try {
      if (typeof metadataCache !== 'undefined') metadataCache = snapshot;
    } catch (_) {}
    try {
      const key = typeof global.getConcursosMetadataStorageKey === 'function'
        ? global.getConcursosMetadataStorageKey()
        : (typeof getConcursosMetadataStorageKey === 'function' ? getConcursosMetadataStorageKey() : null);
      if (key) global.localStorage?.setItem(key, JSON.stringify(snapshot));
    } catch (_) {}
  }

  function serializeError(error) {
    return String(error?.message || error || 'Falha desconhecida').slice(0, 500);
  }

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
      startedAt:current.startedAt || nowIso(),
      remoteWrites:Math.max(0, Number(current.remoteWrites) || 0),
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
    const report = global.OfflineSyncMetadataShadow?.getParityReport?.({ limit:ELIGIBILITY_WINDOW }) || null;
    const sampleCount = Math.max(0, Number(report?.sampleCount) || 0);
    const unhealthySamples = Math.max(0, Number(report?.unhealthySamples) || 0);
    const reasons = [];
    if (sampleCount < ELIGIBILITY_MIN_SAMPLES) reasons.push('insufficient-parity-samples');
    if (unhealthySamples > 0) reasons.push('unhealthy-parity-samples');
    return Object.freeze({
      eligible:reasons.length === 0,
      sampleCount,
      requiredSamples:ELIGIBILITY_MIN_SAMPLES,
      unhealthySamples,
      window:ELIGIBILITY_WINDOW,
      reasons:Object.freeze(reasons)
    });
  }

  function getBudget(userId = currentUserId()) {
    const session = getCanarySession(userId);
    const remoteWrites = Math.max(0, Number(session?.remoteWrites) || 0);
    return Object.freeze({
      remoteWrites,
      maxRemoteWrites:MAX_REMOTE_WRITES,
      remainingRemoteWrites:Math.max(0, MAX_REMOTE_WRITES - remoteWrites),
      exhausted:remoteWrites >= MAX_REMOTE_WRITES
    });
  }

  function isHardKilled() { return storageGet(KILL_SWITCH_KEY) === '1'; }
  function isOptedIn(userId = currentUserId()) { return Boolean(userId) && storageGet(enableKey(userId)) === '1'; }
  function isEnabled(userId = currentUserId()) {
    return Boolean(userId) && isOptedIn(userId) && !isHardKilled() && !getCircuit(userId) &&
      getEligibility().eligible && !getBudget(userId).exhausted;
  }

  function stopCanary(reason, detail = {}) {
    const userId = currentUserId();
    if (!userId) return false;
    storageSet(enableKey(userId), '0');
    const session = writeCanarySession(userId, { completedAt:nowIso(), stopReason:String(reason || 'stopped'), ...detail });
    try {
      global.dispatchEvent?.(new CustomEvent('offline-sync-metadata-authority:canary-stopped', { detail:{ reason, session, userId } }));
    } catch (_) {}
    return true;
  }

  function setEnabled(enabled) {
    const userId = currentUserId();
    if (!userId) return false;
    if (enabled) {
      if (!getEligibility().eligible || isHardKilled()) return false;
      storageRemove(circuitKey(userId));
      storageSet(enableKey(userId), '1');
      writeCanarySession(userId, { startedAt:nowIso(), remoteWrites:0, completedAt:null, stopReason:null, lastError:null });
    } else storageSet(enableKey(userId), '0');
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

  function tripCircuit(error) {
    const userId = currentUserId();
    if (!userId) return null;
    const state = Object.freeze({ openedAt:nowIso(), error:serializeError(error), mode:MODE });
    storageSet(circuitKey(userId), JSON.stringify(state));
    storageSet(enableKey(userId), '0');
    writeCanarySession(userId, { completedAt:nowIso(), stopReason:'circuit-open', lastError:state.error });
    try {
      global.dispatchEvent?.(new CustomEvent('offline-sync-metadata-authority:circuit-open', { detail:{ ...state, userId } }));
    } catch (_) {}
    return state;
  }

  function getSupabaseClient() {
    try { if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient; }
    catch (_) {}
    return global.supabaseClient || null;
  }

  async function runRequest(factory) {
    try {
      if (typeof runSupabaseRequest === 'function') return await runSupabaseRequest(factory);
    } catch (_) {}
    if (typeof global.runSupabaseRequest === 'function') return global.runSupabaseRequest(factory);
    return factory();
  }

  async function readRemoteMetadata(userId) {
    const client = getSupabaseClient();
    if (!client?.from) throw new Error('Cliente Supabase indisponível para autoridade de metadados.');
    const result = await runRequest(() => client
      .from('user_settings')
      .select('setting_value')
      .eq('user_id', userId)
      .eq('setting_key', ENTITY_ID)
      .maybeSingle());
    if (result?.error) throw result.error;
    return result?.data?.setting_value || {};
  }

  async function writeRemoteMetadata(userId, snapshot) {
    const client = getSupabaseClient();
    if (!client?.from) throw new Error('Cliente Supabase indisponível para autoridade de metadados.');
    const result = await runRequest(() => client.from('user_settings').upsert({
      user_id:userId,
      setting_key:ENTITY_ID,
      setting_value:snapshot,
      updated_at:nowIso()
    }, { onConflict:'user_id,setting_key' }));
    if (result?.error) throw result.error;
    return result;
  }

  async function markOperation(userId, operation, status, patch = {}) {
    if (!operation?.idempotencyKey || !global.OfflineOutboxStore?.updateStatus) return null;
    return global.OfflineOutboxStore.updateStatus(userId, operation.idempotencyKey, status, patch);
  }

  function recordWrite(userId) {
    const session = getCanarySession(userId) || {};
    return writeCanarySession(userId, {
      remoteWrites:Math.max(0, Number(session.remoteWrites) || 0) + 1,
      lastWriteAt:nowIso()
    });
  }

  async function flushAuthorizedMetadata() {
    const userId = currentUserId();
    const eligibility = getEligibility();
    const state = getLegacyState();
    if (!isEnabled(userId) || !state.metadataDirty) {
      return Object.freeze({ handled:false, mode:MODE, eligibility, budget:getBudget(userId) });
    }
    if (global.navigator && global.navigator.onLine === false) {
      return Object.freeze({ handled:false, mode:MODE, eligibility, budget:getBudget(userId) });
    }

    const shadow = global.OfflineSyncMetadataShadow;
    if (!shadow?.mirrorDirtyMetadata || !shadow?.fingerprint) throw new Error('Shadow de metadados indisponível para preflight.');
    const operation = await shadow.mirrorDirtyMetadata();
    if (!operation?.idempotencyKey) throw new Error('Outbox não preparou concursos_metadata para o canário.');

    const syncRevision = Math.max(0, Number(operation.payload?.metadataRevision) || 0);
    const localSnapshot = operation.payload?.snapshot || getLocalMetadata();
    const preflightState = getLegacyState();
    if (!preflightState.metadataDirty || Math.max(0, Number(preflightState.metadataRevision) || 0) !== syncRevision ||
        shadow.fingerprint(getLocalMetadata()) !== operation.payload?.payloadFingerprint) {
      stopCanary('revision-changed-preflight');
      return Object.freeze({ handled:false, mode:MODE, eligibility:getEligibility(), budget:getBudget(userId), reason:'revision-changed-preflight' });
    }

    await markOperation(userId, operation, 'sending', {
      attempts:Math.max(0, Number(operation.attempts) || 0) + 1,
      lastError:null
    });

    let mergedSnapshot;
    try {
      const remoteSnapshot = await readRemoteMetadata(userId);
      mergedSnapshot = mergeMetadata(localSnapshot, remoteSnapshot);
      persistMergedMetadata(mergedSnapshot);
      await writeRemoteMetadata(userId, mergedSnapshot);
    } catch (error) {
      await markOperation(userId, operation, 'failed', {
        attempts:Math.max(0, Number(operation.attempts) || 0) + 1,
        lastError:serializeError(error)
      });
      throw error;
    }

    await markOperation(userId, operation, 'synced', { lastError:null });
    recordWrite(userId);

    const latestState = getLegacyState();
    const latestRevision = Math.max(0, Number(latestState.metadataRevision) || 0);
    const concurrentRevision = latestRevision !== syncRevision;
    latestState.metadataDirty = concurrentRevision;
    saveLegacyState(latestState);

    if (concurrentRevision) {
      try {
        if (typeof global.scheduleMetadataSync === 'function') global.scheduleMetadataSync(250);
        else if (typeof scheduleMetadataSync === 'function') scheduleMetadataSync(250);
      } catch (_) {}
    }

    stopCanary(getBudget(userId).exhausted ? 'budget-exhausted' : 'completed');
    const result = Object.freeze({
      handled:true,
      mode:MODE,
      revision:syncRevision,
      concurrentRevision,
      remainingDirty:Boolean(latestState.metadataDirty),
      eligibility:getEligibility(),
      budget:getBudget(userId)
    });
    lastRun = Object.freeze({ ...result, completedAt:nowIso(), fallback:false });
    try {
      global.dispatchEvent?.(new CustomEvent('offline-sync-metadata-authority:flushed', { detail:lastRun }));
    } catch (_) {}
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
      eligibility:getEligibility(),
      budget:getBudget(userId),
      canarySession:getCanarySession(userId),
      scope:Object.freeze(['user_settings:concursos_metadata:upsert']),
      lastRun
    });
  }

  function install() {
    if (installed) return true;
    if (!global.OfflineOutboxStore || !global.OfflineSyncMetadataShadow) return false;
    if (typeof global.flushPendingMetadata !== 'function') return false;

    legacyFlushPendingMetadata = global.flushPendingMetadata;
    global.flushPendingMetadata = function controlledFlushPendingMetadata() {
      if (!isEnabled()) return legacyFlushPendingMetadata.apply(this, arguments);
      if (authorityPromise) return authorityPromise;

      const self = this;
      const args = arguments;
      authorityPromise = (async () => {
        try {
          const result = await flushAuthorizedMetadata();
          if (!result.handled) return legacyFlushPendingMetadata.apply(self, args);
          return result;
        } catch (error) {
          tripCircuit(error);
          lastRun = Object.freeze({ mode:MODE, handled:true, fallback:true, error:serializeError(error), completedAt:nowIso() });
          console.warn('Autoridade de metadados falhou; sincronização legada reassumirá a pendência:', error);
          try {
            global.dispatchEvent?.(new CustomEvent('offline-sync-metadata-authority:fallback', { detail:lastRun }));
          } catch (_) {}
          return legacyFlushPendingMetadata.apply(self, args);
        }
      })().finally(() => { authorityPromise = null; });
      return authorityPromise;
    };
    global.flushPendingMetadata.__offlineMetadataAuthorityOriginal = legacyFlushPendingMetadata;
    installed = true;
    return true;
  }

  global.OfflineSyncMetadataAuthority = Object.freeze({
    MODE,
    ENTITY,
    ENTITY_ID,
    ELIGIBILITY_MIN_SAMPLES,
    ELIGIBILITY_WINDOW,
    MAX_REMOTE_WRITES,
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
    flushAuthorizedMetadata
  });

  install();
})(typeof window !== 'undefined' ? window : globalThis);

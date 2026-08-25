(function offlineSyncMetadataStabilityFactory(global) {
  'use strict';

  if (!global || global.OfflineSyncMetadataStability) return;

  const MODE = 'metadata-rollout-stability-v1';
  const HISTORY_PREFIX = 'offline_sync_metadata_stability_v1_';
  const WINDOW_SIZE = 10;
  const REQUIRED_SUCCESSES = 3;

  let installed = false;
  let lastObservation = null;

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

  function historyKey(userId) { return `${HISTORY_PREFIX}${String(userId || '')}`; }
  function authority() { return global.OfflineSyncMetadataAuthority || null; }
  function rollout() { return global.OfflineSyncMetadataRollout || null; }

  function readHistory(userId = currentUserId()) {
    if (!userId) return Object.freeze([]);
    try {
      const parsed = JSON.parse(storageGet(historyKey(userId)) || '[]');
      const rows = Array.isArray(parsed) ? parsed.slice(-WINDOW_SIZE) : [];
      return Object.freeze(rows.map(row => Object.freeze({ ...row })));
    } catch (_) { return Object.freeze([]); }
  }

  function writeHistory(userId, rows) {
    if (!userId) return false;
    const bounded = Array.isArray(rows) ? rows.slice(-WINDOW_SIZE) : [];
    return storageSet(historyKey(userId), JSON.stringify(bounded));
  }

  function sessionId(detail = {}) {
    const explicit = detail?.session?.startedAt || detail?.canarySession?.startedAt || null;
    if (explicit) return String(explicit);
    const diagnostic = authority()?.getDiagnostics?.()?.canarySession?.startedAt || null;
    return diagnostic ? String(diagnostic) : null;
  }

  function observe(outcome, detail = {}) {
    const userId = currentUserId();
    if (!userId) return null;
    const normalized = String(outcome || '').trim();
    if (!['success','failure','aborted'].includes(normalized)) return null;

    const id = sessionId(detail) || `${normalized}:${nowIso()}`;
    const current = [...readHistory(userId)];
    const record = {
      mode:MODE,
      userId,
      sessionId:id,
      outcome:normalized,
      reason:detail?.reason ? String(detail.reason) : null,
      observedAt:nowIso()
    };
    const index = current.findIndex(row => row?.sessionId === id);
    if (index >= 0) current[index] = record;
    else current.push(record);
    writeHistory(userId, current);
    lastObservation = Object.freeze({ ...record });
    try { global.dispatchEvent?.(new CustomEvent('offline-sync-metadata-stability:observed', { detail:lastObservation })); }
    catch (_) {}
    return lastObservation;
  }

  function getReport(userId = currentUserId()) {
    const history = readHistory(userId);
    const successes = history.filter(row => row.outcome === 'success').length;
    const failures = history.filter(row => row.outcome === 'failure').length;
    const aborted = history.filter(row => row.outcome === 'aborted').length;
    const cohort = rollout()?.getCohortAssignment?.(userId) || null;
    const parity = authority()?.getEligibility?.() || null;
    const reasons = [];
    if (!userId) reasons.push('missing-user');
    if (!cohort?.included) reasons.push('outside-rollout-cohort');
    if (successes < REQUIRED_SUCCESSES) reasons.push('insufficient-successful-canaries');
    if (failures > 0) reasons.push('recent-canary-failure');
    if (aborted > 0) reasons.push('recent-canary-abort');
    if (!parity?.eligible) reasons.push('metadata-parity-not-eligible');
    return Object.freeze({
      mode:MODE,
      userId:userId || null,
      window:WINDOW_SIZE,
      requiredSuccesses:REQUIRED_SUCCESSES,
      sampleCount:history.length,
      successes,
      failures,
      aborted,
      stable:reasons.length === 0,
      readyForExpansion:reasons.length === 0,
      cohort,
      parity,
      reasons:Object.freeze(reasons),
      history
    });
  }

  function clearHistory(userId = currentUserId()) {
    if (!userId) return false;
    return storageRemove(historyKey(userId));
  }

  function getDiagnostics() {
    return Object.freeze({
      mode:MODE,
      installed,
      userId:currentUserId(),
      report:getReport(),
      lastObservation,
      remoteAuthority:false,
      scope:Object.freeze(['local-observation:concursos_metadata'])
    });
  }

  function onFlushed(event) {
    const detail = event?.detail || {};
    if (detail?.fallback || detail?.handled !== true) return;
    observe('success', detail);
  }

  function onFallback(event) { observe('failure', { ...(event?.detail || {}), reason:'fallback' }); }
  function onCircuit(event) { observe('failure', { ...(event?.detail || {}), reason:'circuit-open' }); }
  function onCanaryStopped(event) {
    const detail = event?.detail || {};
    const reason = String(detail?.reason || 'stopped');
    if (reason === 'budget-exhausted' || reason === 'completed') return;
    if (reason === 'kill-switch' || reason === 'manual-disable') return;
    if (reason === 'circuit-open') return;
    observe('aborted', { ...detail, reason });
  }

  function install() {
    if (installed) return true;
    if (!authority() || !rollout()) return false;
    global.addEventListener?.('offline-sync-metadata-authority:flushed', onFlushed);
    global.addEventListener?.('offline-sync-metadata-authority:fallback', onFallback);
    global.addEventListener?.('offline-sync-metadata-authority:circuit-open', onCircuit);
    global.addEventListener?.('offline-sync-metadata-authority:canary-stopped', onCanaryStopped);
    installed = true;
    return true;
  }

  global.OfflineSyncMetadataStability = Object.freeze({
    MODE,
    WINDOW_SIZE,
    REQUIRED_SUCCESSES,
    install,
    observe,
    readHistory,
    clearHistory,
    getReport,
    getDiagnostics
  });
})(window);

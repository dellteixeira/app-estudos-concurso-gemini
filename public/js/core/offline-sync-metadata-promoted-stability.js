(function offlineSyncMetadataPromotedStabilityFactory(global) {
  'use strict';

  if (!global || global.OfflineSyncMetadataPromotedStability) return;

  const MODE = 'metadata-promoted-stability-v1';
  const HISTORY_PREFIX = 'offline_sync_metadata_promoted_stability_v1_';
  const WINDOW_SIZE = 10;
  const REQUIRED_CLEAN_SUCCESSES = 5;

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
  function promotion() { return global.OfflineSyncMetadataExpandedPromotion || null; }
  function rollout() { return global.OfflineSyncMetadataRollout || null; }
  function authority() { return global.OfflineSyncMetadataAuthority || null; }

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

  function isExpandedBase(userId = currentUserId()) {
    return rollout()?.getCohortAssignment?.(userId)?.tier === 'expanded-base';
  }

  function observe(outcome, detail = {}, userId = currentUserId()) {
    if (!userId || !isExpandedBase(userId)) return null;
    const normalized = String(outcome || '').trim();
    if (!['success','failure','aborted'].includes(normalized)) return null;

    const sessionId = String(detail?.sessionId || detail?.session?.startedAt || detail?.canarySession?.startedAt || `${normalized}:${nowIso()}`);
    const current = [...readHistory(userId)];
    const record = {
      mode:MODE,
      userId:String(userId),
      sessionId,
      outcome:normalized,
      reason:detail?.reason ? String(detail.reason) : null,
      observedAt:nowIso(),
      promotedAt:promotion()?.readState?.(userId)?.promotedAt || detail?.promotedAt || null
    };
    const index = current.findIndex(row => row?.sessionId === sessionId);
    if (index >= 0) current[index] = record;
    else current.push(record);
    writeHistory(userId, current);
    lastObservation = Object.freeze({ ...record });
    try { global.dispatchEvent?.(new CustomEvent('offline-sync-metadata-promoted-stability:observed', { detail:lastObservation })); }
    catch (_) {}
    return lastObservation;
  }

  function getReport(userId = currentUserId()) {
    const history = readHistory(userId);
    const successes = history.filter(row => row.outcome === 'success').length;
    const failures = history.filter(row => row.outcome === 'failure').length;
    const aborted = history.filter(row => row.outcome === 'aborted').length;
    const cohort = rollout()?.getCohortAssignment?.(userId) || null;
    const promotionState = promotion()?.readState?.(userId) || null;
    const currentlyPromoted = Boolean(promotion()?.isPromoted?.(userId));
    const parity = authority()?.getEligibility?.() || null;
    const reasons = [];

    if (!userId) reasons.push('missing-user');
    if (cohort?.tier !== 'expanded-base') reasons.push('outside-expanded-base-tier');
    if (!promotionState?.promotedAt) reasons.push('never-promoted-by-4l');
    if (!currentlyPromoted) reasons.push('promotion-not-currently-active');
    if (successes < REQUIRED_CLEAN_SUCCESSES) reasons.push('insufficient-clean-promoted-canaries');
    if (failures > 0) reasons.push('recent-promoted-canary-failure');
    if (aborted > 0) reasons.push('recent-promoted-canary-abort');
    if (!parity?.eligible) reasons.push('metadata-parity-not-eligible');

    const ready = reasons.length === 0;
    return Object.freeze({
      mode:MODE,
      userId:userId || null,
      cohort,
      tier:cohort?.tier || 'excluded',
      window:WINDOW_SIZE,
      requiredCleanSuccesses:REQUIRED_CLEAN_SUCCESSES,
      sampleCount:history.length,
      successes,
      failures,
      aborted,
      promoted:currentlyPromoted,
      promotionState,
      stable:ready,
      readyForPopulationReview:ready,
      reasons:Object.freeze(reasons),
      parity,
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
      scope:Object.freeze(['local-observation:expanded-base:promoted-depth-2:concursos_metadata'])
    });
  }

  function onBaseStabilityObserved(event) {
    const detail = event?.detail || {};
    if (detail?.outcome !== 'success') return;
    const userId = currentUserId();
    if (!promotion()?.isPromoted?.(userId)) return;
    observe('success', detail, userId);
  }

  function onPromotionRevoked(event) {
    const detail = event?.detail || {};
    const userId = detail?.userId ? String(detail.userId) : currentUserId();
    const reason = String(detail?.revokeReason || 'promotion-revoked');
    const eligibilityReasons = Array.isArray(detail?.detail?.reasons) ? detail.detail.reasons : [];
    const sourceType = String(detail?.detail?.sourceDetail?.type || detail?.detail?.sourceDetail?.source || reason);
    const failure = reason.includes('fallback') || reason.includes('circuit-open') ||
      eligibilityReasons.some(item => /failure|parity|circuit/.test(String(item)));
    const outcome = failure ? 'failure' : 'aborted';
    observe(outcome, {
      reason,
      sessionId:`revoked:${detail?.revokedAt || nowIso()}`,
      promotedAt:detail?.promotedAt || null,
      sourceType
    }, userId);
  }

  function install() {
    if (installed) return true;
    if (!promotion() || !rollout() || !authority()) return false;
    global.addEventListener?.('offline-sync-metadata-stability:observed', onBaseStabilityObserved);
    global.addEventListener?.('offline-sync-metadata-expanded-promotion:revoked', onPromotionRevoked);
    installed = true;
    return true;
  }

  global.OfflineSyncMetadataPromotedStability = Object.freeze({
    MODE,
    HISTORY_PREFIX,
    WINDOW_SIZE,
    REQUIRED_CLEAN_SUCCESSES,
    install,
    observe,
    readHistory,
    clearHistory,
    getReport,
    getDiagnostics
  });
})(window);

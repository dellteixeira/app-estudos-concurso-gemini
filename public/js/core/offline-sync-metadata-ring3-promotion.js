(function offlineSyncMetadataRing3PromotionFactory(global) {
  'use strict';

  if (!global || global.OfflineSyncMetadataRing3Promotion) return;

  const MODE = 'metadata-ring3-promotion-v1';
  const STATE_PREFIX = 'offline_sync_metadata_ring3_promotion_v1_';
  const BASE_REMOTE_WRITES = 1;
  const PROMOTED_REMOTE_WRITES = 2;

  let installed = false;
  let lastTransition = null;

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

  function stateKey(userId) { return `${STATE_PREFIX}${String(userId || '')}`; }
  function ring3Stability() { return global.OfflineSyncMetadataExpandedStability || null; }
  function rollout() { return global.OfflineSyncMetadataRollout || null; }
  function authority() { return global.OfflineSyncMetadataAuthority || null; }
  function graduation() { return global.OfflineSyncMetadataGraduation || null; }

  function readState(userId = currentUserId()) {
    if (!userId) return null;
    try {
      const value = JSON.parse(storageGet(stateKey(userId)) || 'null');
      return value && typeof value === 'object' ? Object.freeze({ ...value }) : null;
    } catch (_) { return null; }
  }

  function writeState(userId, patch = {}) {
    if (!userId) return null;
    const current = readState(userId) || {};
    const next = {
      mode:MODE,
      userId:String(userId),
      updatedAt:nowIso(),
      ...current,
      ...patch
    };
    storageSet(stateKey(userId), JSON.stringify(next));
    return Object.freeze({ ...next });
  }

  function getEligibility(userId = currentUserId()) {
    const report = ring3Stability()?.getRing3Report?.(userId) || null;
    const cohort = rollout()?.getCohortAssignment?.(userId) || null;
    const rolloutEligibility = rollout()?.getEligibility?.(userId) || null;
    const rolloutEnabled = Boolean(rollout()?.isEnabled?.(userId));
    const graduationEnabled = Boolean(graduation()?.isEnabled?.());
    const circuit = authority()?.getCircuit?.(userId) || null;
    const hardKill = Boolean(graduation()?.isHardKilled?.() || authority()?.isHardKilled?.());
    const reasons = [];

    if (!userId) reasons.push('missing-user');
    if (cohort?.tier !== 'population-expanded-ring-3') reasons.push('outside-population-expanded-ring-3-tier');
    if (!report?.readyForDepthReview) reasons.push('ring3-stability-not-ready');
    if (!rolloutEligibility?.eligible) reasons.push('metadata-rollout-not-eligible');
    if (!rolloutEnabled) reasons.push('metadata-rollout-not-active');
    if (!graduationEnabled) reasons.push('metadata-graduation-not-active');
    if (circuit) reasons.push('metadata-authority-circuit-open');
    if (hardKill) reasons.push('kill-switch-active');

    return Object.freeze({
      eligible:reasons.length === 0,
      report,
      cohort,
      rollout:rolloutEligibility,
      rolloutEnabled,
      graduationEnabled,
      circuit,
      hardKill,
      reasons:Object.freeze(reasons)
    });
  }

  function emit(name, detail) {
    try { global.dispatchEvent?.(new CustomEvent(name, { detail })); }
    catch (_) {}
  }

  function revoke(reason = 'ineligible', detail = {}, userId = currentUserId()) {
    if (!userId) return false;
    const current = readState(userId);
    if (!current?.promoted) return false;
    lastTransition = writeState(userId, {
      promoted:false,
      revokedAt:nowIso(),
      revokeReason:String(reason || 'ineligible'),
      detail
    });
    emit('offline-sync-metadata-ring3-promotion:revoked', lastTransition);
    return true;
  }

  function evaluate(detail = null, userId = currentUserId()) {
    if (!userId) return Object.freeze({ promoted:false, eligibility:getEligibility(userId), state:null });
    const eligibility = getEligibility(userId);
    const current = readState(userId);

    if (!eligibility.eligible) {
      if (current?.promoted) revoke('eligibility-regressed', { reasons:eligibility.reasons, sourceDetail:detail }, userId);
      return Object.freeze({ promoted:false, eligibility, state:readState(userId) });
    }

    if (!current?.promoted) {
      lastTransition = writeState(userId, {
        promoted:true,
        promotedAt:nowIso(),
        revokedAt:null,
        revokeReason:null,
        detail:{ sourceDetail:detail, maxRemoteWrites:PROMOTED_REMOTE_WRITES }
      });
      emit('offline-sync-metadata-ring3-promotion:promoted', lastTransition);
    }

    return Object.freeze({ promoted:true, eligibility, state:readState(userId) });
  }

  function isPromoted(userId = currentUserId()) {
    if (!userId || !readState(userId)?.promoted) return false;
    const eligibility = getEligibility(userId);
    if (eligibility.eligible) return true;
    revoke('eligibility-regressed', { reasons:eligibility.reasons }, userId);
    return false;
  }

  function getMaxRemoteWrites(userId = currentUserId()) {
    return isPromoted(userId) ? PROMOTED_REMOTE_WRITES : BASE_REMOTE_WRITES;
  }

  function getDiagnostics() {
    const userId = currentUserId();
    return Object.freeze({
      mode:MODE,
      installed,
      userId,
      promoted:isPromoted(userId),
      baseRemoteWrites:BASE_REMOTE_WRITES,
      promotedRemoteWrites:PROMOTED_REMOTE_WRITES,
      maxRemoteWrites:getMaxRemoteWrites(userId),
      eligibility:getEligibility(userId),
      state:readState(userId),
      lastTransition,
      remoteAuthority:false,
      populationPercent:55,
      scope:Object.freeze(['local-promotion-policy:population-expanded-ring-3:user_settings:concursos_metadata:budget'])
    });
  }

  function onRing3Evaluation(event) { evaluate(event?.detail || null); }
  function onSafetyRegression(event) {
    revoke(event?.type || 'safety-regression', { sourceDetail:event?.detail || null });
  }
  function onStabilityObserved(event) {
    if (!readState()?.promoted) return;
    evaluate(event?.detail || null);
  }

  function install() {
    if (installed) return true;
    if (!ring3Stability() || !rollout() || !authority() || !graduation()) return false;
    global.addEventListener?.('offline-sync-metadata-ring3-stability:evaluated', onRing3Evaluation);
    global.addEventListener?.('offline-sync-metadata-stability:observed', onStabilityObserved);
    global.addEventListener?.('offline-sync-metadata-rollout:stopped', onSafetyRegression);
    global.addEventListener?.('offline-sync-metadata-graduation:stopped', onSafetyRegression);
    global.addEventListener?.('offline-sync-metadata-authority:fallback', onSafetyRegression);
    global.addEventListener?.('offline-sync-metadata-authority:circuit-open', onSafetyRegression);
    installed = true;
    evaluate({ source:'install' });
    return true;
  }

  global.OfflineSyncMetadataRing3Promotion = Object.freeze({
    MODE,
    BASE_REMOTE_WRITES,
    PROMOTED_REMOTE_WRITES,
    install,
    readState,
    getEligibility,
    evaluate,
    isPromoted,
    getMaxRemoteWrites,
    revoke,
    getDiagnostics
  });
})(window);

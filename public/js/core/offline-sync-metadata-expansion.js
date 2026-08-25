(function offlineSyncMetadataExpansionFactory(global) {
  'use strict';

  if (!global || global.OfflineSyncMetadataExpansion) return;

  const MODE = 'metadata-stability-expansion-v3';
  const ENABLE_PREFIX = 'offline_sync_metadata_expansion_v1_';
  const STATE_PREFIX = 'offline_sync_metadata_expansion_state_v1_';
  const BASE_REMOTE_WRITES = 1;
  const EXPANDED_REMOTE_WRITES = 2;

  let installed = false;
  let suppressRolloutEvents = false;
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

  function enableKey(userId) { return `${ENABLE_PREFIX}${String(userId || '')}`; }
  function stateKey(userId) { return `${STATE_PREFIX}${String(userId || '')}`; }

  function stability() { return global.OfflineSyncMetadataStability || null; }
  function rollout() { return global.OfflineSyncMetadataRollout || null; }
  function authority() { return global.OfflineSyncMetadataAuthority || null; }
  function graduation() { return global.OfflineSyncMetadataGraduation || null; }
  function promotion() { return global.OfflineSyncMetadataExpandedPromotion || null; }

  function isOptedIn(userId = currentUserId()) {
    return Boolean(userId) && storageGet(enableKey(userId)) === '1';
  }

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
    const report = stability()?.getReport?.(userId) || null;
    const cohort = rollout()?.getCohortAssignment?.(userId) || null;
    const pilotCohort = rollout()?.getPilotCohortAssignment?.(userId) || null;
    const rolloutEligibility = rollout()?.getEligibility?.(userId) || null;
    const circuit = authority()?.getCircuit?.(userId) || null;
    const hardKill = Boolean(graduation()?.isHardKilled?.() || authority()?.isHardKilled?.());
    const promoted = Boolean(promotion()?.isPromoted?.(userId));
    const originalPilot = Boolean(pilotCohort?.included);
    const reasons = [];

    if (!userId) reasons.push('missing-user');
    if (!cohort?.included) reasons.push('outside-rollout-cohort');
    if (!originalPilot && !promoted) reasons.push('outside-expansion-pilot-cohort');
    if (originalPilot && !report?.readyForExpansion) reasons.push('metadata-stability-not-ready');
    if (!rolloutEligibility?.eligible) reasons.push('metadata-rollout-not-eligible');
    if (circuit) reasons.push('metadata-authority-circuit-open');
    if (hardKill) reasons.push('kill-switch-active');

    return Object.freeze({
      eligible:reasons.length === 0,
      stability:report,
      cohort,
      pilotCohort,
      originalPilot,
      promoted,
      promotion:promotion()?.getDiagnostics?.() || null,
      rollout:rolloutEligibility,
      circuit,
      hardKill,
      reasons:Object.freeze(reasons)
    });
  }

  function hasDepthGrant(userId = currentUserId()) {
    return Boolean(userId && (isOptedIn(userId) || promotion()?.isPromoted?.(userId)));
  }

  function isEnabled(userId = currentUserId()) {
    return Boolean(userId && hasDepthGrant(userId) && getEligibility(userId).eligible && rollout()?.isEnabled?.(userId));
  }

  function getMaxRemoteWrites(userId = currentUserId()) {
    if (!userId || !hasDepthGrant(userId)) return BASE_REMOTE_WRITES;
    const eligibility = getEligibility(userId);
    if (!eligibility.eligible) return BASE_REMOTE_WRITES;
    return EXPANDED_REMOTE_WRITES;
  }

  function emit(name, detail) {
    try { global.dispatchEvent?.(new CustomEvent(name, { detail })); }
    catch (_) {}
  }

  function disableRollout() {
    suppressRolloutEvents = true;
    try { rollout()?.setEnabled?.(false); }
    finally { suppressRolloutEvents = false; }
  }

  function stop(reason = 'stopped', detail = {}) {
    const userId = currentUserId();
    if (!userId) return false;
    storageSet(enableKey(userId), '0');
    disableRollout();
    lastTransition = writeState(userId, {
      enabled:false,
      stoppedAt:nowIso(),
      stopReason:String(reason || 'stopped'),
      detail
    });
    emit('offline-sync-metadata-expansion:stopped', lastTransition);
    return true;
  }

  function setEnabled(enabled) {
    const userId = currentUserId();
    if (!userId) return false;
    if (!enabled) return stop('manual-disable');

    const eligibility = getEligibility(userId);
    if (!eligibility.originalPilot || !eligibility.eligible) {
      storageSet(enableKey(userId), '0');
      lastTransition = writeState(userId, {
        enabled:false,
        refusedAt:nowIso(),
        stopReason:'ineligible',
        detail:{ reasons:eligibility.originalPilot ? eligibility.reasons : ['outside-expansion-pilot-cohort'] }
      });
      return false;
    }

    storageSet(enableKey(userId), '1');
    suppressRolloutEvents = true;
    try {
      if (!rollout()?.setEnabled?.(true)) throw new Error('Falha ao ativar rollout de concursos_metadata.');
    } catch (error) {
      storageSet(enableKey(userId), '0');
      rollout()?.setEnabled?.(false);
      lastTransition = writeState(userId, {
        enabled:false,
        refusedAt:nowIso(),
        stopReason:'rollout-enable-failed',
        detail:{ error:String(error?.message || error || 'unknown') }
      });
      return false;
    } finally {
      suppressRolloutEvents = false;
    }

    lastTransition = writeState(userId, {
      enabled:true,
      enabledAt:nowIso(),
      stoppedAt:null,
      stopReason:null,
      detail:{ maxRemoteWrites:EXPANDED_REMOTE_WRITES }
    });
    emit('offline-sync-metadata-expansion:enabled', lastTransition);
    return true;
  }

  function setKillSwitch(active) {
    rollout()?.setKillSwitch?.(Boolean(active));
    if (active && isOptedIn()) stop('kill-switch');
    return Boolean(graduation()?.isHardKilled?.() || authority()?.isHardKilled?.());
  }

  function getDiagnostics() {
    const userId = currentUserId();
    return Object.freeze({
      mode:MODE,
      installed,
      userId,
      optedIn:isOptedIn(userId),
      depthGrant:hasDepthGrant(userId),
      enabled:isEnabled(userId),
      baseRemoteWrites:BASE_REMOTE_WRITES,
      expandedRemoteWrites:EXPANDED_REMOTE_WRITES,
      maxRemoteWrites:getMaxRemoteWrites(userId),
      eligibility:getEligibility(userId),
      state:readState(userId),
      lastTransition,
      remoteAuthority:false,
      scope:Object.freeze(['budget-policy:user_settings:concursos_metadata:upsert'])
    });
  }

  function onRolloutStopped(event) {
    if (suppressRolloutEvents || !isOptedIn()) return;
    stop('metadata-rollout-stopped', {
      event:event?.type || null,
      rolloutDetail:event?.detail || null
    });
  }

  function onAuthorityFailure(event) {
    if (!isOptedIn()) return;
    stop('metadata-authority-failure', {
      event:event?.type || null,
      authorityDetail:event?.detail || null
    });
  }

  function onStabilityObserved(event) {
    if (!isOptedIn()) return;
    const report = stability()?.getReport?.() || null;
    if (report?.readyForExpansion) return;
    stop('metadata-stability-regressed', {
      event:event?.type || null,
      observation:event?.detail || null,
      reasons:report?.reasons || []
    });
  }

  function install() {
    if (installed) return true;
    if (!stability() || !rollout() || !authority() || !graduation()) return false;
    global.addEventListener?.('offline-sync-metadata-rollout:stopped', onRolloutStopped);
    global.addEventListener?.('offline-sync-metadata-authority:fallback', onAuthorityFailure);
    global.addEventListener?.('offline-sync-metadata-authority:circuit-open', onAuthorityFailure);
    global.addEventListener?.('offline-sync-metadata-stability:observed', onStabilityObserved);
    installed = true;
    return true;
  }

  global.OfflineSyncMetadataExpansion = Object.freeze({
    MODE,
    BASE_REMOTE_WRITES,
    EXPANDED_REMOTE_WRITES,
    install,
    getEligibility,
    isOptedIn,
    hasDepthGrant,
    isEnabled,
    getMaxRemoteWrites,
    setEnabled,
    setKillSwitch,
    stop,
    getDiagnostics
  });
})(window);

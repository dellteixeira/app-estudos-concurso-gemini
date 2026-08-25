(function offlineSyncMetadataRolloutFactory(global) {
  'use strict';

  if (!global || global.OfflineSyncMetadataRollout) return;

  const MODE = 'metadata-rollout-cohort-v4';
  const PILOT_COHORT_PERCENT = 10;
  const FIRST_EXPANDED_COHORT_PERCENT = 25;
  const PREVIOUS_COHORT_PERCENT = 35;
  const COHORT_PERCENT = 45;
  const ENABLE_PREFIX = 'offline_sync_metadata_rollout_v1_';
  const STATE_PREFIX = 'offline_sync_metadata_rollout_state_v1_';

  let installed = false;
  let suppressGraduationEvents = false;
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

  function graduation() { return global.OfflineSyncMetadataGraduation || null; }

  function cohortBucket(userId) {
    const value = String(userId || '');
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash % 100;
  }

  function getPilotCohortAssignment(userId = currentUserId()) {
    if (!userId) return Object.freeze({ userId:null, bucket:null, percent:PILOT_COHORT_PERCENT, included:false });
    const bucket = cohortBucket(userId);
    return Object.freeze({ userId:String(userId), bucket, percent:PILOT_COHORT_PERCENT, included:bucket < PILOT_COHORT_PERCENT });
  }

  function getCohortAssignment(userId = currentUserId()) {
    if (!userId) return Object.freeze({
      userId:null,
      bucket:null,
      percent:COHORT_PERCENT,
      included:false,
      pilotPercent:PILOT_COHORT_PERCENT,
      pilotIncluded:false,
      firstExpandedPercent:FIRST_EXPANDED_COHORT_PERCENT,
      firstExpandedIncluded:false,
      previousPercent:PREVIOUS_COHORT_PERCENT,
      previousIncluded:false,
      tier:'excluded'
    });
    const bucket = cohortBucket(userId);
    const included = bucket < COHORT_PERCENT;
    const pilotIncluded = bucket < PILOT_COHORT_PERCENT;
    const firstExpandedIncluded = bucket < FIRST_EXPANDED_COHORT_PERCENT;
    const previousIncluded = bucket < PREVIOUS_COHORT_PERCENT;
    let tier = 'excluded';
    if (pilotIncluded) tier = 'pilot';
    else if (firstExpandedIncluded) tier = 'expanded-base';
    else if (previousIncluded) tier = 'population-expanded-base';
    else if (included) tier = 'population-expanded-ring-2';
    return Object.freeze({
      userId:String(userId),
      bucket,
      percent:COHORT_PERCENT,
      included,
      pilotPercent:PILOT_COHORT_PERCENT,
      pilotIncluded,
      firstExpandedPercent:FIRST_EXPANDED_COHORT_PERCENT,
      firstExpandedIncluded,
      previousPercent:PREVIOUS_COHORT_PERCENT,
      previousIncluded,
      tier
    });
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
      cohort:getCohortAssignment(userId),
      updatedAt:nowIso(),
      ...current,
      ...patch
    };
    storageSet(stateKey(userId), JSON.stringify(next));
    return Object.freeze({ ...next });
  }

  function isOptedIn(userId = currentUserId()) {
    return Boolean(userId) && storageGet(enableKey(userId)) === '1';
  }

  function getEligibility(userId = currentUserId()) {
    const cohort = getCohortAssignment(userId);
    const child = graduation()?.getEligibility?.() || null;
    const reasons = [];
    if (!userId) reasons.push('missing-user');
    if (userId && !cohort.included) reasons.push('outside-rollout-cohort');
    if (!child?.eligible) reasons.push('metadata-graduation-not-eligible');
    if (graduation()?.isHardKilled?.()) reasons.push('kill-switch-active');
    return Object.freeze({
      eligible:reasons.length === 0,
      cohort,
      pilotCohort:getPilotCohortAssignment(userId),
      metadataGraduation:child,
      reasons:Object.freeze(reasons)
    });
  }

  function isEnabled(userId = currentUserId()) {
    if (!userId || !isOptedIn(userId) || !getCohortAssignment(userId).included) return false;
    return Boolean(graduation()?.isEnabled?.());
  }

  function emit(name, detail) {
    try { global.dispatchEvent?.(new CustomEvent(name, { detail })); }
    catch (_) {}
  }

  function disableGraduation() {
    suppressGraduationEvents = true;
    try { graduation()?.setEnabled?.(false); }
    finally { suppressGraduationEvents = false; }
  }

  function stop(reason = 'stopped', detail = {}) {
    const userId = currentUserId();
    if (!userId) return false;
    storageSet(enableKey(userId), '0');
    disableGraduation();
    lastTransition = writeState(userId, {
      enabled:false,
      stoppedAt:nowIso(),
      stopReason:String(reason || 'stopped'),
      detail
    });
    emit('offline-sync-metadata-rollout:stopped', lastTransition);
    return true;
  }

  function setEnabled(enabled) {
    const userId = currentUserId();
    if (!userId) return false;
    if (!enabled) return stop('manual-disable');

    const eligibility = getEligibility(userId);
    if (!eligibility.eligible) {
      storageSet(enableKey(userId), '0');
      lastTransition = writeState(userId, {
        enabled:false,
        refusedAt:nowIso(),
        stopReason:'ineligible',
        detail:{ reasons:eligibility.reasons }
      });
      return false;
    }

    suppressGraduationEvents = true;
    try {
      if (!graduation()?.setEnabled?.(true)) throw new Error('Falha ao ativar graduação de concursos_metadata.');
    } catch (error) {
      graduation()?.setEnabled?.(false);
      storageSet(enableKey(userId), '0');
      lastTransition = writeState(userId, {
        enabled:false,
        refusedAt:nowIso(),
        stopReason:'graduation-enable-failed',
        detail:{ error:String(error?.message || error || 'unknown') }
      });
      return false;
    } finally {
      suppressGraduationEvents = false;
    }

    storageSet(enableKey(userId), '1');
    lastTransition = writeState(userId, {
      enabled:true,
      enabledAt:nowIso(),
      stoppedAt:null,
      stopReason:null,
      detail:null
    });
    emit('offline-sync-metadata-rollout:enabled', lastTransition);
    return true;
  }

  function setKillSwitch(active) {
    graduation()?.setKillSwitch?.(Boolean(active));
    if (active && isOptedIn()) stop('kill-switch');
    return Boolean(graduation()?.isHardKilled?.());
  }

  function getDiagnostics() {
    const userId = currentUserId();
    return Object.freeze({
      mode:MODE,
      installed,
      userId,
      optedIn:isOptedIn(userId),
      enabled:isEnabled(userId),
      cohort:getCohortAssignment(userId),
      pilotCohort:getPilotCohortAssignment(userId),
      eligibility:getEligibility(userId),
      scope:Object.freeze(['user_settings:concursos_metadata:upsert']),
      graduation:graduation()?.getDiagnostics?.() || null,
      state:readState(userId),
      lastTransition,
      remoteAuthority:false
    });
  }

  function onGraduationStopped(event) {
    if (suppressGraduationEvents || !isOptedIn()) return;
    stop('metadata-graduation-stopped', {
      event:event?.type || null,
      graduationDetail:event?.detail || null
    });
  }

  function install() {
    if (installed) return true;
    if (!graduation()) return false;
    global.addEventListener?.('offline-sync-metadata-graduation:stopped', onGraduationStopped);
    installed = true;
    return true;
  }

  global.OfflineSyncMetadataRollout = Object.freeze({
    MODE,
    PILOT_COHORT_PERCENT,
    FIRST_EXPANDED_COHORT_PERCENT,
    PREVIOUS_COHORT_PERCENT,
    COHORT_PERCENT,
    install,
    cohortBucket,
    getPilotCohortAssignment,
    getCohortAssignment,
    getEligibility,
    isOptedIn,
    isEnabled,
    setEnabled,
    setKillSwitch,
    stop,
    getDiagnostics
  });
})(window);

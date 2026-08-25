(function offlineSyncMetadataGraduationFactory(global) {
  'use strict';

  if (!global || global.OfflineSyncMetadataGraduation) return;

  const MODE = 'metadata-authority-graduation-v1';
  const ENABLE_PREFIX = 'offline_sync_metadata_graduation_v1_';
  const STATE_PREFIX = 'offline_sync_metadata_graduation_state_v1_';
  const KILL_SWITCH_KEY = 'offline_sync_outbox_kill_switch_v1';

  let installed = false;
  let lastTransition = null;
  let suppressChildEvents = false;

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
      userId,
      updatedAt:nowIso(),
      ...current,
      ...patch
    };
    storageSet(stateKey(userId), JSON.stringify(next));
    return Object.freeze({ ...next });
  }

  function authority() { return global.OfflineSyncMetadataAuthority || null; }

  function isHardKilled() {
    return storageGet(KILL_SWITCH_KEY) === '1' || Boolean(authority()?.isHardKilled?.());
  }

  function getEligibility() {
    const child = authority()?.getEligibility?.() || null;
    const reasons = [];
    if (!child?.eligible) reasons.push('metadata-authority-not-eligible');
    if (isHardKilled()) reasons.push('kill-switch-active');
    return Object.freeze({
      eligible:reasons.length === 0,
      metadataAuthority:child,
      reasons:Object.freeze(reasons)
    });
  }

  function isOptedIn(userId = currentUserId()) {
    return Boolean(userId) && storageGet(enableKey(userId)) === '1';
  }

  function childStatus() {
    return Object.freeze({
      enabled:Boolean(authority()?.isEnabled?.()),
      optedIn:Boolean(authority()?.isOptedIn?.()),
      circuit:authority()?.getCircuit?.() || null,
      budget:authority()?.getBudget?.() || null,
      diagnostics:authority()?.getDiagnostics?.() || null
    });
  }

  function isEnabled(userId = currentUserId()) {
    if (!userId || !isOptedIn(userId) || isHardKilled()) return false;
    return Boolean(authority()?.isEnabled?.());
  }

  function emit(name, detail) {
    try { global.dispatchEvent?.(new CustomEvent(name, { detail })); }
    catch (_) {}
  }

  function disableChild() {
    suppressChildEvents = true;
    try { authority()?.setEnabled?.(false); }
    finally { suppressChildEvents = false; }
  }

  function stop(reason = 'stopped', detail = {}) {
    const userId = currentUserId();
    if (!userId) return false;
    storageSet(enableKey(userId), '0');
    disableChild();
    lastTransition = writeState(userId, {
      enabled:false,
      stoppedAt:nowIso(),
      stopReason:String(reason || 'stopped'),
      detail
    });
    emit('offline-sync-metadata-graduation:stopped', lastTransition);
    return true;
  }

  function setEnabled(enabled) {
    const userId = currentUserId();
    if (!userId) return false;
    if (!enabled) return stop('manual-disable');

    const eligibility = getEligibility();
    if (!eligibility.eligible) {
      lastTransition = writeState(userId, {
        enabled:false,
        refusedAt:nowIso(),
        stopReason:'ineligible',
        detail:{ reasons:eligibility.reasons }
      });
      return false;
    }

    suppressChildEvents = true;
    try {
      if (!authority()?.setEnabled?.(true)) throw new Error('Falha ao ativar autoridade canário de concursos_metadata.');
    } catch (error) {
      authority()?.setEnabled?.(false);
      storageSet(enableKey(userId), '0');
      lastTransition = writeState(userId, {
        enabled:false,
        refusedAt:nowIso(),
        stopReason:'child-enable-failed',
        detail:{ error:String(error?.message || error || 'unknown') }
      });
      return false;
    } finally {
      suppressChildEvents = false;
    }

    storageSet(enableKey(userId), '1');
    lastTransition = writeState(userId, {
      enabled:true,
      enabledAt:nowIso(),
      stoppedAt:null,
      stopReason:null,
      detail:null
    });
    emit('offline-sync-metadata-graduation:enabled', lastTransition);
    return true;
  }

  function setKillSwitch(active) {
    authority()?.setKillSwitch?.(Boolean(active));
    if (active) stop('kill-switch');
    return isHardKilled();
  }

  function resetCircuit() {
    return Boolean(authority()?.resetCircuit?.());
  }

  function getDiagnostics() {
    const userId = currentUserId();
    return Object.freeze({
      mode:MODE,
      installed,
      userId,
      optedIn:isOptedIn(userId),
      enabled:isEnabled(userId),
      hardKill:isHardKilled(),
      eligibility:getEligibility(),
      scope:Object.freeze(['user_settings:concursos_metadata:upsert']),
      childStatus:childStatus(),
      state:readState(userId),
      lastTransition,
      remoteAuthority:false
    });
  }

  function onChildFailure(event) {
    if (suppressChildEvents || !isOptedIn()) return;
    stop('child-authority-fallback', {
      event:event?.type || null,
      childDetail:event?.detail || null
    });
  }

  function onChildStop(event) {
    if (suppressChildEvents || !isOptedIn()) return;
    const reason = String(event?.detail?.reason || 'child-authority-stopped');
    stop(reason, {
      event:event?.type || null,
      childDetail:event?.detail || null
    });
  }

  function install() {
    if (installed) return true;
    if (!authority()) return false;

    global.addEventListener?.('offline-sync-metadata-authority:fallback', onChildFailure);
    global.addEventListener?.('offline-sync-metadata-authority:circuit-open', onChildFailure);
    global.addEventListener?.('offline-sync-metadata-authority:canary-stopped', onChildStop);

    installed = true;
    return true;
  }

  global.OfflineSyncMetadataGraduation = Object.freeze({
    MODE,
    install,
    isEnabled,
    isOptedIn,
    isHardKilled,
    setEnabled,
    setKillSwitch,
    stop,
    resetCircuit,
    getEligibility,
    getDiagnostics
  });
})(window);

(function offlineSyncEditalGraduationFactory(global) {
  'use strict';

  if (!global || global.OfflineSyncEditalGraduation) return;

  const MODE = 'edital-authority-graduation-v1';
  const ENABLE_PREFIX = 'offline_sync_edital_graduation_v1_';
  const STATE_PREFIX = 'offline_sync_edital_graduation_state_v1_';
  const KILL_SWITCH_KEY = 'offline_sync_outbox_kill_switch_v1';

  let installed = false;
  let lastTransition = null;
  let suppressChildEvents = false;

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
      updatedAt:new Date().toISOString(),
      ...current,
      ...patch
    };
    storageSet(stateKey(userId), JSON.stringify(next));
    return Object.freeze({ ...next });
  }

  function isHardKilled() {
    return storageGet(KILL_SWITCH_KEY) === '1' ||
      Boolean(global.OfflineSyncAuthority?.isHardKilled?.()) ||
      Boolean(global.OfflineSyncDeleteAuthority?.isHardKilled?.());
  }

  function getEligibility() {
    const upsert = global.OfflineSyncAuthority?.getEligibility?.() || null;
    const deleteEligibility = global.OfflineSyncDeleteAuthority?.getEligibility?.() || null;
    const reasons = [];
    if (!upsert?.eligible) reasons.push('upsert-not-eligible');
    if (!deleteEligibility?.eligible) reasons.push('delete-not-eligible');
    if (isHardKilled()) reasons.push('kill-switch-active');
    return Object.freeze({
      eligible:reasons.length === 0,
      upsert,
      delete:deleteEligibility,
      reasons:Object.freeze(reasons)
    });
  }

  function isOptedIn(userId = currentUserId()) {
    return Boolean(userId) && storageGet(enableKey(userId)) === '1';
  }

  function childStatus() {
    return Object.freeze({
      upsertEnabled:Boolean(global.OfflineSyncAuthority?.isEnabled?.()),
      deleteEnabled:Boolean(global.OfflineSyncDeleteAuthority?.isEnabled?.()),
      upsertOptedIn:Boolean(global.OfflineSyncAuthority?.isOptedIn?.()),
      deleteOptedIn:Boolean(global.OfflineSyncDeleteAuthority?.isOptedIn?.()),
      upsertCircuit:global.OfflineSyncAuthority?.getCircuit?.() || null,
      deleteCircuit:global.OfflineSyncDeleteAuthority?.getCircuit?.() || null,
      upsertBudget:global.OfflineSyncAuthority?.getBudget?.() || null,
      deleteBudget:global.OfflineSyncDeleteAuthority?.getBudget?.() || null
    });
  }

  function isEnabled(userId = currentUserId()) {
    if (!userId || !isOptedIn(userId) || isHardKilled()) return false;
    const status = childStatus();
    return status.upsertEnabled && status.deleteEnabled;
  }

  function emit(name, detail) {
    try { global.dispatchEvent(new CustomEvent(name, { detail })); }
    catch (_) {}
  }

  function disableChildren(reason) {
    suppressChildEvents = true;
    try {
      global.OfflineSyncAuthority?.setEnabled?.(false);
      global.OfflineSyncDeleteAuthority?.setEnabled?.(false);
    } finally {
      suppressChildEvents = false;
    }
    return reason;
  }

  function stop(reason = 'stopped', detail = {}) {
    const userId = currentUserId();
    if (!userId) return false;
    storageSet(enableKey(userId), '0');
    disableChildren(reason);
    lastTransition = writeState(userId, {
      enabled:false,
      stoppedAt:new Date().toISOString(),
      stopReason:String(reason || 'stopped'),
      detail
    });
    emit('offline-sync-edital-graduation:stopped', lastTransition);
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
        refusedAt:new Date().toISOString(),
        stopReason:'ineligible',
        detail:{ reasons:eligibility.reasons }
      });
      return false;
    }

    suppressChildEvents = true;
    let upsertEnabled = false;
    let deleteEnabled = false;
    try {
      upsertEnabled = Boolean(global.OfflineSyncAuthority?.setEnabled?.(true));
      if (!upsertEnabled) throw new Error('Falha ao ativar autoridade canário de upsert.');

      deleteEnabled = Boolean(global.OfflineSyncDeleteAuthority?.setEnabled?.(true));
      if (!deleteEnabled) throw new Error('Falha ao ativar autoridade canário de delete.');
    } catch (error) {
      global.OfflineSyncAuthority?.setEnabled?.(false);
      global.OfflineSyncDeleteAuthority?.setEnabled?.(false);
      storageSet(enableKey(userId), '0');
      lastTransition = writeState(userId, {
        enabled:false,
        refusedAt:new Date().toISOString(),
        stopReason:'atomic-enable-failed',
        detail:{ error:String(error?.message || error || 'unknown') }
      });
      return false;
    } finally {
      suppressChildEvents = false;
    }

    storageSet(enableKey(userId), '1');
    lastTransition = writeState(userId, {
      enabled:true,
      enabledAt:new Date().toISOString(),
      stoppedAt:null,
      stopReason:null,
      detail:null
    });
    emit('offline-sync-edital-graduation:enabled', lastTransition);
    return true;
  }

  function setKillSwitch(active) {
    global.OfflineSyncAuthority?.setKillSwitch?.(Boolean(active));
    global.OfflineSyncDeleteAuthority?.setKillSwitch?.(Boolean(active));
    if (active) stop('kill-switch');
    return isHardKilled();
  }

  function resetCircuits() {
    const upsert = global.OfflineSyncAuthority?.resetCircuit?.();
    const del = global.OfflineSyncDeleteAuthority?.resetCircuit?.();
    return Boolean(upsert || del);
  }

  function getDiagnostics() {
    const userId = currentUserId();
    const status = childStatus();
    return Object.freeze({
      mode:MODE,
      installed,
      userId,
      optedIn:isOptedIn(userId),
      enabled:isEnabled(userId),
      hardKill:isHardKilled(),
      eligibility:getEligibility(),
      scope:Object.freeze(['edital-topic:upsert', 'edital-topic:delete']),
      childStatus:status,
      state:readState(userId),
      lastTransition
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
    if (!global.OfflineSyncAuthority || !global.OfflineSyncDeleteAuthority) return false;

    global.addEventListener('offline-sync-authority:fallback', onChildFailure);
    global.addEventListener('offline-sync-delete-authority:fallback', onChildFailure);
    global.addEventListener('offline-sync-authority:circuit-open', onChildFailure);
    global.addEventListener('offline-sync-delete-authority:circuit-open', onChildFailure);
    global.addEventListener('offline-sync-authority:canary-stopped', onChildStop);
    global.addEventListener('offline-sync-delete-authority:canary-stopped', onChildStop);

    installed = true;
    return true;
  }

  global.OfflineSyncEditalGraduation = Object.freeze({
    MODE,
    install,
    isEnabled,
    isOptedIn,
    isHardKilled,
    setEnabled,
    setKillSwitch,
    stop,
    resetCircuits,
    getEligibility,
    getDiagnostics
  });
})(window);

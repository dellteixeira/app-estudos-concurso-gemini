(function offlineSyncAuthorityFactory(global) {
  'use strict';

  if (!global || global.OfflineSyncAuthority) return;

  const MODE = 'authority-canary-v1';
  const ENTITY = 'edital-topic';
  const ENABLE_PREFIX = 'offline_sync_outbox_authority_v1_';
  const CIRCUIT_PREFIX = 'offline_sync_outbox_circuit_v1_';
  const KILL_SWITCH_KEY = 'offline_sync_outbox_kill_switch_v1';
  const BATCH_SIZE = 25;

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

  function enableKey(userId) {
    return `${ENABLE_PREFIX}${String(userId || '')}`;
  }

  function circuitKey(userId) {
    return `${CIRCUIT_PREFIX}${String(userId || '')}`;
  }

  function getCircuit(userId = currentUserId()) {
    if (!userId) return null;
    try {
      const value = JSON.parse(storageGet(circuitKey(userId)) || 'null');
      return value && typeof value === 'object' ? Object.freeze({ ...value }) : null;
    } catch (_) { return null; }
  }

  function isHardKilled() {
    return storageGet(KILL_SWITCH_KEY) === '1';
  }

  function isOptedIn(userId = currentUserId()) {
    return Boolean(userId) && storageGet(enableKey(userId)) === '1';
  }

  function isEnabled(userId = currentUserId()) {
    return Boolean(userId) && isOptedIn(userId) && !isHardKilled() && !getCircuit(userId);
  }

  function setEnabled(enabled) {
    const userId = currentUserId();
    if (!userId) return false;
    if (enabled) {
      storageSet(enableKey(userId), '1');
      storageRemove(circuitKey(userId));
    } else {
      storageSet(enableKey(userId), '0');
    }
    return true;
  }

  function setKillSwitch(active) {
    if (active) storageSet(KILL_SWITCH_KEY, '1');
    else storageRemove(KILL_SWITCH_KEY);
    return isHardKilled();
  }

  function resetCircuit() {
    const userId = currentUserId();
    if (!userId) return false;
    return storageRemove(circuitKey(userId));
  }

  function serializeError(error) {
    return String(error?.message || error || 'Falha desconhecida').slice(0, 500);
  }

  function tripCircuit(error) {
    const userId = currentUserId();
    if (!userId) return null;
    const state = {
      openedAt:new Date().toISOString(),
      error:serializeError(error),
      mode:MODE
    };
    storageSet(circuitKey(userId), JSON.stringify(state));
    try {
      global.dispatchEvent(new CustomEvent('offline-sync-authority:circuit-open', { detail:{ ...state, userId } }));
    } catch (_) {}
    return Object.freeze(state);
  }

  function chunkArray(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
  }

  function getLegacyState() {
    try {
      if (typeof getSyncState === 'function') return getSyncState() || {};
    } catch (_) {}
    return {};
  }

  function saveLegacyState(state) {
    try {
      if (typeof saveSyncState === 'function') {
        saveSyncState(state);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function contentMethod(item) {
    try {
      if (typeof getContentMethod === 'function') return getContentMethod(item);
    } catch (_) {}
    return String(item?.metodo_conteudo || item?.metodoConteudo || 'automatico');
  }

  function currentContestName() {
    try {
      if (typeof currentConcurso !== 'undefined' && currentConcurso) return String(currentConcurso);
    } catch (_) {}
    return 'Concurso Geral';
  }

  function toRemoteRecord(item, userId) {
    return {
      id:String(item.id),
      user_id:userId,
      materia:item.materia || 'Geral',
      assunto:item.assunto || 'Tópico',
      prioridade:parseInt(item.prioridade) || 1,
      assunto_prioridade:parseInt(item.assunto_prioridade) || 1,
      concurso:item.concurso || currentContestName(),
      teoria:!!item.teoria,
      questoes:!!item.questoes,
      videoaula:!!item.videoaula,
      metodo_conteudo:contentMethod(item),
      rev_24h:!!item.rev_24h,
      rev_7d:!!item.rev_7d,
      rev_30d:!!item.rev_30d
    };
  }

  function getSupabaseClient() {
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    } catch (_) {}
    return global.supabaseClient || null;
  }

  async function runRemoteUpsert(payloadBatch) {
    const client = getSupabaseClient();
    if (!client?.from) throw new Error('Cliente Supabase indisponível para autoridade da outbox.');
    const factory = () => client.from('edital').upsert(payloadBatch, { onConflict:'id' });
    let result;
    try {
      if (typeof runSupabaseRequest === 'function') result = await runSupabaseRequest(factory);
      else result = await factory();
    } catch (error) {
      throw error;
    }
    if (result?.error) throw result.error;
    return result;
  }

  function removeLegacyIfUnchanged(sourceItems) {
    const latestState = getLegacyState();
    if (!latestState?.editalUpserts) return 0;
    let removed = 0;
    sourceItems.forEach(item => {
      const id = String(item.id);
      if (JSON.stringify(latestState.editalUpserts[id]) === JSON.stringify(item)) {
        delete latestState.editalUpserts[id];
        removed += 1;
      }
    });
    if (removed) saveLegacyState(latestState);
    return removed;
  }

  async function prepareOperation(item) {
    const shadow = global.OfflineSyncShadow;
    if (!shadow?.shadowEditalUpsert) throw new Error('Shadow offline indisponível para preflight.');
    const operation = await shadow.shadowEditalUpsert(item, 'authority-preflight');
    if (!operation?.idempotencyKey) throw new Error(`Outbox não preparou o tópico ${String(item?.id || '')}.`);
    return operation;
  }

  async function markBatchFailed(userId, prepared, error) {
    const store = global.OfflineOutboxStore;
    if (!store) return;
    await Promise.allSettled(prepared.map(({ operation }) => store.updateStatus(
      userId,
      operation.idempotencyKey,
      'failed',
      { attempts:Math.max(0, Number(operation.attempts) || 0) + 1, lastError:serializeError(error) }
    )));
  }

  async function flushAuthorizedEditalUpserts() {
    const userId = currentUserId();
    if (!isEnabled(userId)) return Object.freeze({ handled:false, sent:0, reusedSynced:0, remaining:null, mode:MODE });
    if (global.navigator && global.navigator.onLine === false) return Object.freeze({ handled:false, sent:0, reusedSynced:0, remaining:null, mode:MODE });

    const store = global.OfflineOutboxStore;
    if (!store) throw new Error('Outbox offline indisponível.');

    const state = getLegacyState();
    const pendingItems = Object.values(state.editalUpserts || {}).filter(item => item?.id != null);
    let sent = 0;
    let reusedSynced = 0;

    for (const sourceBatch of chunkArray(pendingItems, BATCH_SIZE)) {
      const prepared = [];
      for (const item of sourceBatch) {
        const operation = await prepareOperation(item);
        prepared.push({ item, operation });
      }

      const alreadySynced = prepared.filter(entry => entry.operation.status === 'synced');
      if (alreadySynced.length) {
        reusedSynced += removeLegacyIfUnchanged(alreadySynced.map(entry => entry.item));
      }

      const toSend = prepared.filter(entry => entry.operation.status !== 'synced');
      if (!toSend.length) continue;

      await Promise.all(toSend.map(({ operation }) => store.updateStatus(
        userId,
        operation.idempotencyKey,
        'sending',
        { attempts:Math.max(0, Number(operation.attempts) || 0) + 1, lastError:null }
      )));

      try {
        await runRemoteUpsert(toSend.map(({ item }) => toRemoteRecord(item, userId)));
      } catch (error) {
        await markBatchFailed(userId, toSend, error);
        throw error;
      }

      await Promise.all(toSend.map(({ operation }) => store.updateStatus(
        userId,
        operation.idempotencyKey,
        'synced',
        { lastError:null }
      )));
      sent += removeLegacyIfUnchanged(toSend.map(entry => entry.item));
    }

    const remaining = Object.keys(getLegacyState().editalUpserts || {}).length;
    const result = Object.freeze({ handled:true, sent, reusedSynced, remaining, mode:MODE });
    lastRun = Object.freeze({ ...result, completedAt:new Date().toISOString(), fallback:false });
    try {
      global.dispatchEvent(new CustomEvent('offline-sync-authority:flushed', { detail:lastRun }));
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
      batchSize:BATCH_SIZE,
      scope:Object.freeze(['edital-topic:upsert']),
      lastRun
    });
  }

  function install() {
    if (installed) return true;
    if (!global.OfflineOutboxStore || !global.OfflineSyncShadow) return false;
    if (typeof global.syncAllWithSupabase !== 'function') return false;

    legacySyncAllWithSupabase = global.syncAllWithSupabase;
    global.syncAllWithSupabase = function controlledSyncAllWithSupabase() {
      if (!isEnabled()) return legacySyncAllWithSupabase.apply(this, arguments);
      if (authoritySyncPromise) return authoritySyncPromise;

      const self = this;
      const args = arguments;
      authoritySyncPromise = (async () => {
        let fallback = false;
        try {
          await flushAuthorizedEditalUpserts();
        } catch (error) {
          fallback = true;
          tripCircuit(error);
          lastRun = Object.freeze({
            mode:MODE,
            handled:true,
            fallback:true,
            error:serializeError(error),
            completedAt:new Date().toISOString()
          });
          console.warn('Autoridade da outbox falhou; sincronização legada reassumirá o restante:', error);
          try {
            global.dispatchEvent(new CustomEvent('offline-sync-authority:fallback', { detail:lastRun }));
          } catch (_) {}
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

  global.OfflineSyncAuthority = Object.freeze({
    MODE,
    ENTITY,
    BATCH_SIZE,
    install,
    isEnabled,
    isOptedIn,
    isHardKilled,
    setEnabled,
    setKillSwitch,
    resetCircuit,
    getCircuit,
    getDiagnostics,
    flushAuthorizedEditalUpserts
  });

  install();
})(typeof window !== 'undefined' ? window : globalThis);

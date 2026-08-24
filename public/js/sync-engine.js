(function installSyncEngine(global) {
    'use strict';

    if (global.SyncEngine) return;

    const BACKOFF_MS = [2000, 5000, 15000, 30000, 60000];
    const listeners = new Set();
    let runPromise = null;
    let retryTimer = null;
    let pollTimer = null;
    let lastQueueSignature = '';

    function userId() {
        try { return typeof currentUser !== 'undefined' && currentUser?.id ? String(currentUser.id) : 'guest'; }
        catch (_) { return 'guest'; }
    }

    function storageKey() { return `sync_engine_state_${userId()}`; }

    function defaultState() {
        return {
            schemaVersion:1,
            status:'idle',
            attempt:0,
            pending:0,
            lastSyncedAt:null,
            lastError:null,
            nextRetryAt:null,
            conflict:null,
            updatedAt:new Date().toISOString()
        };
    }

    function normalizeState(value) {
        const base = defaultState();
        const state = value && typeof value === 'object' ? { ...base, ...value } : base;
        const allowed = new Set(['idle','pending','syncing','synced','error','conflict']);
        if (!allowed.has(state.status)) state.status = 'idle';
        state.attempt = Math.max(0, Number(state.attempt) || 0);
        state.pending = Math.max(0, Number(state.pending) || 0);
        return state;
    }

    function readState() {
        try { return normalizeState(JSON.parse(localStorage.getItem(storageKey()) || 'null')); }
        catch (_) { return defaultState(); }
    }

    function writeState(next) {
        const state = normalizeState({ ...next, updatedAt:new Date().toISOString() });
        try { localStorage.setItem(storageKey(), JSON.stringify(state)); } catch (_) {}
        listeners.forEach(listener => {
            try { listener({ ...state }); }
            catch (error) { console.warn('SyncEngine subscriber failed:', error); }
        });
        global.dispatchEvent(new CustomEvent('syncengine:state', { detail:{ ...state } }));
        return state;
    }

    function queueState() {
        try { return typeof getSyncState === 'function' ? getSyncState() : null; }
        catch (_) { return null; }
    }

    function pendingCount() {
        try {
            if (typeof getPendingSyncCount === 'function') return Math.max(0, Number(getPendingSyncCount()) || 0);
            if (typeof hasPendingSync === 'function') return hasPendingSync() ? 1 : 0;
        } catch (_) {}
        return 0;
    }

    function queueSignature() {
        try { return JSON.stringify(queueState() || {}); }
        catch (_) { return String(pendingCount()); }
    }

    function setStatus(status, patch = {}) {
        return writeState({ ...readState(), ...patch, status, pending:pendingCount() });
    }

    function clearRetry() {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = null;
    }

    function nextDelay(attempt) {
        return BACKOFF_MS[Math.min(Math.max(0, attempt), BACKOFF_MS.length - 1)];
    }

    function isConflictError(error) {
        const code = String(error?.code || error?.status || '');
        const message = String(error?.message || '').toLowerCase();
        return code === '409' || message.includes('conflict') || message.includes('conflito de versão');
    }

    function scheduleRetry(attempt) {
        clearRetry();
        if (!navigator.onLine || userId() === 'guest') return;
        const delay = nextDelay(attempt);
        const nextRetryAt = new Date(Date.now() + delay).toISOString();
        writeState({ ...readState(), status:'error', nextRetryAt, pending:pendingCount() });
        retryTimer = setTimeout(() => {
            retryTimer = null;
            syncNow({ reason:'automatic-retry' }).catch(() => {});
        }, delay);
    }

    async function syncNow(options = {}) {
        if (runPromise) return runPromise;
        if (userId() === 'guest') return setStatus('idle', { lastError:null, nextRetryAt:null });

        const pendingBefore = pendingCount();
        if (!navigator.onLine) return setStatus(pendingBefore ? 'pending' : 'synced', { nextRetryAt:null });
        if (!pendingBefore && !options.force) return setStatus('synced', { attempt:0, lastError:null, nextRetryAt:null });
        if (typeof syncAllWithSupabase !== 'function') throw new Error('Sincronização com Supabase indisponível.');

        clearRetry();
        const previous = readState();
        const attempt = Math.max(0, Number(previous.attempt) || 0);
        const revisionBefore = Math.max(0, Number(queueState()?.metadataRevision) || 0);
        setStatus('syncing', { attempt, lastError:null, nextRetryAt:null, conflict:null });

        runPromise = (async () => {
            try {
                await syncAllWithSupabase();
                const pendingAfter = pendingCount();
                const revisionAfter = Math.max(0, Number(queueState()?.metadataRevision) || 0);

                if (pendingAfter > 0) {
                    const concurrentLocalChange = revisionAfter !== revisionBefore;
                    const state = setStatus('pending', {
                        attempt:0,
                        lastError:concurrentLocalChange ? 'Novas alterações locais foram registradas durante a sincronização.' : null,
                        nextRetryAt:null
                    });
                    if (navigator.onLine) {
                        retryTimer = setTimeout(() => {
                            retryTimer = null;
                            syncNow({ reason:'pending-drain' }).catch(() => {});
                        }, concurrentLocalChange ? 1200 : 3000);
                    }
                    return state;
                }

                return setStatus('synced', {
                    attempt:0,
                    lastSyncedAt:new Date().toISOString(),
                    lastError:null,
                    nextRetryAt:null,
                    conflict:null
                });
            } catch (error) {
                if (isConflictError(error)) {
                    return setStatus('conflict', {
                        attempt:attempt + 1,
                        conflict:{ message:String(error.message || 'Conflito de sincronização.'), detectedAt:new Date().toISOString() },
                        lastError:String(error.message || error),
                        nextRetryAt:null
                    });
                }
                const nextAttempt = attempt + 1;
                setStatus('error', { attempt:nextAttempt, lastError:String(error?.message || error), nextRetryAt:null });
                scheduleRetry(nextAttempt);
                throw error;
            } finally {
                runPromise = null;
            }
        })();

        return runPromise;
    }

    function markPending(reason = 'local-change') {
        const pending = pendingCount();
        const state = readState();
        if (!pending) return writeState({ ...state, pending:0, status:state.status === 'syncing' ? 'syncing' : 'synced' });
        const next = writeState({ ...state, status:state.status === 'syncing' ? 'syncing' : 'pending', pending, lastError:null, nextRetryAt:null });
        global.dispatchEvent(new CustomEvent('syncengine:pending', { detail:{ reason, pending } }));
        if (navigator.onLine && !runPromise) {
            clearRetry();
            retryTimer = setTimeout(() => {
                retryTimer = null;
                syncNow({ reason }).catch(() => {});
            }, 800);
        }
        return next;
    }

    function reportConflict(conflict) {
        clearRetry();
        const details = conflict && typeof conflict === 'object' ? conflict : { message:String(conflict || 'Conflito detectado.') };
        return setStatus('conflict', {
            conflict:{ ...details, detectedAt:details.detectedAt || new Date().toISOString() },
            lastError:details.message || 'Conflito detectado.',
            nextRetryAt:null
        });
    }

    async function resolveConflict(strategy = 'retry') {
        const state = readState();
        if (state.status !== 'conflict') return state;
        if (!['retry','keep-local'].includes(strategy)) throw new Error('Estratégia de conflito não suportada.');
        writeState({ ...state, status:'pending', conflict:null, lastError:null, attempt:0, nextRetryAt:null });
        return syncNow({ force:true, reason:`conflict-${strategy}` });
    }

    function subscribe(listener, options = {}) {
        if (typeof listener !== 'function') throw new TypeError('listener must be a function');
        listeners.add(listener);
        if (options.immediate !== false) listener({ ...readState(), pending:pendingCount() });
        return () => listeners.delete(listener);
    }

    function reconcileQueueState(reason = 'poll') {
        const signature = queueSignature();
        if (signature === lastQueueSignature) return;
        lastQueueSignature = signature;
        const pending = pendingCount();
        const state = readState();
        if (state.status === 'syncing' || state.status === 'conflict') {
            writeState({ ...state, pending });
            return;
        }
        if (pending > 0) markPending(reason);
        else writeState({ ...state, status:navigator.onLine ? 'synced' : 'idle', pending:0, attempt:0, lastError:null, nextRetryAt:null });
    }

    global.addEventListener('online', () => {
        reconcileQueueState('online');
        if (pendingCount() > 0) syncNow({ reason:'online' }).catch(() => {});
    });
    global.addEventListener('offline', () => {
        clearRetry();
        setStatus(pendingCount() ? 'pending' : 'idle', { nextRetryAt:null });
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reconcileQueueState('visibility');
    });

    pollTimer = setInterval(() => reconcileQueueState('queue-change'), 1500);
    lastQueueSignature = queueSignature();
    reconcileQueueState('startup');

    global.SyncEngine = Object.freeze({
        getState:() => ({ ...readState(), pending:pendingCount() }),
        getPendingCount:pendingCount,
        syncNow,
        markPending,
        reportConflict,
        resolveConflict,
        subscribe,
        stop() { clearRetry(); if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
    });

    global.dispatchEvent(new CustomEvent('syncengine:ready', { detail:global.SyncEngine.getState() }));
})(window);

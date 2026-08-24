(function installAppState(global) {
    'use strict';

    if (global.AppState) return;

    const listeners = new Set();
    let revision = 0;

    function clone(value) {
        if (value == null) return value;
        try { return structuredClone(value); }
        catch (_) {
            try { return JSON.parse(JSON.stringify(value)); }
            catch (_) { return value; }
        }
    }

    function safeCurrentUser() {
        try { return typeof currentUser !== 'undefined' ? currentUser : null; }
        catch (_) { return null; }
    }

    function safeCurrentContestName() {
        try { return typeof currentConcurso !== 'undefined' && currentConcurso ? currentConcurso : 'Concurso Geral'; }
        catch (_) { return 'Concurso Geral'; }
    }

    function safeMetadata() {
        try {
            if (typeof getConcursosMetadata === 'function') return getConcursosMetadata() || {};
        } catch (_) {}
        return {};
    }

    function safeEdital(options = {}) {
        try {
            const source = options.all && typeof allEditalItems !== 'undefined' ? allEditalItems : editalItems;
            return Array.isArray(source) ? source : [];
        } catch (_) { return []; }
    }

    function makeSnapshot(reason = 'read') {
        const user = safeCurrentUser();
        const name = safeCurrentContestName();
        const metadata = safeMetadata();
        return Object.freeze({
            revision,
            reason,
            user: user ? { id:user.id || null, email:user.email || null } : null,
            currentContest: name,
            contest: clone(metadata[name] || null),
            edital: clone(safeEdital()),
            sync: global.SyncEngine?.getState?.() || null
        });
    }

    function notify(reason = 'change', detail = null) {
        revision += 1;
        const snapshot = makeSnapshot(reason);
        listeners.forEach(listener => {
            try { listener(snapshot, detail); }
            catch (error) { console.warn('AppState subscriber failed:', error); }
        });
        global.dispatchEvent(new CustomEvent('appstate:changed', { detail:{ snapshot, reason, detail } }));
        return snapshot;
    }

    function getCurrentContest() {
        const name = safeCurrentContestName();
        const metadata = safeMetadata();
        return { name, data:clone(metadata[name] || null) };
    }

    function getEdital(options = {}) {
        return clone(safeEdital(options));
    }

    function findTopic(ref) {
        const source = safeEdital({ all:true });
        if (ref == null) return null;
        if (typeof ref === 'object') {
            if (ref.id != null) return source.find(item => String(item.id) === String(ref.id)) || null;
            if (ref.materia != null && ref.assunto != null) {
                return source.find(item => item.materia === ref.materia && item.assunto === ref.assunto &&
                    (!ref.concurso || (item.concurso || 'Concurso Geral') === ref.concurso)) || null;
            }
        }
        return source.find(item => String(item.id) === String(ref)) || null;
    }

    function getTopic(ref) {
        return clone(findTopic(ref));
    }

    async function updateTopic(ref, patch, options = {}) {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('patch must be an object');
        const item = findTopic(ref);
        if (!item) throw new Error('Tópico não encontrado no estado atual.');

        const protectedFields = new Set(['id','user_id']);
        Object.entries(patch).forEach(([key, value]) => {
            if (!protectedFields.has(key)) item[key] = value;
        });

        if (typeof queueEditalUpsert === 'function') queueEditalUpsert(item);
        if (typeof saveEditalToLocalStorage === 'function') saveEditalToLocalStorage();
        if (typeof filterDataByConcurso === 'function') filterDataByConcurso();

        if (options.render !== false) {
            try { if (typeof renderTable === 'function') renderTable(); } catch (_) {}
            try { if (typeof renderMonthCalendar === 'function') renderMonthCalendar(); } catch (_) {}
            try { if (typeof updateModernOverview === 'function') updateModernOverview(); } catch (_) {}
            try { if (typeof renderRetentionDiagnostics === 'function') renderRetentionDiagnostics(); } catch (_) {}
        }

        global.SyncEngine?.markPending?.('topic-update');
        notify('topic:update', { id:item.id, patch:clone(patch) });
        return clone(item);
    }

    async function setCurrentContest(name) {
        const normalized = String(name || '').trim();
        if (!normalized) throw new Error('Nome do concurso inválido.');
        if (typeof changeConcurso !== 'function') throw new Error('Troca de concurso indisponível.');
        const result = await changeConcurso(normalized);
        notify('contest:change', { name:normalized });
        return result;
    }

    function subscribe(listener, options = {}) {
        if (typeof listener !== 'function') throw new TypeError('listener must be a function');
        listeners.add(listener);
        if (options.immediate !== false) listener(makeSnapshot('subscribe'), null);
        return () => listeners.delete(listener);
    }

    function refresh(reason = 'refresh') {
        return notify(reason);
    }

    global.addEventListener('storage', event => {
        if (!event.key) return;
        if (/^(concursos_metadata_|edital_offline_data_|pending_sync_)/.test(event.key)) notify('storage:external', { key:event.key });
    });
    global.addEventListener('syncengine:state', event => notify('sync:state', event.detail || null));

    global.AppState = Object.freeze({
        getSnapshot: makeSnapshot,
        getCurrentContest,
        getEdital,
        getTopic,
        updateTopic,
        setCurrentContest,
        subscribe,
        refresh
    });

    global.dispatchEvent(new CustomEvent('appstate:ready', { detail:{ revision } }));
})(window);

(function installAppState(global) {
    'use strict';

    if (global.AppState) return;

    const SCHEMA_VERSION = 2;
    const listeners = new Set();
    let revision = 0;
    let lastChangedAt = new Date().toISOString();

    function loadExtensionScript(src, marker) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-appstate-extension="${marker}"]`);
            if (existing) {
                if (existing.dataset.loaded === '1') return resolve();
                existing.addEventListener('load', () => resolve(), { once:true });
                existing.addEventListener('error', reject, { once:true });
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.async = false;
            script.dataset.appstateExtension = marker;
            script.onload = () => { script.dataset.loaded = '1'; resolve(); };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async function loadOfflineSyncFoundation() {
        if (!global.OfflineOutboxStore) await loadExtensionScript('./js/core/offline-outbox-store.js?v=10.48.0', 'offline-outbox-store');
        if (!global.OfflineSyncShadow) await loadExtensionScript('./js/core/offline-sync-shadow.js?v=10.48.0', 'offline-sync-shadow');
        global.OfflineSyncShadow?.install?.();
        if (!global.OfflineSyncMetadataShadow) await loadExtensionScript('./js/core/offline-sync-metadata-shadow.js?v=10.48.0', 'offline-sync-metadata-shadow');
        global.OfflineSyncMetadataShadow?.install?.();
        if (!global.OfflineSyncMetadataAuthority) await loadExtensionScript('./js/core/offline-sync-metadata-authority.js?v=10.48.0', 'offline-sync-metadata-authority');
        global.OfflineSyncMetadataAuthority?.install?.();
        if (!global.OfflineSyncMetadataGraduation) await loadExtensionScript('./js/core/offline-sync-metadata-graduation.js?v=10.48.0', 'offline-sync-metadata-graduation');
        global.OfflineSyncMetadataGraduation?.install?.();
        if (!global.OfflineSyncMetadataRollout) await loadExtensionScript('./js/core/offline-sync-metadata-rollout.js?v=10.48.0', 'offline-sync-metadata-rollout');
        global.OfflineSyncMetadataRollout?.install?.();
        if (!global.OfflineSyncMetadataStability) await loadExtensionScript('./js/core/offline-sync-metadata-stability.js?v=10.48.0', 'offline-sync-metadata-stability');
        global.OfflineSyncMetadataStability?.install?.();
        if (!global.OfflineSyncMetadataExpandedStability) await loadExtensionScript('./js/core/offline-sync-metadata-expanded-stability.js?v=10.48.0', 'offline-sync-metadata-expanded-stability');
        global.OfflineSyncMetadataExpandedStability?.install?.();
        if (!global.OfflineSyncMetadataExpandedPromotion) await loadExtensionScript('./js/core/offline-sync-metadata-expanded-promotion.js?v=10.48.0', 'offline-sync-metadata-expanded-promotion');
        global.OfflineSyncMetadataExpandedPromotion?.install?.();
        if (!global.OfflineSyncMetadataPromotedStability) await loadExtensionScript('./js/core/offline-sync-metadata-promoted-stability.js?v=10.48.0', 'offline-sync-metadata-promoted-stability');
        global.OfflineSyncMetadataPromotedStability?.install?.();
        if (!global.OfflineSyncMetadataPopulationPromotion) await loadExtensionScript('./js/core/offline-sync-metadata-population-promotion.js?v=10.48.0', 'offline-sync-metadata-population-promotion');
        global.OfflineSyncMetadataPopulationPromotion?.install?.();
        if (!global.OfflineSyncMetadataExpansion) await loadExtensionScript('./js/core/offline-sync-metadata-expansion.js?v=10.48.0', 'offline-sync-metadata-expansion');
        global.OfflineSyncMetadataExpansion?.install?.();
        if (!global.OfflineSyncAuthority) await loadExtensionScript('./js/core/offline-sync-authority.js?v=10.48.0', 'offline-sync-authority');
        global.OfflineSyncAuthority?.install?.();
        if (!global.OfflineSyncDeleteAuthority) await loadExtensionScript('./js/core/offline-sync-delete-authority.js?v=10.48.0', 'offline-sync-delete-authority');
        global.OfflineSyncDeleteAuthority?.install?.();
        if (!global.OfflineSyncEditalGraduation) await loadExtensionScript('./js/core/offline-sync-edital-graduation.js?v=10.48.0', 'offline-sync-edital-graduation');
        global.OfflineSyncEditalGraduation?.install?.();
        return {
            shadow:await global.OfflineSyncShadow?.getDiagnostics?.() || null,
            metadataShadow:await global.OfflineSyncMetadataShadow?.getDiagnostics?.() || null,
            metadataAuthority:global.OfflineSyncMetadataAuthority?.getDiagnostics?.() || null,
            metadataGraduation:global.OfflineSyncMetadataGraduation?.getDiagnostics?.() || null,
            metadataRollout:global.OfflineSyncMetadataRollout?.getDiagnostics?.() || null,
            metadataStability:global.OfflineSyncMetadataStability?.getDiagnostics?.() || null,
            metadataExpandedStability:global.OfflineSyncMetadataExpandedStability?.getDiagnostics?.() || null,
            metadataExpandedPromotion:global.OfflineSyncMetadataExpandedPromotion?.getDiagnostics?.() || null,
            metadataPromotedStability:global.OfflineSyncMetadataPromotedStability?.getDiagnostics?.() || null,
            metadataPopulationPromotion:global.OfflineSyncMetadataPopulationPromotion?.getDiagnostics?.() || null,
            metadataExpansion:global.OfflineSyncMetadataExpansion?.getDiagnostics?.() || null,
            authority:global.OfflineSyncAuthority?.getDiagnostics?.() || null,
            deleteAuthority:global.OfflineSyncDeleteAuthority?.getDiagnostics?.() || null,
            editalGraduation:global.OfflineSyncEditalGraduation?.getDiagnostics?.() || null
        };
    }

    loadOfflineSyncFoundation().catch(error => console.warn('Fundação offline incremental indisponível; sincronização legada preservada.', error));

    function clone(value) { if (value == null) return value; try { return structuredClone(value); } catch (_) { try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; } } }
    function safeCurrentUser() { try { return typeof currentUser !== 'undefined' ? currentUser : null; } catch (_) { return null; } }
    function safeCurrentContestName() { try { return typeof currentConcurso !== 'undefined' && currentConcurso ? currentConcurso : 'Concurso Geral'; } catch (_) { return 'Concurso Geral'; } }
    function safeMetadata() { try { if (typeof getConcursosMetadata === 'function') return getConcursosMetadata() || {}; } catch (_) {} return {}; }
    function safeEdital(options = {}) { try { const source = options.all && typeof allEditalItems !== 'undefined' ? allEditalItems : editalItems; return Array.isArray(source) ? source : []; } catch (_) { return []; } }

    function makeSnapshot(reason = 'read') {
        const user = safeCurrentUser(); const name = safeCurrentContestName(); const metadata = safeMetadata();
        return Object.freeze({ schemaVersion:SCHEMA_VERSION, revision, reason, changedAt:lastChangedAt, user:user ? { id:user.id || null, email:user.email || null } : null, currentContest:name, contest:clone(metadata[name] || null), edital:clone(safeEdital()), sync:global.SyncEngine?.getState?.() || null });
    }

    function notify(reason = 'change', detail = null) {
        revision += 1; lastChangedAt = new Date().toISOString(); const snapshot = makeSnapshot(reason);
        listeners.forEach(listener => { try { listener(snapshot, detail); } catch (error) { console.warn('AppState subscriber failed:', error); } });
        global.dispatchEvent(new CustomEvent('appstate:changed', { detail:{ snapshot, reason, detail } })); return snapshot;
    }

    function getCurrentContest() { const name = safeCurrentContestName(); const metadata = safeMetadata(); return { name, data:clone(metadata[name] || null) }; }
    function getEdital(options = {}) { return clone(safeEdital(options)); }
    function findTopic(ref) {
        const source = safeEdital({ all:true }); if (ref == null) return null;
        if (typeof ref === 'object') { if (ref.id != null) return source.find(item => String(item.id) === String(ref.id)) || null; if (ref.materia != null && ref.assunto != null) return source.find(item => item.materia === ref.materia && item.assunto === ref.assunto && (!ref.concurso || (item.concurso || 'Concurso Geral') === ref.concurso)) || null; }
        return source.find(item => String(item.id) === String(ref)) || null;
    }
    function getTopic(ref) { return clone(findTopic(ref)); }
    function select(selector) { if (typeof selector !== 'function') throw new TypeError('selector must be a function'); return clone(selector(makeSnapshot('select'))); }
    function getDiagnostics() { const snapshot = makeSnapshot('diagnostics'); return Object.freeze({ schemaVersion:SCHEMA_VERSION, revision, subscriberCount:listeners.size, changedAt:lastChangedAt, currentContest:snapshot.currentContest, editalCount:Array.isArray(snapshot.edital) ? snapshot.edital.length : 0, authenticated:Boolean(snapshot.user?.id), syncStatus:snapshot.sync?.status || null, syncPending:Math.max(0, Number(snapshot.sync?.pending) || 0) }); }

    async function updateTopic(ref, patch, options = {}) {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('patch must be an object');
        const item = findTopic(ref); if (!item) throw new Error('Tópico não encontrado no estado atual.');
        const protectedFields = new Set(['id','user_id']); Object.entries(patch).forEach(([key, value]) => { if (!protectedFields.has(key)) item[key] = value; });
        if (typeof queueEditalUpsert === 'function') queueEditalUpsert(item); if (typeof saveEditalToLocalStorage === 'function') saveEditalToLocalStorage(); if (typeof filterDataByConcurso === 'function') filterDataByConcurso();
        if (options.render !== false) { try { if (typeof renderTable === 'function') renderTable(); } catch (_) {} try { if (typeof renderMonthCalendar === 'function') renderMonthCalendar(); } catch (_) {} try { if (typeof updateModernOverview === 'function') updateModernOverview(); } catch (_) {} try { if (typeof renderRetentionDiagnostics === 'function') renderRetentionDiagnostics(); } catch (_) {} }
        global.SyncEngine?.markPending?.('topic-update'); notify('topic:update', { id:item.id, patch:clone(patch) }); return clone(item);
    }

    async function setCurrentContest(name) { const normalized = String(name || '').trim(); if (!normalized) throw new Error('Nome do concurso inválido.'); if (typeof changeConcurso !== 'function') throw new Error('Troca de concurso indisponível.'); const result = await changeConcurso(normalized); notify('contest:change', { name:normalized }); return result; }
    function subscribe(listener, options = {}) { if (typeof listener !== 'function') throw new TypeError('listener must be a function'); listeners.add(listener); if (options.immediate !== false) listener(makeSnapshot('subscribe'), null); return () => listeners.delete(listener); }
    function refresh(reason = 'refresh') { return notify(reason); }

    global.addEventListener('storage', event => { if (!event.key) return; if (/^(concursos_metadata_|edital_offline_data_|pending_sync_)/.test(event.key)) notify('storage:external', { key:event.key }); });
    global.addEventListener('syncengine:state', event => notify('sync:state', event.detail || null));

    global.AppState = Object.freeze({
        getSnapshot:makeSnapshot, getCurrentContest, getEdital, getTopic, select, getDiagnostics, updateTopic, setCurrentContest, subscribe, refresh,
        getOfflineShadowDiagnostics:() => global.OfflineSyncShadow?.getDiagnostics?.() || null,
        getOfflineSyncMetadataShadowDiagnostics:() => global.OfflineSyncMetadataShadow?.getDiagnostics?.() || null,
        getOfflineSyncMetadataAuthorityDiagnostics:() => global.OfflineSyncMetadataAuthority?.getDiagnostics?.() || null,
        getOfflineSyncMetadataGraduationDiagnostics:() => global.OfflineSyncMetadataGraduation?.getDiagnostics?.() || null,
        getOfflineSyncMetadataRolloutDiagnostics:() => global.OfflineSyncMetadataRollout?.getDiagnostics?.() || null,
        getOfflineSyncMetadataStabilityDiagnostics:() => global.OfflineSyncMetadataStability?.getDiagnostics?.() || null,
        getOfflineSyncMetadataExpandedStabilityDiagnostics:() => global.OfflineSyncMetadataExpandedStability?.getDiagnostics?.() || null,
        getOfflineSyncMetadataExpandedPromotionDiagnostics:() => global.OfflineSyncMetadataExpandedPromotion?.getDiagnostics?.() || null,
        getOfflineSyncMetadataPromotedStabilityDiagnostics:() => global.OfflineSyncMetadataPromotedStability?.getDiagnostics?.() || null,
        getOfflineSyncMetadataPopulationPromotionDiagnostics:() => global.OfflineSyncMetadataPopulationPromotion?.getDiagnostics?.() || null,
        getOfflineSyncMetadataExpansionDiagnostics:() => global.OfflineSyncMetadataExpansion?.getDiagnostics?.() || null,
        getOfflineSyncAuthorityDiagnostics:() => global.OfflineSyncAuthority?.getDiagnostics?.() || null,
        getOfflineSyncDeleteAuthorityDiagnostics:() => global.OfflineSyncDeleteAuthority?.getDiagnostics?.() || null,
        getOfflineSyncEditalGraduationDiagnostics:() => global.OfflineSyncEditalGraduation?.getDiagnostics?.() || null
    });

    global.dispatchEvent(new CustomEvent('appstate:ready', { detail:{ schemaVersion:SCHEMA_VERSION, revision } }));
})(window);

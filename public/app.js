const SUPABASE_URL = 'https://vqtcveixmwiaoweimdik.supabase.co'; 
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxdGN2ZWl4bXdpYW93ZWltZGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MzA4ODgsImV4cCI6MjEwMTUwNjg4OH0._8OOEdGbvDK1Vh_af2FJJn0-EVFjJjGZ_krQ6ue6V6c';

        const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage }
        });

        const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        const PALETA_CORES_MATERIAS = [
            'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
            'linear-gradient(135deg, #14532d 0%, #22c55e 100%)',
            'linear-gradient(135deg, #701a75 0%, #c084fc 100%)',
            'linear-gradient(135deg, #7c2d12 0%, #f97316 100%)',
            'linear-gradient(135deg, #831843 0%, #ec4899 100%)'
        ];
        const PALETA_SOLIDAS = ['#3b82f6', '#22c55e', '#c084fc', '#f97316', '#ec4899', '#8b5cf6', '#06b6d4', '#eab308'];

        const STRATEGIES_MAP = {
            nenhuma: [],
            retencao_adaptativa: [],
            revisao24730: [1, 7, 30],
            classica: [7, 30, 90],
            bimestral: [1, 15, 30, 60],
            curta: [7, 14, 21, 30],
            semestral: [1, 7, 28, 90, 180],
            intensiva: [3, 7, 14, 21, 30, 45, 60]
        };

        let currentUser = null;
        let isSuperUser = false;
        let myChart = null;
        let allEditalItems = [];
        let editalItems = [];
        let openMaterias = {}; 
        let currentConcurso = 'Concurso Geral';
        let metadataCache = {};
        let flashcardsList = [];
        let activeObjectUrl = null;
        let currentDelayedFilter = 'hoje';
        let activeSelectedDateKey = null;

        let studyQueue = [];
        let currentStudyIdx = 0;
        let showingAnswer = false;
        let currentEditingNoteIndex = null;
        let editingFcIndex = null;

        let openFcFolders = {};
        let activeFcMateriaFilter = '';
        let activeFcAssuntoFilter = '';

        let selectedMonth = new Date().getMonth();
        let selectedYear = new Date().getFullYear();

        let selectedWeekdays = [0, 1, 2, 3, 4, 5, 6];
        let selectedDailyHoursSlots = 2;
        let useCustomDailyHours = false;
        let customDailyHoursByWeekday = {0:2,1:2,2:2,3:2,4:2,5:2,6:2};
        let flexibleDayModes = {0:'full',1:'full',2:'full',3:'full',4:'full',5:'full',6:'full'};
        let opportunitySelectedMinutes = 20;
        let opportunitySelectedContext = 'any';
        let opportunityRecommendations = [];
        let pendingGuidedActiveRecall = null;
        let opportunityIgnoreDayMode = false;
        let syncPromise = null;
        let dashboardLoadPromise = null;
        let syncUiMode = 'idle';

        // =========================================================
        // V9.46 — BACKUP LOCAL AUTOMÁTICO / RECUPERAÇÃO
        // =========================================================
        const LOCAL_BACKUP_DB = 'painel-estudos-backups';
        const LOCAL_BACKUP_STORE = 'snapshots';
        let localBackupTimer = null;
        let backupRestoreInProgress = false;
        let localBackupWritePromise = null;

        function openLocalBackupDatabase() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(LOCAL_BACKUP_DB, 1);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains(LOCAL_BACKUP_STORE)) {
                        db.createObjectStore(LOCAL_BACKUP_STORE, { keyPath:'key' });
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error('Não foi possível abrir o armazenamento de backups.'));
            });
        }

        async function readLocalBackup(slot = 'current') {
            if (!currentUser) return null;
            const db = await openLocalBackupDatabase();
            return new Promise((resolve, reject) => {
                const key = `${currentUser.id}:${slot}`;
                const request = db.transaction(LOCAL_BACKUP_STORE, 'readonly').objectStore(LOCAL_BACKUP_STORE).get(key);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error || new Error('Não foi possível ler o backup.'));
            });
        }

        async function writeLocalBackup(record) {
            const db = await openLocalBackupDatabase();
            return new Promise((resolve, reject) => {
                const request = db.transaction(LOCAL_BACKUP_STORE, 'readwrite').objectStore(LOCAL_BACKUP_STORE).put(record);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error || new Error('Não foi possível gravar o backup.'));
            });
        }

        function collectLegacyPomodoroState(uid) {
            const result = {};
            const prefixes = [`pomodoro_daily_minutes_${uid}_`, `pomodoro_extra_minutes_${uid}_`];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && prefixes.some(prefix => key.startsWith(prefix))) result[key] = localStorage.getItem(key);
            }
            return result;
        }

        function getBackupCoreState() {
            if (!currentUser) return null;
            const uid = currentUser.id;
            let metadata = {};
            let edital = [];
            try { metadata = JSON.parse(localStorage.getItem(`concursos_metadata_${uid}`) || '{}'); } catch (_) {}
            try { edital = JSON.parse(localStorage.getItem(`edital_offline_data_${uid}`) || '[]'); } catch (_) {}
            return {
                concursosMetadata: metadata,
                editalItems: Array.isArray(edital) ? edital : [],
                lastStudiedConcurso: getLastStudiedConcurso() || currentConcurso || 'Concurso Geral',
                pomodoroLegacy: collectLegacyPomodoroState(uid)
            };
        }

        function backupFingerprint(core) {
            const raw = JSON.stringify(core || {});
            let hash = 2166136261;
            for (let i = 0; i < raw.length; i++) {
                hash ^= raw.charCodeAt(i);
                hash = Math.imul(hash, 16777619);
            }
            return `${raw.length}:${(hash >>> 0).toString(16)}`;
        }

        async function createLocalBackupSnapshot(reason = 'alteração automática', options = {}) {
            if (!currentUser || backupRestoreInProgress) return null;
            if (localBackupWritePromise && !options.force) return localBackupWritePromise;
            const run = async () => {
                const core = getBackupCoreState();
                if (!core) return null;
                const fingerprint = backupFingerprint(core);
                const current = await readLocalBackup('current');
                if (!options.force && current?.fingerprint === fingerprint) return current;
                if (current) {
                    await writeLocalBackup({ ...current, key:`${currentUser.id}:previous`, slot:'previous' });
                }
                const snapshot = {
                    key:`${currentUser.id}:current`,
                    slot:'current',
                    schemaVersion:1,
                    appVersion:'9.66.6',
                    userId:currentUser.id,
                    createdAt:new Date().toISOString(),
                    reason:String(reason || 'alteração automática'),
                    fingerprint,
                    core
                };
                await writeLocalBackup(snapshot);
                return snapshot;
            };
            localBackupWritePromise = run().finally(() => { localBackupWritePromise = null; });
            return localBackupWritePromise;
        }

        function scheduleLocalBackup(reason = 'alteração automática', delay = 1400) {
            if (!currentUser || backupRestoreInProgress) return;
            clearTimeout(localBackupTimer);
            localBackupTimer = setTimeout(() => {
                createLocalBackupSnapshot(reason).catch(error => console.warn('Backup local adiado:', error));
            }, delay);
        }

        function countBackupStats(snapshot) {
            const core = snapshot?.core || {};
            const metadata = core.concursosMetadata || {};
            const realContests = Object.keys(metadata).filter(name => name && name !== 'Concurso Geral');
            const edital = Array.isArray(core.editalItems) ? core.editalItems : [];
            let flashcards = 0;
            let sessions = 0;
            Object.values(metadata).forEach(contest => {
                flashcards += Array.isArray(contest?.flashcards) ? contest.flashcards.length : 0;
                sessions += Array.isArray(contest?.studySessions) ? contest.studySessions.length : 0;
            });
            return { concursos:realContests.length, topicos:edital.length, flashcards, sessions };
        }

        function renderBackupSlot(elementId, buttonId, snapshot) {
            const box = document.getElementById(elementId);
            const btn = document.getElementById(buttonId);
            if (!box || !btn) return;
            if (!snapshot) {
                box.className = 'backup-slot-empty';
                box.textContent = 'Nenhum backup disponível ainda.';
                btn.disabled = true;
                return;
            }
            const stats = countBackupStats(snapshot);
            const date = new Date(snapshot.createdAt);
            box.className = '';
            box.innerHTML = `<div class="backup-slot-time">${escapeHtml(date.toLocaleString('pt-BR'))}</div><div class="backup-slot-stats">${stats.concursos} concurso(s) · ${stats.topicos} tópico(s)<br>${stats.flashcards} flashcard(s) · ${stats.sessions} sessão(ões)<br><span style="opacity:.7">${escapeHtml(snapshot.reason || 'backup automático')}</span></div>`;
            btn.disabled = false;
        }

        async function refreshBackupManager() {
            try {
                const [current, previous] = await Promise.all([readLocalBackup('current'), readLocalBackup('previous')]);
                renderBackupSlot('backupCurrentInfo', 'restoreCurrentBackupBtn', current);
                renderBackupSlot('backupPreviousInfo', 'restorePreviousBackupBtn', previous);
            } catch (error) {
                console.warn('Não foi possível exibir os backups:', error);
                renderBackupSlot('backupCurrentInfo', 'restoreCurrentBackupBtn', null);
                renderBackupSlot('backupPreviousInfo', 'restorePreviousBackupBtn', null);
            }
        }

        function openBackupManager() {
            const modal = document.getElementById('modalBackupManager');
            if (!modal) return;
            modal.style.display = 'flex';
            refreshBackupManager();
        }

        function closeBackupManager() {
            const modal = document.getElementById('modalBackupManager');
            if (modal) modal.style.display = 'none';
        }

        async function createBackupNow() {
            try {
                await createLocalBackupSnapshot('backup manual');
                await refreshBackupManager();
                await appNotice('Backup local criado com sucesso.', { title:'Backup concluído' });
            } catch (error) {
                await appNotice(`Não foi possível criar o backup: ${error.message}`, { title:'Falha no backup' });
            }
        }

        function collectFlashcardIds(metadata) {
            const ids = new Set();
            Object.values(metadata || {}).forEach(contest => {
                (contest?.flashcards || []).forEach(fc => { if (fc?.id) ids.add(String(fc.id)); });
            });
            return ids;
        }

        async function restoreLocalBackup(slot) {
            if (!currentUser) return;
            const snapshot = await readLocalBackup(slot);
            if (!snapshot?.core) return appNotice('Este backup não está disponível.', { title:'Backup indisponível' });
            const ok = await appConfirm(
                `Restaurar o Backup ${slot === 'previous' ? 'Anterior' : 'Atual'}?

O estado local atual será substituído. Antes da restauração, o Painel preservará automaticamente uma cópia de segurança do estado presente. Depois, as alterações restauradas entrarão na fila normal de sincronização com o Supabase.`,
                { title:'Restaurar backup', confirmText:'Restaurar', danger:true }
            );
            if (!ok) return;

            const uid = currentUser.id;
            const oldMetadata = getConcursosMetadata();
            const oldEdital = (() => { try { return JSON.parse(localStorage.getItem(getEditalLocalStorageKey()) || '[]'); } catch (_) { return []; } })();
            const selectedSnapshot = JSON.parse(JSON.stringify(snapshot));

            try {
                await createLocalBackupSnapshot('estado antes da restauração', { force:true });
                backupRestoreInProgress = true;
                clearTimeout(localBackupTimer);

                const core = selectedSnapshot.core;
                const restoredMetadata = core.concursosMetadata || {};
                const restoredEdital = Array.isArray(core.editalItems) ? core.editalItems : [];
                localStorage.setItem(`concursos_metadata_${uid}`, JSON.stringify(restoredMetadata));
                localStorage.setItem(`edital_offline_data_${uid}`, JSON.stringify(restoredEdital));
                setLastStudiedConcurso(core.lastStudiedConcurso || 'Concurso Geral');

                const pomodoroPrefixes = [`pomodoro_daily_minutes_${uid}_`, `pomodoro_extra_minutes_${uid}_`];
                const removeKeys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && pomodoroPrefixes.some(prefix => key.startsWith(prefix))) removeKeys.push(key);
                }
                removeKeys.forEach(key => localStorage.removeItem(key));
                Object.entries(core.pomodoroLegacy || {}).forEach(([key, value]) => localStorage.setItem(key, String(value)));

                const restoredIds = new Set(restoredEdital.map(item => String(item.id)));
                const oldIds = new Set((Array.isArray(oldEdital) ? oldEdital : []).map(item => String(item.id)));
                const oldFlashIds = collectFlashcardIds(oldMetadata);
                const restoredFlashIds = collectFlashcardIds(restoredMetadata);
                const oldContests = new Set(Object.keys(oldMetadata || {}).filter(name => name !== 'Concurso Geral'));
                const restoredContests = new Set(Object.keys(restoredMetadata || {}).filter(name => name !== 'Concurso Geral'));

                const restoredSync = {
                    metadataDirty:true,
                    flashcardsDirty:{},
                    editalUpserts:{},
                    editalDeletes:[...oldIds].filter(id => !restoredIds.has(id)),
                    flashcardDeletes:[...oldFlashIds].filter(id => !restoredFlashIds.has(id)),
                    concursoDeletes:[...oldContests].filter(name => !restoredContests.has(name))
                };
                restoredEdital.forEach(item => { if (item?.id != null) restoredSync.editalUpserts[String(item.id)] = { ...item, id:String(item.id) }; });
                Object.entries(restoredMetadata).forEach(([name, contest]) => {
                    if (Array.isArray(contest?.flashcards) && contest.flashcards.length) restoredSync.flashcardsDirty[name] = true;
                });
                localStorage.setItem(`pending_sync_${uid}`, JSON.stringify(restoredSync));
                localStorage.removeItem(`last_successful_sync_${uid}`);

                await appNotice('Backup restaurado. O Painel será recarregado e o estado recuperado entrará na fila de sincronização.', { title:'Restauração concluída' });
                location.reload();
            } catch (error) {
                backupRestoreInProgress = false;
                await appNotice(`Não foi possível restaurar o backup: ${error.message}`, { title:'Falha na restauração' });
            }
        }

        function getLastSyncStorageKey() {
            const uid = currentUser ? currentUser.id : 'guest';
            return `last_successful_sync_${uid}`;
        }

        function setLastSuccessfulSyncNow() {
            if (!currentUser) return;
            localStorage.setItem(getLastSyncStorageKey(), new Date().toISOString());
        }

        function formatLastSyncLabel(iso) {
            if (!iso) return '';
            const date = new Date(iso);
            if (Number.isNaN(date.getTime())) return '';
            const now = new Date();
            const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
            const time = date.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
            if (sameDay) return `· ${time}`;
            return `· ${date.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })} ${time}`;
        }

        function getPendingSyncCount() {
            const state = getSyncState();
            return (state.metadataDirty ? 1 : 0)
                + Object.keys(state.flashcardsDirty || {}).length
                + Object.keys(state.editalUpserts || {}).length
                + (state.editalDeletes || []).length
                + (state.flashcardDeletes || []).length
                + (state.concursoDeletes || []).length;
        }

        function updateSyncIndicator() {
            const pill = document.getElementById('syncStatusPill');
            const text = document.getElementById('syncStatusText');
            const last = document.getElementById('syncStatusLast');
            if (!pill || !text || !last) return;

            pill.className = 'sync-status-pill';
            pill.onclick = null;
            const pending = currentUser ? getPendingSyncCount() : 0;
            const lastIso = currentUser ? localStorage.getItem(getLastSyncStorageKey()) : '';
            last.textContent = '';

            if (!navigator.onLine) {
                pill.classList.add('offline');
                text.textContent = pending ? `Offline · ${pending} pendência${pending === 1 ? '' : 's'}` : 'Offline';
                pill.title = pending ? `${pending} alteração(ões) aguardando sincronização.` : 'Sem conexão. Os dados locais continuam disponíveis.';
                return;
            }
            if (syncUiMode === 'syncing' || syncPromise) {
                pill.classList.add('syncing');
                text.textContent = 'Sincronizando…';
                pill.title = 'Enviando e conferindo dados com o Supabase.';
                return;
            }
            if (pending > 0) {
                pill.classList.add('pending');
                text.textContent = `${pending} pendência${pending === 1 ? '' : 's'}`;
                last.textContent = formatLastSyncLabel(lastIso);
                pill.title = 'Clique para tentar sincronizar agora.';
                pill.onclick = () => forceFullSync({ target: null });
                return;
            }
            pill.classList.add('synced');
            text.textContent = 'Sincronizado';
            last.textContent = formatLastSyncLabel(lastIso);
            pill.title = lastIso ? `Última sincronização concluída: ${new Date(lastIso).toLocaleString('pt-BR')}` : 'Dados sem pendências locais.';
        }

        function escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        const IMPORT_LIMITS = Object.freeze({
            jsonBytes: 8 * 1024 * 1024,
            maxDepth: 14,
            maxNodes: 60000,
            maxObjectKeys: 250,
            maxFlashcards: 10000,
            maxTopics: 12000,
            materiaChars: 180,
            assuntoChars: 1200,
            perguntaChars: 4000,
            respostaChars: 8000,
            concursoChars: 200
        });

        function normalizeImportedText(value, maxLength = 1200) {
            return String(value ?? '')
                .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
                .trim()
                .slice(0, Math.max(1, maxLength));
        }

        function assertImportFileSafe(file) {
            if (!file) throw new Error('Arquivo ausente.');
            if (Number(file.size || 0) > IMPORT_LIMITS.jsonBytes) {
                throw new Error('Arquivo JSON excede o limite de 8 MB.');
            }
        }

        function assertSafeJsonPayload(payload) {
            const stack = [{ value: payload, depth: 0 }];
            let nodes = 0;
            while (stack.length) {
                const { value, depth } = stack.pop();
                nodes++;
                if (nodes > IMPORT_LIMITS.maxNodes) throw new Error('JSON complexo demais para importação segura.');
                if (depth > IMPORT_LIMITS.maxDepth) throw new Error('JSON possui aninhamento excessivo.');
                if (!value || typeof value !== 'object') continue;
                if (Array.isArray(value)) {
                    for (let i = 0; i < value.length; i++) stack.push({ value: value[i], depth: depth + 1 });
                    continue;
                }
                const keys = Object.keys(value);
                if (keys.length > IMPORT_LIMITS.maxObjectKeys) throw new Error('Objeto JSON possui campos demais.');
                for (const key of keys) {
                    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
                        throw new Error('JSON contém campo não permitido.');
                    }
                    stack.push({ value: value[key], depth: depth + 1 });
                }
            }
            return payload;
        }

        function encodeHandlerValue(value) {
            return encodeURIComponent(String(value ?? ''));
        }

        function getSyncStateStorageKey() {
            const uid = currentUser ? currentUser.id : 'guest';
            return `pending_sync_${uid}`;
        }

        function getSyncState() {
            const emptyState = {
                metadataDirty: false,
                metadataRevision: 0,
                flashcardsDirty: {},
                editalUpserts: {},
                editalDeletes: [],
                flashcardDeletes: [],
                concursoDeletes: []
            };
            try {
                const saved = JSON.parse(localStorage.getItem(getSyncStateStorageKey()) || '{}');
                return {
                    ...emptyState,
                    ...saved,
                    flashcardsDirty: (saved.flashcardsDirty && typeof saved.flashcardsDirty === 'object')
                        ? saved.flashcardsDirty
                        : (saved.flashcardsDirty ? { [currentConcurso]: true } : {}),
                    editalUpserts: saved.editalUpserts || {},
                    editalDeletes: Array.isArray(saved.editalDeletes) ? saved.editalDeletes : [],
                    flashcardDeletes: Array.isArray(saved.flashcardDeletes) ? saved.flashcardDeletes : [],
                    concursoDeletes: Array.isArray(saved.concursoDeletes) ? saved.concursoDeletes : []
                };
            } catch (error) {
                return emptyState;
            }
        }

        function saveSyncState(state) {
            localStorage.setItem(getSyncStateStorageKey(), JSON.stringify(state));
            updateSyncIndicator();
        }

        function setMetadataDirty(isDirty) {
            const state = getSyncState();
            state.metadataDirty = !!isDirty;
            if (isDirty) state.metadataRevision = Math.max(0, Number(state.metadataRevision) || 0) + 1;
            saveSyncState(state);
        }

        function setFlashcardsDirty(isDirty, concursoName = currentConcurso) {
            const state = getSyncState();
            if (isDirty) state.flashcardsDirty[concursoName] = true;
            else delete state.flashcardsDirty[concursoName];
            saveSyncState(state);
        }

        function queueEditalUpsert(item) {
            const state = getSyncState();
            const id = String(item.id);
            state.editalUpserts[id] = { ...item, id };
            state.editalDeletes = state.editalDeletes.filter(savedId => String(savedId) !== id);
            saveSyncState(state);
        }

        function queueEditalDelete(id) {
            const state = getSyncState();
            const normalizedId = String(id);
            delete state.editalUpserts[normalizedId];
            if (!state.editalDeletes.includes(normalizedId)) state.editalDeletes.push(normalizedId);
            saveSyncState(state);
        }

        function queueFlashcardDelete(id) {
            const state = getSyncState();
            const normalizedId = String(id);
            if (!state.flashcardDeletes.includes(normalizedId)) state.flashcardDeletes.push(normalizedId);
            saveSyncState(state);
        }

        function queueConcursoDelete(concursoName) {
            const nome = String(concursoName || '').trim();
            if (!nome) return;

            const state = getSyncState();
            if (!state.concursoDeletes.includes(nome)) state.concursoDeletes.push(nome);

            // Não enviar novamente tópicos/flashcards pertencentes a um concurso já excluído.
            Object.keys(state.editalUpserts).forEach(id => {
                if ((state.editalUpserts[id]?.concurso || 'Concurso Geral') === nome) {
                    delete state.editalUpserts[id];
                }
            });
            delete state.flashcardsDirty[nome];
            saveSyncState(state);
        }

        function hasPendingSync() {
            const state = getSyncState();
            return state.metadataDirty || Object.keys(state.flashcardsDirty).length > 0 ||
                Object.keys(state.editalUpserts).length > 0 ||
                state.editalDeletes.length > 0 || state.flashcardDeletes.length > 0 ||
                state.concursoDeletes.length > 0;
        }

        function throwIfSupabaseError(result, contextMessage) {
            if (result && result.error) {
                throw new Error(`${contextMessage}: ${result.error.message || 'erro desconhecido'}`);
            }
            return result;
        }

        function chunkArray(items, batchSize = 50) {
            const chunks = [];
            for (let index = 0; index < items.length; index += batchSize) {
                chunks.push(items.slice(index, index + batchSize));
            }
            return chunks;
        }

        function isLikelyNetworkError(error) {
            const message = String(error?.message || error || '').toLowerCase();
            return message.includes('networkerror') ||
                message.includes('failed to fetch') ||
                message.includes('fetch resource') ||
                message.includes('network request failed') ||
                message.includes('load failed');
        }

        function waitForRetry(milliseconds) {
            return new Promise(resolve => setTimeout(resolve, milliseconds));
        }

        async function runSupabaseRequest(requestFactory, maxAttempts = 3) {
            let lastError = null;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    const result = await requestFactory();
                    if (result?.error && isLikelyNetworkError(result.error)) throw result.error;
                    return result;
                } catch (error) {
                    lastError = error;
                    if (!isLikelyNetworkError(error) || attempt === maxAttempts) throw error;
                    await waitForRetry(400 * attempt);
                }
            }
            throw lastError || new Error('Falha de rede durante a sincronização.');
        }

        function handleActionButton(btnElem, actionFn, eventArg) {
            // A barra de ações não mantém seleção persistente. O destaque acompanha apenas hover/press.
            document.querySelectorAll('.action-bar .btn-action').forEach(b => b.classList.remove('active-blue', 'action-running'));
            if (btnElem && typeof btnElem.blur === 'function') btnElem.blur();
            if (typeof actionFn === 'function') {
                const actionEvent = eventArg || { target: btnElem };
                try {
                    const result = actionFn(actionEvent);
                    if (result && typeof result.then === 'function') {
                        if (btnElem) btnElem.classList.add('action-running');
                        result.catch(error => console.error('Falha na ação:', error)).finally(() => btnElem?.classList.remove('action-running'));
                    }
                } catch (error) {
                    console.error('Falha na ação:', error);
                    btnElem?.classList.remove('action-running');
                }
            }
        }

        // V9.13 — atalhos globais consistentes em todo o app.
        // ESC fecha somente a camada/modal visível mais alta; ENTER executa a ação padrão
        // do contexto atual sem interferir em textarea, select, contenteditable ou botões nativos.
        let appDialogResolver = null;

        function resolveAppDialog(result) {
            const modal = document.getElementById('modalAppDialog');
            if (modal) modal.style.display = 'none';
            const resolver = appDialogResolver;
            appDialogResolver = null;
            if (resolver) resolver(!!result);
        }

        function appConfirm(message, options = {}) {
            const modal = document.getElementById('modalAppDialog');
            if (!modal) return Promise.resolve(false);
            // Se um diálogo anterior ainda estiver pendente, encerra-o como cancelado.
            if (appDialogResolver) {
                const previous = appDialogResolver;
                appDialogResolver = null;
                try { previous(false); } catch (_) {}
            }
            const title = document.getElementById('appDialogTitle');
            const text = document.getElementById('appDialogMessage');
            const cancelBtn = document.getElementById('appDialogCancelBtn');
            const confirmBtn = document.getElementById('appDialogConfirmBtn');
            if (title) title.textContent = options.title || 'Confirmar ação';
            if (text) text.textContent = String(message || '');
            if (cancelBtn) {
                cancelBtn.style.display = '';
                cancelBtn.textContent = options.cancelText || 'Cancelar';
            }
            if (confirmBtn) {
                confirmBtn.textContent = options.confirmText || 'Confirmar';
                confirmBtn.className = `btn ${options.danger ? 'btn-danger' : (options.confirmClass || 'btn-primary')}`;
            }
            modal.style.display = 'flex';
            requestAnimationFrame(() => confirmBtn?.focus());
            return new Promise(resolve => { appDialogResolver = resolve; });
        }

        function appNotice(message, options = {}) {
            const modal = document.getElementById('modalAppDialog');
            if (!modal) return Promise.resolve(true);
            if (appDialogResolver) {
                const previous = appDialogResolver;
                appDialogResolver = null;
                try { previous(false); } catch (_) {}
            }
            const title = document.getElementById('appDialogTitle');
            const text = document.getElementById('appDialogMessage');
            const cancelBtn = document.getElementById('appDialogCancelBtn');
            const confirmBtn = document.getElementById('appDialogConfirmBtn');
            if (title) title.textContent = options.title || 'Estudo Adaptativo Inteligente';
            if (text) text.textContent = String(message || '');
            if (cancelBtn) cancelBtn.style.display = 'none';
            if (confirmBtn) {
                confirmBtn.textContent = options.confirmText || 'OK';
                confirmBtn.className = `btn ${options.confirmClass || 'btn-primary'}`;
            }
            modal.style.display = 'flex';
            requestAnimationFrame(() => confirmBtn?.focus());
            return new Promise(resolve => { appDialogResolver = () => resolve(true); });
        }

        let appPromptResolver = null;

        function resolveAppPrompt(confirmed) {
            const modal = document.getElementById('modalAppPrompt');
            const input = document.getElementById('appPromptInput');
            if (modal) modal.style.display = 'none';
            const resolver = appPromptResolver;
            appPromptResolver = null;
            if (resolver) resolver(confirmed ? (input ? input.value : '') : null);
        }

        function appPrompt(options = {}) {
            const modal = document.getElementById('modalAppPrompt');
            const title = document.getElementById('appPromptTitle');
            const label = document.getElementById('appPromptLabel');
            const input = document.getElementById('appPromptInput');
            const help = document.getElementById('appPromptHelp');
            const confirmBtn = document.getElementById('appPromptConfirmBtn');
            if (!modal || !input) return Promise.resolve(null);
            if (appPromptResolver) {
                const previous = appPromptResolver;
                appPromptResolver = null;
                try { previous(null); } catch (_) {}
            }
            if (title) title.textContent = options.title || 'Editar';
            if (label) label.textContent = options.label || 'Valor';
            input.type = options.type || 'text';
            input.value = options.value == null ? '' : String(options.value);
            input.placeholder = options.placeholder || '';
            if (options.maxLength) input.maxLength = options.maxLength; else input.removeAttribute('maxlength');
            if (help) {
                help.textContent = options.help || '';
                help.style.display = options.help ? '' : 'none';
            }
            if (confirmBtn) confirmBtn.textContent = options.confirmText || 'Salvar';
            modal.style.display = 'flex';
            requestAnimationFrame(() => { input.focus(); if (input.type === 'text') input.select(); });
            return new Promise(resolve => { appPromptResolver = resolve; });
        }

        function getTopVisibleModalOverlay() {
            const visible = [...document.querySelectorAll('.modal-overlay')].filter(el => {
                const cs = getComputedStyle(el);
                return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) !== 0;
            });
            if (!visible.length) return null;
            return visible.sort((a,b) => {
                const za = parseInt(getComputedStyle(a).zIndex, 10) || 0;
                const zb = parseInt(getComputedStyle(b).zIndex, 10) || 0;
                if (za !== zb) return za - zb;
                return [...document.body.querySelectorAll('.modal-overlay')].indexOf(a) - [...document.body.querySelectorAll('.modal-overlay')].indexOf(b);
            }).pop();
        }

        function closeModalByKeyboard(modal) {
            if (!modal) return false;
            const closers = {
                modalAppDialog: () => resolveAppDialog(false),
                modalAppPrompt: () => resolveAppPrompt(false),
                modalSelectCronogramaType: () => closeModalSelectCronogramaType(),
                modalFlexibleStudyConfig: () => closeFlexibleStudyConfig(),
                modalOpportunityStudy: () => closeOpportunityStudyModal(),
                modalActiveRecallGuide: () => closeActiveRecallGuide(),
                modalMentorisMethod: () => closeModalMentorisMethod(),
                modalConfigHorarios: () => closeModalConfigHorarios(),
                modalNovaNota: () => closeModalNovaNota(),
                modalStudyFlashcards: () => closeStudyModal(),
                modalViewEdital: () => closeModalViewEdital(),
                modalPromptIA: () => closeModalPromptIA(),
                modalNovoConcurso: () => closeModalNovoConcurso(),
                modalDayContent: () => closeModalDayContent(),
                modalBackupManager: () => closeBackupManager(),
                modalAccount: () => closeAccountModal(),
                modalAdaptiveReviewFeedback: () => {},
                modalQuestionPerformance: () => closeQuestionPerformanceModal(),
                modalLegalReading: () => closeLegalReadingModal(),
                modalEditarFlashcard: () => closeModalEditarFlashcard(),
                modalFiltroEstudoFC: () => closeModalFiltroEstudoFlashcards(),
                modalAnaliseEditalIA: () => closeModalAnaliseEditalIA()
            };
            const fn = closers[modal.id];
            if (fn) { fn(); return true; }
            // Fallback seguro para futuros modais: prefere botão explícito de cancelar/fechar.
            const closeBtn = [...modal.querySelectorAll('button')].find(btn => /fechar|cancelar|voltar/i.test(btn.textContent || ''));
            if (closeBtn) { closeBtn.click(); return true; }
            modal.style.display = 'none';
            return true;
        }

        function runModalDefaultAction(modal) {
            if (!modal) return false;
            const explicit = modal.querySelector('[data-enter-default="true"]');
            if (explicit && !explicit.disabled) { explicit.click(); return true; }
            const actions = [...modal.querySelectorAll('.modal-actions button:not(:disabled)')]
                .filter(btn => !btn.classList.contains('btn-secondary') && !/fechar|cancelar|voltar/i.test(btn.textContent || ''));
            const target = actions[actions.length - 1];
            if (target) { target.click(); return true; }
            return false;
        }

        document.addEventListener('keydown', function(e) {
            if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
            const active = document.activeElement;
            const tag = active?.tagName?.toUpperCase();

            if (e.key === 'Escape') {
                const modal = getTopVisibleModalOverlay();
                if (modal) {
                    e.preventDefault();
                    e.stopPropagation();
                    closeModalByKeyboard(modal);
                    return;
                }
                // Fora de modal, ESC apenas remove foco de campos/controles sem apagar dados.
                if (active && typeof active.blur === 'function' && !['BODY','HTML'].includes(tag)) active.blur();
                return;
            }

            if (e.key !== 'Enter' || e.shiftKey) return;
            // Mantém comportamento nativo onde ENTER tem semântica própria.
            if (tag === 'TEXTAREA' || active?.isContentEditable) return;
            if (tag === 'BUTTON' || tag === 'A') return;

            const modal = getTopVisibleModalOverlay();
            if (modal) {
                if (runModalDefaultAction(modal)) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                return;
            }

            const auth = document.getElementById('auth-screen');
            if (auth && getComputedStyle(auth).display !== 'none') {
                e.preventDefault();
                handleLogin();
            }
        });

        function updateOnlineStatus() {
            const banner = document.getElementById('offline-banner');
            if (!navigator.onLine) {
                banner.textContent = hasPendingSync()
                    ? 'Modo Offline — suas alterações estão protegidas e aguardam sincronização.'
                    : 'Modo Offline — os dados continuam disponíveis neste dispositivo.';
                banner.style.display = 'block';
                syncUiMode = 'idle';
                updateSyncIndicator();
            } else {
                banner.style.display = 'none';
                updateSyncIndicator();
                if (currentUser) syncAllWithSupabase().catch(error => console.warn('Sincronização adiada:', error));
            }
        }
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);

        // V9.50 — isolamento local estrito entre contas no mesmo navegador.
        // A seleção do último concurso deixa de ser uma chave global compartilhada
        // e passa a pertencer exclusivamente ao usuário autenticado.
        let activeUserContextId = null;
        let userContextGeneration = 0;

        function getLastStudiedConcursoStorageKey(userId = currentUser?.id) {
            return userId ? `last_studied_concurso_${userId}` : null;
        }

        function getLastStudiedConcurso() {
            const key = getLastStudiedConcursoStorageKey();
            if (!key) return 'Concurso Geral';
            return localStorage.getItem(key) || 'Concurso Geral';
        }

        function setLastStudiedConcurso(nome) {
            const key = getLastStudiedConcursoStorageKey();
            if (!key) return;
            localStorage.setItem(key, String(nome || 'Concurso Geral'));
        }

        function resetInMemoryUserState() {
            allEditalItems = [];
            editalItems = [];
            metadataCache = {};
            flashcardsList = [];
            openMaterias = {};
            openFcFolders = {};
            activeFcMateriaFilter = '';
            activeFcAssuntoFilter = '';
            currentEditingNoteIndex = null;
            editingFcIndex = null;
            studyQueue = [];
            currentStudyIdx = 0;
            showingAnswer = false;
            activeSelectedDateKey = null;
            pendingAdaptiveReviewFeedback = null;
            pendingQuestionPerformance = null;
            clearActiveStudyContext();
        }

        function prepareAuthenticatedUserContext(user) {
            const nextId = user?.id || null;
            if (!nextId) return;
            if (activeUserContextId !== nextId) {
                userContextGeneration += 1;
                dashboardLoadPromise = null;
                syncPromise = null;
                syncUiMode = 'idle';
                resetInMemoryUserState();
                activeUserContextId = nextId;
            }
            currentConcurso = getLastStudiedConcurso();
        }

        function isAuthenticatedUserContextCurrent(userId, generation = userContextGeneration) {
            return !!currentUser && currentUser.id === userId && activeUserContextId === userId && userContextGeneration === generation;
        }

        function ensureCurrentConcursoForUser() {
            const metadata = getConcursosMetadata();
            const real = new Set();
            Object.keys(metadata || {}).forEach(nome => { if (!isSystemConcurso(nome)) real.add(nome); });
            allEditalItems.forEach(item => {
                const nome = item?.concurso || 'Concurso Geral';
                if (!isSystemConcurso(nome)) real.add(nome);
            });
            const list = [...real].sort((a,b) => a.localeCompare(b, 'pt-BR', { sensitivity:'base' }));
            if (!list.includes(currentConcurso)) {
                currentConcurso = list[0] || 'Concurso Geral';
                setLastStudiedConcurso(currentConcurso);
            }
        }

        function getConcursosMetadataStorageKey() {
            const uid = currentUser ? currentUser.id : 'guest';
            return `concursos_metadata_${uid}`;
        }

        function getConcursosMetadata() {
            try { return JSON.parse(localStorage.getItem(getConcursosMetadataStorageKey()) || '{}'); }
            catch(e) { return {}; }
        }

        let metadataSyncTimer = null;
        let editalSyncTimer = null;
        let flashcardSyncTimer = null;

        function scheduleMetadataSync(delay = 750) {
            if (metadataSyncTimer) clearTimeout(metadataSyncTimer);
            metadataSyncTimer = setTimeout(async () => {
                metadataSyncTimer = null;
                if (!navigator.onLine || !currentUser) return;
                try { await flushPendingMetadata(); }
                catch (error) { console.warn('Metadados mantidos na fila de sincronização:', error); }
            }, delay);
        }

        function scheduleEditalSync(delay = 600) {
            if (editalSyncTimer) clearTimeout(editalSyncTimer);
            editalSyncTimer = setTimeout(async () => {
                editalSyncTimer = null;
                if (!navigator.onLine || !currentUser) return;
                try { await flushPendingEdital(); }
                catch (error) { console.warn('Edital mantido na fila de sincronização:', error); }
            }, delay);
        }

        function scheduleFlashcardSync(delay = 700) {
            if (flashcardSyncTimer) clearTimeout(flashcardSyncTimer);
            flashcardSyncTimer = setTimeout(async () => {
                flashcardSyncTimer = null;
                if (!navigator.onLine || !currentUser) return;
                try { await flushAllPendingFlashcards(); }
                catch (error) { console.warn('Flashcards mantidos na fila de sincronização:', error); }
            }, delay);
        }

        function cancelScheduledDeltaSyncs() {
            if (metadataSyncTimer) clearTimeout(metadataSyncTimer);
            if (editalSyncTimer) clearTimeout(editalSyncTimer);
            if (flashcardSyncTimer) clearTimeout(flashcardSyncTimer);
            metadataSyncTimer = editalSyncTimer = flashcardSyncTimer = null;
        }

        async function saveConcursosMetadata(data) {
            // Local-first: a interface nunca espera a rede para concluir uma alteração.
            metadataCache = data;
            const key = getConcursosMetadataStorageKey();
            localStorage.setItem(key, JSON.stringify(data));
            setMetadataDirty(true);
            scheduleLocalBackup('alteração em concursos / planejamento');
            if (navigator.onLine && currentUser) scheduleMetadataSync();
        }

        async function loadConcursosMetadata() {
            loadLocalMetadata();
            if (navigator.onLine && currentUser) {
                try {
                    if (getSyncState().metadataDirty) await flushPendingMetadata();
                    if (getSyncState().metadataDirty) return;
                    const { data, error } = await runSupabaseRequest(() => supabaseClient
                        .from('user_settings')
                        .select('setting_value')
                        .eq('user_id', currentUser.id)
                        .eq('setting_key', 'concursos_metadata')
                        .maybeSingle());

                    if (!error && data && data.setting_value) {
                        metadataCache = data.setting_value;
                        localStorage.setItem(getConcursosMetadataStorageKey(), JSON.stringify(metadataCache));
                    }
                } catch(e) { console.log('Configurações locais preservadas:', e); }
            }
        }

        async function flushPendingMetadata() {
            const state = getSyncState();
            if (!state.metadataDirty || !navigator.onLine || !currentUser) return;
            // Captura uma revisão e um snapshot consistentes. Se outra alteração local acontecer
            // enquanto o upload estiver em andamento, a revisão muda e NÃO limpamos o dirty flag.
            const syncRevision = Math.max(0, Number(state.metadataRevision) || 0);
            const metadataSnapshot = getConcursosMetadata();
            const result = await runSupabaseRequest(() => supabaseClient.from('user_settings').upsert({
                user_id: currentUser.id,
                setting_key: 'concursos_metadata',
                setting_value: metadataSnapshot,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,setting_key' }));
            throwIfSupabaseError(result, 'Falha ao sincronizar configurações pendentes');
            const latestState = getSyncState();
            const latestRevision = Math.max(0, Number(latestState.metadataRevision) || 0);
            if (latestRevision === syncRevision) {
                latestState.metadataDirty = false;
                saveSyncState(latestState);
            } else {
                latestState.metadataDirty = true;
                saveSyncState(latestState);
                scheduleMetadataSync(250);
            }
        }

        function loadLocalMetadata() { metadataCache = getConcursosMetadata(); }

        function openModalSelectCronogramaType() { document.getElementById('modalSelectCronogramaType').style.display = 'flex'; }
        function closeModalSelectCronogramaType() { document.getElementById('modalSelectCronogramaType').style.display = 'none'; }
        function chooseCronogramaType(typeNum) {
            closeModalSelectCronogramaType();
            if (typeNum === 1) openModalConfigHorarios();
            else if (typeNum === 2) openModalMentorisMethod();
            else openFlexibleStudyConfig();
        }

        function getDefaultFlexibleDayModes() {
            return {0:'full',1:'full',2:'full',3:'full',4:'full',5:'full',6:'full'};
        }

        function openFlexibleStudyConfig() {
            const contest = getConcursosMetadata()[currentConcurso] || {};
            const cfg = contest.scheduleConfig || {};
            const start = document.getElementById('flexDataInicio');
            if (start) start.value = cfg.method === 3 && cfg.startDate ? cfg.startDate : getLocalDateKey();
            flexibleDayModes = { ...getDefaultFlexibleDayModes(), ...(cfg.method === 3 && cfg.flexibleDayModes ? cfg.flexibleDayModes : {}) };
            const strategy = document.getElementById('flexRevisionStrategy');
            if (strategy) strategy.value = cfg.method === 3 && cfg.revisionStrategy ? cfg.revisionStrategy : 'retencao_adaptativa';
            renderFlexibleDayModes();
            document.getElementById('modalFlexibleStudyConfig').style.display = 'flex';
        }

        function closeFlexibleStudyConfig() {
            const modal = document.getElementById('modalFlexibleStudyConfig');
            if (modal) modal.style.display = 'none';
        }

        function renderFlexibleDayModes() {
            const grid = document.getElementById('flexibleDayModesGrid');
            if (!grid) return;
            const labels = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
            grid.innerHTML = labels.map((label, idx) => {
                const value = flexibleDayModes[idx] || 'full';
                return `<label class="flex-day-card"><strong>${label}</strong><select onchange="setFlexibleDayMode(${idx},this.value)">
                    <option value="full" ${value==='full'?'selected':''}>Estudo completo</option>
                    <option value="review" ${value==='review'?'selected':''}>Só revisão</option>
                    <option value="rest" ${value==='rest'?'selected':''}>Descanso</option>
                </select></label>`;
            }).join('');
        }

        function setFlexibleDayMode(dayIdx, value) {
            flexibleDayModes[dayIdx] = ['full','review','rest'].includes(value) ? value : 'full';
        }

        function isFlexibleOpportunityMode(contestMeta = null) {
            const contest = contestMeta || getConcursosMetadata()[currentConcurso] || {};
            return Number(contest?.scheduleConfig?.method) === 3 || contest?.scheduleConfig?.availabilityMode === 'opportunity';
        }

        function getFlexibleDayMode(date = new Date(), contestMeta = null) {
            const contest = contestMeta || getConcursosMetadata()[currentConcurso] || {};
            if (!isFlexibleOpportunityMode(contest)) return 'full';
            const modes = contest?.scheduleConfig?.flexibleDayModes || getDefaultFlexibleDayModes();
            return modes[date.getDay()] || 'full';
        }

        async function activateFlexibleStudyMode() {
            if (editalItems.length === 0) return appNotice('Sua lista de edital está vazia.', { title:'Modo flexível' });
            const startDate = document.getElementById('flexDataInicio')?.value || getLocalDateKey();
            const revisionStrategy = document.getElementById('flexRevisionStrategy')?.value || 'retencao_adaptativa';
            const modes = { ...getDefaultFlexibleDayModes(), ...flexibleDayModes };
            if (Object.values(modes).every(value => value === 'rest')) {
                return appNotice('Marque pelo menos um dia como Estudo completo ou Somente revisão.', { title:'Modo flexível' });
            }
            const metadata = getConcursosMetadata();
            const contest = metadata[currentConcurso] || (metadata[currentConcurso] = {});
            const hadSchedule = Object.values(contest.dateSchedule || {}).some(items => Array.isArray(items) && items.length);
            if (hadSchedule) {
                const ok = await appConfirm('Ativar o Estudo por Oportunidade removerá a fila futura rígida do cronograma. Seu histórico, horas, progresso e retenção serão preservados. Continuar?', { title:'Ativar modo flexível', confirmText:'Ativar modo flexível' });
                if (!ok) return;
            }
            const todayKey = getLocalDateKey();
            const previousSchedule = contest.dateSchedule || {};
            // Preserva o histórico visual anterior a hoje; remove apenas a fila rígida atual/futura.
            contest.dateSchedule = Object.fromEntries(Object.entries(previousSchedule).filter(([dateKey]) => dateKey < todayKey));
            contest.pomodoroDailyTargetHours = 0;
            contest.pomodoroScheduleMethod = 3;
            contest.scheduleConfig = {
                method:3,
                availabilityMode:'opportunity',
                noFixedHours:true,
                startDate,
                revisionStrategy,
                schedulerMode:'retention_v1',
                flexibleDayModes:modes
            };
            contest.retentionScheduler = { version:RETENTION_SCHEDULER_VERSION, enabled:true, updatedAt:new Date().toISOString() };
            const retentionEngine = getRetentionEngine(contest, true);
            retentionEngine.mode = revisionStrategy === 'retencao_adaptativa' ? 'adaptive' : 'shadow';
            if (revisionStrategy === 'retencao_adaptativa') {
                Object.values(retentionEngine.topics || {}).forEach(state => {
                    if (state?.nextReviewAt) scheduleNextAdaptiveRetentionReview(contest, state, getLocalDateKey());
                });
            }
            await saveConcursosMetadata(metadata);
            closeFlexibleStudyConfig();
            renderMonthCalendar();
            renderPomodoroDailyCounter();
            filterDataByConcurso();
            await appNotice('Modo flexível ativado. Você não possui meta diária nem horário obrigatório. Use “Estudar agora” sempre que surgir uma oportunidade.', { title:'Estudo por Oportunidade ativo' });
        }

        function openOpportunityStudyModal() {
            if (!currentUser) return;
            if (!currentConcurso || currentConcurso === 'Concurso Geral' || !editalItems.length) {
                return appNotice('Crie ou selecione um concurso com matérias antes de pedir uma sugestão.', { title:'Estudar agora' });
            }
            opportunityIgnoreDayMode = false;
            opportunitySelectedMinutes = 20;
            opportunitySelectedContext = 'any';
            document.querySelectorAll('.opportunity-time-btn').forEach(btn => btn.classList.toggle('selected', Number(btn.dataset.minutes) === 20));
            document.querySelectorAll('.opportunity-context-btn').forEach(btn => btn.classList.toggle('selected', btn.dataset.context === 'any'));
            document.getElementById('modalOpportunityStudy').style.display = 'flex';
            renderOpportunityRecommendations();
        }

        function closeOpportunityStudyModal() {
            const modal = document.getElementById('modalOpportunityStudy');
            if (modal) modal.style.display = 'none';
            opportunityRecommendations = [];
            opportunityIgnoreDayMode = false;
        }

        function selectOpportunityMinutes(minutes, elem) {
            opportunitySelectedMinutes = Math.max(5, Math.min(120, Number(minutes) || 20));
            document.querySelectorAll('.opportunity-time-btn').forEach(btn => btn.classList.toggle('selected', btn === elem));
            renderOpportunityRecommendations();
        }

        function selectOpportunityContext(context, elem) {
            opportunitySelectedContext = ['any','transit','walking','focus'].includes(context) ? context : 'any';
            document.querySelectorAll('.opportunity-context-btn').forEach(btn => btn.classList.toggle('selected', btn === elem));
            renderOpportunityRecommendations();
        }

        // V9.60 — Retention Scheduler: score único de decisão de estudo.
        // O score combina relevância estratégica do edital, memória, proximidade da prova,
        // continuidade, tempo disponível e diversidade. É usado tanto no modo oportunidade
        // quanto para ordenar os tópicos dentro das filas do cronograma tradicional.
        const RETENTION_SCHEDULER_VERSION = 2;

        function getContestDaysUntilExam(contestMeta, at = new Date()) {
            const raw = contestMeta?.dataProva;
            if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
            const [y,m,d] = raw.split('-').map(Number);
            const examDay = Date.UTC(y, m - 1, d);
            const currentDay = Date.UTC(at.getFullYear(), at.getMonth(), at.getDate());
            if (!Number.isFinite(examDay) || !Number.isFinite(currentDay)) return null;
            return Math.round((examDay - currentDay) / 86400000);
        }

        // V9.63 — a proximidade da prova altera o comportamento do motor, não apenas o score bruto.
        function getExamPhaseProfile(contestMeta, at = new Date()) {
            const days = getContestDaysUntilExam(contestMeta, at);
            if (days == null) return { days:null, key:'undated', label:'Sem data de prova', score:0, theoryBoost:0, questionBoost:0, reviewBoost:0, lawBoost:0, newTheoryPenalty:0, guidance:'Defina a data da prova para ativar a estratégia progressiva.' };
            if (days < 0) return { days, key:'finished', label:'Prova realizada', score:0, theoryBoost:0, questionBoost:0, reviewBoost:0, lawBoost:0, newTheoryPenalty:0, guidance:'A data cadastrada já passou.' };
            if (days === 0) return { days, key:'exam-day', label:'Dia da prova', score:260, theoryBoost:-320, questionBoost:80, reviewBoost:360, lawBoost:220, newTheoryPenalty:-420, guidance:'Somente recuperação leve e pontos críticos. Evite conteúdo novo.' };
            if (days <= 7) return { days, key:'final', label:'Reta final', score:230, theoryBoost:-170, questionBoost:260, reviewBoost:310, lawBoost:180, newTheoryPenalty:-260, guidance:'Priorize revisões críticas, questões, erros recorrentes e lei seca.' };
            if (days <= 14) return { days, key:'intensive', label:'Revisão intensiva', score:180, theoryBoost:-90, questionBoost:210, reviewBoost:230, lawBoost:125, newTheoryPenalty:-150, guidance:'Reduza teoria nova e aumente recuperação ativa e revisões.' };
            if (days <= 30) return { days, key:'intensive', label:'Revisão intensiva', score:135, theoryBoost:-35, questionBoost:155, reviewBoost:165, lawBoost:85, newTheoryPenalty:-75, guidance:'Questões e revisões ganham mais espaço sem abandonar lacunas importantes.' };
            if (days <= 60) return { days, key:'acceleration', label:'Aceleração', score:85, theoryBoost:15, questionBoost:95, reviewBoost:90, lawBoost:45, newTheoryPenalty:-20, guidance:'Equilibre fechamento do edital com questões e revisões frequentes.' };
            if (days <= 120) return { days, key:'consolidation', label:'Consolidação', score:45, theoryBoost:55, questionBoost:50, reviewBoost:45, lawBoost:20, newTheoryPenalty:0, guidance:'Consolide teoria, avance o edital e aumente gradualmente a recuperação ativa.' };
            return { days, key:'construction', label:'Construção', score:18, theoryBoost:105, questionBoost:15, reviewBoost:20, lawBoost:10, newTheoryPenalty:0, guidance:'Priorize construção sólida da teoria e cobertura progressiva do edital.' };
        }

        function getRetentionSchedulerExamScore(contestMeta, at = new Date()) {
            const phase = getExamPhaseProfile(contestMeta, at);
            return { days:phase.days, score:phase.score, phase };
        }

        function getRetentionSchedulerWeight(item, contestMeta) {
            const explicit = Number(contestMeta?.materiaWeights?.[item?.materia]);
            if (Number.isFinite(explicit) && explicit > 0) return Math.max(.25, Math.min(8, explicit));
            const itemWeight = Number(item?.peso);
            if (Number.isFinite(itemWeight) && itemWeight > 0) return Math.max(.25, Math.min(8, itemWeight));
            const p = Math.max(1, Math.min(4, Number(item?.prioridade) || 2));
            return 5 - p;
        }

        function computeRetentionSchedulerScore(item, options = {}) {
            const contest = options.contest || getConcursosMetadata()[currentConcurso] || {};
            const now = options.now instanceof Date ? options.now : new Date();
            const p = Math.max(1, Math.min(4, Number(item?.prioridade) || 2));
            const subjectP = Math.max(1, Math.min(20, Number(item?.assunto_prioridade) || 1));
            const weight = getRetentionSchedulerWeight(item, contest);
            const state = options.state || getRetentionTopicState(contest, item?.materia, item?.assunto, false);
            const retention = state?.lastStudyAt ? calculateRetentionFromState(state, now) : null;
            const nextAt = state?.nextReviewAt ? new Date(state.nextReviewAt) : null;
            const due = !!(nextAt && Number.isFinite(nextAt.getTime()) && nextAt <= now);
            const overdueDays = due ? Math.max(0, (now.getTime() - nextAt.getTime()) / 86400000) : 0;
            const exam = getRetentionSchedulerExamScore(contest, now);
            const plan = getTopicStudyPlan(item, contest);
            const progress = getTopicStudyPlanProgress(item, contest);
            const continuation = !!(plan && progress && !progress.complete && Number(progress.current || 0) > 0);
            const recentMaterias = options.recentMaterias || [];
            const activityType = options.activityType || (!item?.teoria ? 'teoria' : 'questoes');
            const availableMinutes = Number(options.availableMinutes) || 0;
            const suggestedMinutes = Math.max(5, Number(options.suggestedMinutes) || Number(plan?.sessionMinutes) || (activityType === 'teoria' ? 40 : 20));
            const contextMode = options.contextMode || 'any';
            const isRevision = !!options.isRevision;

            const components = {
                priority: (5 - p) * 150,
                subjectPriority: Math.max(0, 70 - (subjectP - 1) * 5),
                weight: Math.min(260, weight * 42),
                memory: retention == null ? 0 : Math.max(0, (100 - retention) * (isRevision ? 6.5 : 2.2)),
                due: isRevision ? (due ? 340 + Math.min(300, overdueDays * 34) : 80) : 0,
                exam: Math.round(exam.score * (isRevision ? 1.25 : (activityType === 'questoes' ? .75 : .40))),
                examPhase: 0,
                continuation: continuation ? 160 : 0,
                recentPenalty: recentMaterias[0] === item?.materia ? -120 : (recentMaterias.includes(item?.materia) ? -45 : 0),
                timeFit: 0,
                context: 0,
                questionPerformance: 0
            };

            const phase = exam.phase || getExamPhaseProfile(contest, now);
            if (isRevision) components.examPhase += phase.reviewBoost || 0;
            if (activityType === 'questoes') components.examPhase += phase.questionBoost || 0;
            if (activityType === 'teoria') {
                components.examPhase += phase.theoryBoost || 0;
                if (!state?.lastStudyAt) components.examPhase += phase.newTheoryPenalty || 0;
            }
            if (activityType === 'lei_seca') components.examPhase += phase.lawBoost || 0;

            if (activityType === 'questoes' && Number.isFinite(Number(state?.questionStats?.lastAccuracy))) {
                const lastAccuracy = Number(state.questionStats.lastAccuracy);
                const confidence = Math.max(0.08, Math.min(1, Number(state.questionStats.confidence) || 0.25));
                if (lastAccuracy < 40) components.questionPerformance += Math.round(260 * confidence);
                else if (lastAccuracy < 60) components.questionPerformance += Math.round(185 * confidence);
                else if (lastAccuracy < 75) components.questionPerformance += Math.round(105 * confidence);
                else if (lastAccuracy < 90) components.questionPerformance += Math.round(35 * confidence);
                else components.questionPerformance -= Math.round(45 * confidence);
            }

            if (availableMinutes > 0) {
                const ratio = availableMinutes / Math.max(1, suggestedMinutes);
                if (ratio >= 1) components.timeFit = 90;
                else if (ratio >= .65) components.timeFit = 35;
                else components.timeFit = -Math.min(220, (1 - ratio) * 260);
            }
            if (contextMode === 'focus' && activityType === 'teoria' && availableMinutes >= 40) components.context += 100;
            if ((contextMode === 'walking' || contextMode === 'transit') && activityType === 'teoria') components.context -= 190;
            if ((contextMode === 'walking' || contextMode === 'transit') && isRevision) components.context += 60;
            if (availableMinutes > 0 && availableMinutes <= 10 && activityType === 'teoria') components.context -= 130;

            const total = Object.values(components).reduce((sum, value) => sum + Number(value || 0), 0);
            return {
                total,
                components,
                retention,
                due,
                overdueDays,
                daysUntilExam: exam.days,
                examPhase: phase.key,
                examPhaseLabel: phase.label,
                examGuidance: phase.guidance,
                continuation,
                suggestedMinutes,
                questionAccuracy: Number.isFinite(Number(state?.questionStats?.lastAccuracy)) ? Number(state.questionStats.lastAccuracy) : null
            };
        }

        function getOpportunityPriorityScore(item) {
            const contest = getConcursosMetadata()[currentConcurso] || {};
            return computeRetentionSchedulerScore(item, { contest }).total;
        }

        function countFlashcardsForTopic(materia, assunto) {
            return flashcardsList.filter(fc => fc?.materia === materia && (!assunto || fc?.assunto === assunto)).length;
        }

        function getRecentStudyMaterias(contest, limit = 4) {
            return (contest?.studySessions || []).slice().sort((a,b) => getRetentionEventDate(b) - getRetentionEventDate(a)).slice(0,limit).map(s => s?.materia).filter(Boolean);
        }

        // V9.64 — escolhe o método de recuperação, não apenas o assunto.
        function getActiveRecallMethodRecommendation(item, options = {}) {
            const contest = options.contest || getConcursosMetadata()[currentConcurso] || {};
            const now = options.now instanceof Date ? options.now : new Date();
            const state = options.state || getRetentionTopicState(contest,item?.materia,item?.assunto,false);
            const retention = state?.lastStudyAt ? calculateRetentionFromState(state,now) : null;
            const minutes = Math.max(5, Number(options.minutes) || 20);
            const contextMode = options.contextMode || 'any';
            const isRevision = !!options.isRevision;
            const cards = countFlashcardsForTopic(item?.materia,item?.assunto);
            const legal = isLegalStudyMateria(item?.materia);
            const phase = getExamPhaseProfile(contest,now);
            const accuracy = Number.isFinite(Number(state?.questionStats?.lastAccuracy)) ? Number(state.questionStats.lastAccuracy) : null;
            const confidence = Math.max(0,Math.min(1,Number(state?.questionStats?.confidence)||0));
            const forgotRecently = state?.lastRating === 'forgot';
            const theoryDone = !!item?.teoria;
            const questionsDone = !!item?.questoes;
            const lowKnowledge = forgotRecently || (retention != null && retention < 43) || (accuracy != null && confidence >= .25 && accuracy < 45);
            const shortWindow = minutes <= 10;
            const mobileContext = contextMode === 'walking' || contextMode === 'transit';

            // Retenção muito baixa pede reconstrução do conhecimento quando houver condições.
            if (lowKnowledge && !mobileContext && minutes >= 20) {
                return { method:'reestudo', label:'Reestudo de teoria', activityType:'teoria', minutes:Math.min(minutes, Math.max(20, Number(getTopicStudyPlan(item,contest)?.sessionMinutes)||40)), reason:'Retenção ou desempenho indicam perda relevante do conteúdo.' };
            }
            // Janelas muito curtas e deslocamento favorecem recuperação leve.
            if ((shortWindow || mobileContext) && cards > 0) {
                return { method:'flashcards', label:'Flashcards', activityType:'flashcards', minutes:Math.min(minutes,15), reason:`Há ${cards} flashcard${cards===1?'':'s'} disponível${cards===1?'':'is'} para recuperação rápida.`, flashcardCount:cards };
            }
            if (shortWindow || mobileContext) {
                return { method:'revisao_ativa', label:'Revisão ativa', activityType:'revisao_ativa', minutes:Math.min(minutes,15), reason:'Janela curta favorece recuperação mental sem releitura extensa.' };
            }
            // Na reta final, matéria normativa ganha Lei Seca quando a teoria básica já existe.
            if (legal && theoryDone && ['final','exam-day','intensive'].includes(phase.key) && minutes >= 10 && contextMode !== 'walking') {
                return { method:'lei_seca', label:'Lei Seca', activityType:'lei_seca', minutes:Math.min(minutes,25), reason:`${phase.label}: leitura normativa ganha prioridade para conteúdo jurídico.` };
            }
            // Questões são o padrão de recuperação quando a teoria já foi estudada.
            if (theoryDone && (!questionsDone || isRevision || accuracy == null || accuracy < 90)) {
                const reason = accuracy == null ? 'A teoria já foi estudada; use questões para testar recuperação.' : `Último desempenho em questões: ${Math.round(accuracy)}%.`;
                return { method:'questoes', label:'Questões', activityType:'questoes', minutes:Math.min(minutes,20), reason };
            }
            if (cards > 0 && isRevision) {
                return { method:'flashcards', label:'Flashcards', activityType:'flashcards', minutes:Math.min(minutes,15), reason:`Revisão rápida com ${cards} card${cards===1?'':'s'} do assunto.`, flashcardCount:cards };
            }
            if (isRevision) {
                return { method:'revisao_ativa', label:'Revisão ativa', activityType:'revisao_ativa', minutes:Math.min(minutes,15), reason:'Recupere conceitos essenciais antes de consultar o material.' };
            }
            return { method:'teoria', label:'Teoria', activityType:'teoria', minutes:Math.min(minutes, Number(getTopicStudyPlan(item,contest)?.sessionMinutes)||40), reason:'Conteúdo ainda precisa de construção teórica.' };
        }

        function getActiveRecallMethodLabel(rec) {
            return rec?.methodLabel || ({ questoes:'Questões', flashcards:'Flashcards', revisao_ativa:'Revisão ativa', lei_seca:'Lei Seca', reestudo:'Reestudo de teoria', teoria:'Teoria' })[rec?.method] || 'Estudo';
        }

        function buildActiveRecallPrompts(materia, assunto) {
            const subject=String(assunto||'este assunto').trim();
            const discipline=String(materia||'a matéria').trim();
            return [
                `Explique, sem consultar material, o que você considera essencial em “${subject}”.`,
                `Liste os principais conceitos, regras, etapas ou elementos relacionados a “${subject}”.`,
                `Quais diferenças, exceções ou pegadinhas poderiam aparecer em uma questão de ${discipline}?`,
                `Crie mentalmente um exemplo prático e tente aplicar “${subject}” a ele.`
            ];
        }

        function openActiveRecallGuide(rec) {
            pendingGuidedActiveRecall = rec ? {...rec} : null;
            if (!pendingGuidedActiveRecall) return;
            const topic=document.getElementById('activeRecallGuideTopic');
            const meta=document.getElementById('activeRecallGuideMeta');
            const prompts=document.getElementById('activeRecallGuidePrompts');
            if(topic) topic.textContent=`${rec.materia} — ${rec.assunto}`;
            if(meta) meta.textContent=`Tente recuperar o conteúdo sem ajuda por ${Math.max(5,Math.round(Number(rec.minutes)||10))} min. Ao concluir, o feedback recalibrará a próxima revisão.`;
            if(prompts) prompts.innerHTML=buildActiveRecallPrompts(rec.materia,rec.assunto).map((text,i)=>`<div class="active-recall-prompt"><strong>${i+1}.</strong> ${escapeHtml(text)}</div>`).join('');
            document.getElementById('modalActiveRecallGuide').style.display='flex';
        }

        function closeActiveRecallGuide() {
            const modal=document.getElementById('modalActiveRecallGuide'); if(modal) modal.style.display='none';
            pendingGuidedActiveRecall=null;
        }

        function startGuidedActiveRecallSession() {
            const rec=pendingGuidedActiveRecall; if(!rec) return;
            const modal=document.getElementById('modalActiveRecallGuide'); if(modal) modal.style.display='none';
            pendingGuidedActiveRecall=null;
            launchOpportunityPomodoro({ ...rec, activityType:'teoria', isRevision:true, recoveryMethod:'revisao_ativa', method:'revisao_ativa', methodLabel:'Revisão ativa' });
        }

        function openLegalReadingForOpportunity(rec) {
            const item = editalItems.find(i => String(i.id)===String(rec?.itemId)) || editalItems.find(i => i.materia===rec?.materia && i.assunto===rec?.assunto);
            if(!item) return appNotice('O assunto recomendado não foi encontrado no edital.',{title:'Lei Seca'});
            if(!isLegalStudyMateria(item.materia)) return appNotice('Lei Seca está disponível apenas para matérias jurídicas ou normativas.',{title:'Lei Seca'});
            const todayKey=getLocalDateKey();
            pendingLegalStudyContext={ concurso:currentConcurso,materia:item.materia,assunto:item.assunto,itemId:item.id,dateKey:todayKey,plannedDateKey:todayKey,adaptiveAdvance:false,activityType:'lei_seca',isRevision:!!rec?.isRevision,source:'active_recall' };
            document.getElementById('legalReadingContext').innerHTML=`<strong>${escapeHtml(item.materia)}</strong> — ${escapeHtml(item.assunto)}`;
            document.getElementById('legalReadingNorm').value='';
            document.getElementById('legalReadingStartArticle').value='';
            document.getElementById('legalReadingEndArticle').value='';
            document.getElementById('legalReadingMinutes').value=Math.max(5,Math.round(Number(rec?.minutes)||15));
            document.getElementById('legalReadingSaveBlock').checked=true;
            renderLegalReadingBlockOptions(item.materia);
            closeOpportunityStudyModal();
            document.getElementById('modalLegalReading').style.display='flex';
        }

        function buildOpportunityRecommendations(minutes = opportunitySelectedMinutes, contextMode = opportunitySelectedContext) {
            const metadata = getConcursosMetadata();
            const contest = metadata[currentConcurso] || {};
            const now = new Date();
            const todayKey = getLocalDateKey(now);
            const dayMode = getFlexibleDayMode(now, contest);
            const reviewOnly = isFlexibleOpportunityMode(contest) && dayMode === 'review' && !opportunityIgnoreDayMode;
            if (isFlexibleOpportunityMode(contest) && dayMode === 'rest' && !opportunityIgnoreDayMode) return [];
            const recentMaterias = getRecentStudyMaterias(contest);
            const candidates = [];
            const seen = new Set();
            const engine = getRetentionEngine(contest, false);

            Object.values(engine?.topics || {}).forEach(state => {
                const item = editalItems.find(i => getStudyTopicKey(i.materia,i.assunto) === state.key);
                if (!item || !state?.lastStudyAt) return;
                const retention = calculateRetentionFromState(state, now);
                const nextAt = state.nextReviewAt ? new Date(state.nextReviewAt) : null;
                const due = nextAt && Number.isFinite(nextAt.getTime()) && nextAt <= new Date(`${todayKey}T23:59:59`);
                if (!due && retention > 72) return;
                const key = `review::${state.key}`;
                if (seen.has(key)) return; seen.add(key);
                const methodRec = getActiveRecallMethodRecommendation(item,{ contest,now,state,isRevision:true,minutes,contextMode });
                const suggested = Math.max(5,Math.min(minutes,Number(methodRec.minutes)||15));
                const scoreActivity = methodRec.activityType === 'revisao_ativa' || methodRec.activityType === 'flashcards' ? 'questoes' : methodRec.activityType;
                const scheduler = computeRetentionSchedulerScore(item, { contest, now, state, isRevision:true, activityType:scoreActivity, availableMinutes:minutes, suggestedMinutes:suggested, contextMode, recentMaterias });
                const score = 900 + scheduler.total + (methodRec.method==='reestudo'?80:methodRec.method==='revisao_ativa'?45:0);
                candidates.push({ kind:methodRec.method==='flashcards'?'flashcards':'study', materia:item.materia, assunto:item.assunto, itemId:item.id, activityType:methodRec.activityType, method:methodRec.method, methodLabel:methodRec.label, recoveryMethod:methodRec.method, flashcardCount:methodRec.flashcardCount||0, isRevision:true, retention, due, score, scheduler, minutes:suggested, reason:`${due?'Revisão vencida ou prevista para agora':'Retenção estimada abaixo do alvo'} ${methodRec.reason}`.trim() });
            });

            if (minutes <= 20 || contextMode === 'transit' || contextMode === 'walking' || reviewOnly) {
                editalItems.forEach(item => {
                    const count = countFlashcardsForTopic(item.materia,item.assunto);
                    if (!count) return;
                    const state = getRetentionTopicState(contest,item.materia,item.assunto,false);
                    const retention = state ? calculateRetentionFromState(state,now) : 75;
                    const key = `flash::${getStudyTopicKey(item.materia,item.assunto)}`;
                    if (seen.has(key)) return; seen.add(key);
                    const scheduler = computeRetentionSchedulerScore(item, { contest, now, state, isRevision:true, activityType:'questoes', availableMinutes:minutes, suggestedMinutes:Math.min(minutes, 15), contextMode, recentMaterias });
                    let score = 520 + scheduler.total;
                    if (contextMode === 'walking') score += 210;
                    if (contextMode === 'transit') score += 150;
                    if (minutes <= 10) score += 140;
                    candidates.push({ kind:'flashcards', materia:item.materia, assunto:item.assunto, itemId:item.id, flashcardCount:count, retention, score, scheduler, minutes, reason:`${count} flashcard${count===1?'':'s'} disponível${count===1?'':'is'} para recuperação ativa` });
                });
            }

            if (!reviewOnly) {
                editalItems.forEach(item => {
                    if (item.teoria && item.questoes) return;
                    const key = `normal::${getStudyTopicKey(item.materia,item.assunto)}`;
                    if (seen.has(key)) return; seen.add(key);
                    const plan = getTopicStudyPlan(item,contest);
                    const progress = getTopicStudyPlanProgress(item,contest);
                    const isContinuation = !!(plan && progress && !progress.complete && Number(progress.current || 0) > 0);
                    const state = getRetentionTopicState(contest,item.materia,item.assunto,false);
                    const methodRec = getActiveRecallMethodRecommendation(item,{ contest,now,state,isRevision:false,minutes,contextMode });
                    if (contextMode === 'walking' && ['teoria','reestudo','lei_seca'].includes(methodRec.method)) return;
                    const activityType=methodRec.activityType;
                    const suggested = Math.max(5,Math.min(minutes,Number(methodRec.minutes)||20));
                    const scoreActivity = activityType === 'revisao_ativa' || activityType === 'flashcards' ? 'questoes' : activityType;
                    const scheduler = computeRetentionSchedulerScore(item, { contest, now, state, isRevision:false, activityType:scoreActivity, availableMinutes:minutes, suggestedMinutes:suggested, contextMode, recentMaterias });
                    let score = 430 + scheduler.total;
                    if(methodRec.method==='reestudo') score += 95;
                    if(methodRec.method==='revisao_ativa') score += 40;
                    candidates.push({ kind:methodRec.method==='flashcards'?'flashcards':'study', materia:item.materia, assunto:item.assunto, itemId:item.id, activityType, method:methodRec.method, methodLabel:methodRec.label, recoveryMethod:methodRec.method, flashcardCount:methodRec.flashcardCount||0, isRevision:false, score, scheduler, minutes:suggested, reason:isContinuation && methodRec.method==='teoria'?'Continuar assunto já iniciado':methodRec.reason });
                });
            }

            candidates.sort((a,b) => b.score-a.score || String(a.materia).localeCompare(String(b.materia),'pt-BR'));
            const picked=[];
            const materias=new Set();
            for (const c of candidates) {
                if (picked.length>=3) break;
                if (materias.has(c.materia) && candidates.some(x => !materias.has(x.materia) && !picked.includes(x))) continue;
                picked.push(c); materias.add(c.materia);
            }
            return picked.length ? picked : candidates.slice(0,3);
        }

        function renderOpportunityRecommendations() {
            const container = document.getElementById('opportunityRecommendations');
            const hint = document.getElementById('opportunityModeHint');
            if (!container) return;
            const contest = getConcursosMetadata()[currentConcurso] || {};
            const dayMode = getFlexibleDayMode(new Date(),contest);
            if (hint) {
                hint.textContent = isFlexibleOpportunityMode(contest)
                    ? `Modo flexível ativo • Hoje: ${dayMode==='full'?'estudo completo':dayMode==='review'?'somente revisão':'descanso'}. Nenhum horário fixo é necessário.`
                    : (() => { const phase=getExamPhaseProfile(contest); return `Você pode usar esta função mesmo com cronograma tradicional. Fase atual: ${phase.label}. ${phase.guidance}`; })();
            }
            if (isFlexibleOpportunityMode(contest) && dayMode==='rest' && !opportunityIgnoreDayMode) {
                opportunityRecommendations=[];
                container.innerHTML = `<div class="opportunity-empty">Hoje está marcado como <strong>Descanso</strong>.<br>O Painel respeitou essa escolha.<div style="margin-top:10px;"><button class="btn btn-secondary btn-sm" onclick="ignoreFlexibleRestForOpportunity()">Estudar mesmo assim desta vez</button></div></div>`;
                return;
            }
            opportunityRecommendations = buildOpportunityRecommendations();
            if (!opportunityRecommendations.length) {
                container.innerHTML='<div class="opportunity-empty">Não encontrei uma revisão ou atividade elegível para este momento. Você pode alterar o tempo/contexto ou registrar uma bateria de questões em um assunto do cronograma.</div>';
                return;
            }
            container.innerHTML = opportunityRecommendations.map((rec,idx) => {
                const kindLabel = rec.isRevision ? 'Revisão' : 'Estudo';
                const methodLabel = getActiveRecallMethodLabel(rec);
                const retentionBadge = Number.isFinite(rec.retention) ? `<span class="opportunity-badge">Memória ${Math.round(rec.retention)}%</span>` : '';
                const examBadge = Number.isFinite(rec.scheduler?.daysUntilExam) && rec.scheduler.daysUntilExam >= 0 && rec.scheduler.daysUntilExam <= 60 ? `<span class="opportunity-badge">${escapeHtml(rec.scheduler.examPhaseLabel || 'Prova')} · ${rec.scheduler.daysUntilExam}d</span>` : '';
                const questionBadge = rec.activityType==='questoes' && Number.isFinite(rec.scheduler?.questionAccuracy) ? `<span class="opportunity-badge">Último desempenho ${Math.round(rec.scheduler.questionAccuracy)}%</span>` : '';
                const actions = rec.activityType==='questoes'
                    ? `<div class="opportunity-question-actions"><button class="btn btn-success btn-sm" onclick="startOpportunityRecommendation(${idx})">Iniciar agora</button><button class="btn btn-secondary btn-sm" onclick="registerOpportunityQuestionResult(${idx})">Registrar resultado</button></div>`
                    : `<button class="btn btn-success btn-sm" onclick="startOpportunityRecommendation(${idx})">Iniciar agora</button>`;
                return `<div class="opportunity-card"><div class="opportunity-card-top"><div><div class="opportunity-card-title">${escapeHtml(rec.materia)} — ${escapeHtml(rec.assunto)}</div><div class="active-recall-method-line">Método recomendado: <span>${escapeHtml(methodLabel)}</span></div><div class="opportunity-card-meta">${escapeHtml(rec.reason)} · sugestão de ${Math.max(1,Math.round(rec.minutes||opportunitySelectedMinutes))} min</div><div class="opportunity-card-badges"><span class="opportunity-badge">${kindLabel}</span>${retentionBadge}${examBadge}${questionBadge}${rec.scheduler?.continuation?'<span class="opportunity-badge">Em andamento</span>':''}${rec.flashcardCount?`<span class="opportunity-badge">${rec.flashcardCount} cards</span>`:''}</div></div>${actions}</div></div>`;
            }).join('');
        }

        function ignoreFlexibleRestForOpportunity() {
            opportunityIgnoreDayMode = true;
            renderOpportunityRecommendations();
        }

        function clearAdaptiveReviewsForTopicThrough(contest, materia, assunto, throughKey = getLocalDateKey()) {
            const topicText = getStudyTopicKey(materia,assunto);
            Object.keys(contest?.dateSchedule || {}).forEach(dateKey => {
                if (dateKey > throughKey || !Array.isArray(contest.dateSchedule[dateKey])) return;
                contest.dateSchedule[dateKey] = contest.dateSchedule[dateKey].filter(raw => !(isAdaptiveRetentionReviewText(raw) && normalizeScheduledTopicForStudy(raw)===topicText));
                if (!contest.dateSchedule[dateKey].length) delete contest.dateSchedule[dateKey];
            });
        }

        function launchOpportunityPomodoro(rec) {
            const item = editalItems.find(i => String(i.id)===String(rec.itemId)) || editalItems.find(i => i.materia===rec.materia && i.assunto===rec.assunto);
            if (!item) return appNotice('O assunto recomendado não foi encontrado no edital.', { title:'Estudar agora' });
            const requestedMinutes = Math.max(1,Math.min(240,Math.round(Number(rec.minutes)||opportunitySelectedMinutes)));
            const focusInput=document.getElementById('focoMin'); if(focusInput) focusInput.value=requestedMinutes;
            activeStudyContext={ concurso:currentConcurso,materia:item.materia,assunto:item.assunto,itemId:item.id,dateKey:getLocalDateKey(),plannedDateKey:getLocalDateKey(),adaptiveAdvance:false,isRevision:!!rec.isRevision,activityType:rec.activityType==='questoes'?'questoes':'teoria',recoveryMethod:rec.recoveryMethod||rec.method||null,layer:rec.layer||null,source:rec.source||'opportunity' };
            renderActiveStudyContext();
            closeOpportunityStudyModal();
            const editalTabButton=[...document.querySelectorAll('.tab-btn')].find(btn=>/edital verticalizado/i.test(btn.textContent||''));
            if(editalTabButton) switchTab('tab-edital',editalTabButton);
            clearInterval(timerInterval); timerInterval=null; timerMode='focus'; timerHasStarted=false; isTimerPaused=false; currentFocusCycleMinutes=0; focusSessionCommitted=false; timeLeft=requestedMinutes*60; currentTimerTotalSeconds=timeLeft; updateDisplay(); updatePauseButton();
            requestAnimationFrame(()=>{ const pomodoro=document.querySelector('.pomodoro-card'); if(pomodoro) pomodoro.scrollIntoView({behavior:'smooth',block:'center'}); startTimer(); });
        }

        function registerOpportunityQuestionResult(index) {
            const rec = opportunityRecommendations[index];
            if (!rec || rec.activityType !== 'questoes') return;
            closeOpportunityStudyModal();
            openQuestionPerformanceModal({ materia:rec.materia, assunto:rec.assunto, itemId:rec.itemId, dateKey:getLocalDateKey(), isRevision:!!rec.isRevision, source:'opportunity_manual' });
        }

        function startOpportunityRecommendation(index) {
            const rec=opportunityRecommendations[index]; if(!rec) return;
            if(rec.kind==='flashcards' || rec.method==='flashcards') {
                const cards=flashcardsList.filter(fc=>fc?.materia===rec.materia && fc?.assunto===rec.assunto);
                if(!cards.length) return appNotice('Os flashcards desta recomendação não estão mais disponíveis.',{title:'Flashcards'});
                closeOpportunityStudyModal();
                return startStudyModalWithList(cards,`oportunidade:${rec.materia}:${rec.assunto}`);
            }
            if(rec.method==='revisao_ativa' || rec.activityType==='revisao_ativa') {
                closeOpportunityStudyModal();
                return openActiveRecallGuide(rec);
            }
            if(rec.method==='lei_seca' || rec.activityType==='lei_seca') return openLegalReadingForOpportunity(rec);
            launchOpportunityPomodoro(rec);
        }

        function openModalMentorisMethod() {
            const contest = getConcursosMetadata()[currentConcurso] || {};
            const cfg = contest.scheduleConfig || {};
            document.getElementById('m2DataInicio').value = cfg.startDate || new Date().toISOString().split('T')[0];
            if (cfg.method === 2 && Array.isArray(cfg.weekdays) && cfg.weekdays.length) selectedWeekdays = [...cfg.weekdays];
            useCustomDailyHours = !!(cfg.method === 2 && cfg.customDailyHoursByWeekday);
            if (useCustomDailyHours) customDailyHoursByWeekday = {...customDailyHoursByWeekday, ...cfg.customDailyHoursByWeekday};
            document.querySelectorAll('.weekday-btn').forEach((btn, idx) => btn.classList.toggle('selected', selectedWeekdays.includes(idx)));
            renderCustomDailyHoursGrid();
            document.getElementById('customDailyHoursPanel').style.display = useCustomDailyHours ? 'block' : 'none';
            const hourCards = [...document.querySelectorAll('#hoursSelectionContainer .hours-option-card')];
            hourCards.forEach(card => card.classList.remove('selected'));
            if (useCustomDailyHours && hourCards.length) hourCards[hourCards.length - 1].classList.add('selected');
            else {
                const targets = [1,2,4,5];
                const idx = targets.indexOf(Number(cfg.dailySlots || selectedDailyHoursSlots));
                if (idx >= 0 && hourCards[idx]) hourCards[idx].classList.add('selected');
                else if (hourCards[1]) hourCards[1].classList.add('selected');
            }
            if (cfg.revisionStrategy && document.getElementById('m2RevisionStrategy')) document.getElementById('m2RevisionStrategy').value = cfg.revisionStrategy;
            document.getElementById('modalMentorisMethod').style.display = 'flex';
        }
        function closeModalMentorisMethod() { document.getElementById('modalMentorisMethod').style.display = 'none'; }

        function toggleWeekdaySelect(elem, dayIdx) {
            elem.classList.toggle('selected');
            if (selectedWeekdays.includes(dayIdx)) selectedWeekdays = selectedWeekdays.filter(d => d !== dayIdx);
            else selectedWeekdays.push(dayIdx);
            renderCustomDailyHoursGrid();
        }

        function selectHoursOption(elem, slots) {
            document.querySelectorAll('#hoursSelectionContainer .hours-option-card').forEach(c => c.classList.remove('selected'));
            elem.classList.add('selected');
            selectedDailyHoursSlots = slots;
            useCustomDailyHours = false;
            const panel = document.getElementById('customDailyHoursPanel');
            if (panel) panel.style.display = 'none';
        }

        function selectCustomDailyHoursOption(elem) {
            document.querySelectorAll('#hoursSelectionContainer .hours-option-card').forEach(c => c.classList.remove('selected'));
            elem.classList.add('selected');
            useCustomDailyHours = true;
            renderCustomDailyHoursGrid();
            const panel = document.getElementById('customDailyHoursPanel');
            if (panel) panel.style.display = 'block';
        }

        function renderCustomDailyHoursGrid() {
            const grid = document.getElementById('customDailyHoursGrid');
            if (!grid) return;
            const labels = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
            grid.innerHTML = selectedWeekdays.slice().sort((a,b)=>a-b).map(dayIdx => `
                <label class="custom-day-hours"><strong>${labels[dayIdx]}</strong><input type="number" min="1" max="12" step="1" value="${Math.max(1, Math.round(Number(customDailyHoursByWeekday[dayIdx]) || 1))}" onchange="setCustomDailyHours(${dayIdx}, this.value)"><span>h</span></label>
            `).join('');
        }

        function setCustomDailyHours(dayIdx, value) {
            customDailyHoursByWeekday[dayIdx] = Math.max(1, Math.min(12, Math.round(Number(value) || 1)));
        }

        function getMethod2HoursForWeekday(dayIdx) {
            if (!useCustomDailyHours) return Math.max(1, Math.round(Number(selectedDailyHoursSlots) || 1));
            return Math.max(1, Math.min(12, Math.round(Number(customDailyHoursByWeekday[dayIdx]) || 1)));
        }

        function applySpacedRevisions(dateSchedule, baseDateObj, topicText, strategyKey) {
            if (strategyKey === 'retencao_adaptativa') return;
            const daysOffset = STRATEGIES_MAP[strategyKey] || STRATEGIES_MAP.classica;
            daysOffset.forEach(offset => {
                let revDate = new Date(baseDateObj);
                revDate.setDate(revDate.getDate() + offset);
                const revKey = `${revDate.getFullYear()}-${String(revDate.getMonth() + 1).padStart(2, '0')}-${String(revDate.getDate()).padStart(2, '0')}`;
                if (!dateSchedule[revKey]) dateSchedule[revKey] = [];
                const offsetLabel = `${offset}d`;
                const revText = `🔄 Rev (${offsetLabel}): ${topicText}`;
                if (!dateSchedule[revKey].includes(revText)) dateSchedule[revKey].push(revText);
            });
        }

        function getSortedEditalItems() {
            return [...editalItems].sort((a, b) => {
                const prioMatA = a.prioridade || 1;
                const prioMatB = b.prioridade || 1;
                if (prioMatA !== prioMatB) return prioMatA - prioMatB;
                const prioAssA = a.assunto_prioridade || 1;
                const prioAssB = b.assunto_prioridade || 1;
                return prioAssA - prioAssB;
            });
        }

        async function gerarCronogramaMetodo2() {
            if (editalItems.length === 0) return alert('Sua lista de edital está vazia.');
            if (selectedWeekdays.length === 0) return alert('Selecione pelo menos um dia de estudo na semana.');
            const dataInicioStr = document.getElementById('m2DataInicio').value;
            if (!dataInicioStr) return alert('Escolha a data de início.');

            const strategyKey = document.getElementById('m2RevisionStrategy').value;
            let currDate = new Date(dataInicioStr + "T00:00:00");

            let metadata = getConcursosMetadata();
            if (!metadata[currentConcurso]) metadata[currentConcurso] = {};
            metadata[currentConcurso].dateSchedule = {};
            const interleaveState = createWeightedInterleavingState(editalItems, metadata, { pendingOnly:false });

            while (countWeightedInterleavingRemaining(interleaveState)) {
                const dayOfWeek = currDate.getDay();
                if (selectedWeekdays.includes(dayOfWeek)) {
                    const dateKey = `${currDate.getFullYear()}-${String(currDate.getMonth() + 1).padStart(2, '0')}-${String(currDate.getDate()).padStart(2, '0')}`;
                    if (!metadata[currentConcurso].dateSchedule[dateKey]) metadata[currentConcurso].dateSchedule[dateKey] = [];
                    const dayHours = getMethod2HoursForWeekday(dayOfWeek);
                    const usedMateriasToday = new Set();
                    for (let s = 0; s < dayHours; s++) {
                        const it = takeWeightedInterleavedItem(interleaveState, usedMateriasToday);
                        if (!it) break;
                        const topicText = `${it.materia} - ${it.assunto}`;
                        metadata[currentConcurso].dateSchedule[dateKey].push(topicText);
                        applySpacedRevisions(metadata[currentConcurso].dateSchedule, currDate, topicText, strategyKey);
                    }
                }
                currDate.setDate(currDate.getDate() + 1);
            }

            const selectedHours = selectedWeekdays.map(dayIdx => getMethod2HoursForWeekday(dayIdx));
            const fallbackTarget = selectedHours.length ? Math.round((selectedHours.reduce((a,b)=>a+b,0) / selectedHours.length) * 100) / 100 : 0;
            metadata[currentConcurso].pomodoroDailyTargetHours = fallbackTarget;
            metadata[currentConcurso].pomodoroScheduleMethod = 2;
            metadata[currentConcurso].scheduleConfig = {
                method: 2, startDate: dataInicioStr, revisionStrategy: strategyKey, schedulerMode:'retention_v1',
                weekdays: [...selectedWeekdays], dailySlots: useCustomDailyHours ? null : selectedDailyHoursSlots,
                customDailyHoursByWeekday: useCustomDailyHours ? Object.fromEntries(selectedWeekdays.map(dayIdx => [dayIdx, getMethod2HoursForWeekday(dayIdx)])) : null
            };
            metadata[currentConcurso].retentionScheduler = { version:RETENTION_SCHEDULER_VERSION, enabled:true, updatedAt:new Date().toISOString() };
            getRetentionEngine(metadata[currentConcurso], true).mode = strategyKey === 'retencao_adaptativa' ? 'adaptive' : 'shadow';
            await saveConcursosMetadata(metadata);
            closeModalMentorisMethod();
            renderMonthCalendar();
            renderPomodoroDailyCounter();
            filterDataByConcurso();
            const targetMsg = useCustomDailyHours ? 'Meta diária adaptativa conforme as horas configuradas em cada dia.' : `Meta diária do Pomodoro: ${selectedDailyHoursSlots}h.`;
            alert(`Cronograma Método 2 gerado com sucesso! ${targetMsg}`);
        }

        async function gerarCronogramaInteligente() {
            if (editalItems.length === 0) return alert('Sua lista de edital está vazia.');
            const dataInicioStr = document.getElementById('cfgDataInicio').value;
            if (!dataInicioStr) return alert('Escolha a data de início.');

            const strategyKey = document.getElementById('m1RevisionStrategy').value;
            const incSab = document.getElementById('cfgIncluirSabado').checked;
            const incDom = document.getElementById('cfgIncluirDomingo').checked;
            const dailySlots = ['cfgManhaQtd', 'cfgTardeQtd', 'cfgNoiteQtd']
                .map(id => Math.max(0, parseInt(document.getElementById(id).value) || 0))
                .reduce((total, value) => total + value, 0);
            if (dailySlots < 1) return alert('Informe pelo menos 1 hora de estudo em algum turno.');

            let currDate = new Date(dataInicioStr + "T00:00:00");

            let metadata = getConcursosMetadata();
            if (!metadata[currentConcurso]) metadata[currentConcurso] = {};
            metadata[currentConcurso].dateSchedule = {};
            const interleaveState = createWeightedInterleavingState(editalItems, metadata, { pendingOnly:false });

            while (countWeightedInterleavingRemaining(interleaveState)) {
                const dayOfWeek = currDate.getDay();
                let canStudy = true;
                if (dayOfWeek === 6 && !incSab) canStudy = false;
                if (dayOfWeek === 0 && !incDom) canStudy = false;

                if (canStudy) {
                    const dateKey = `${currDate.getFullYear()}-${String(currDate.getMonth() + 1).padStart(2, '0')}-${String(currDate.getDate()).padStart(2, '0')}`;
                    if (!metadata[currentConcurso].dateSchedule[dateKey]) metadata[currentConcurso].dateSchedule[dateKey] = [];
                    const usedMateriasToday = new Set();
                    for (let s = 0; s < dailySlots; s++) {
                        const it = takeWeightedInterleavedItem(interleaveState, usedMateriasToday);
                        if (!it) break;
                        const topicText = `${it.materia} - ${it.assunto}`;
                        metadata[currentConcurso].dateSchedule[dateKey].push(topicText);
                        applySpacedRevisions(metadata[currentConcurso].dateSchedule, currDate, topicText, strategyKey);
                    }
                }
                currDate.setDate(currDate.getDate() + 1);
            }

            metadata[currentConcurso].pomodoroDailyTargetHours = dailySlots;
            metadata[currentConcurso].pomodoroScheduleMethod = 1;
            metadata[currentConcurso].scheduleConfig = {
                method: 1, startDate: dataInicioStr, revisionStrategy: strategyKey, schedulerMode:'retention_v1',
                includeSaturday: incSab, includeSunday: incDom, dailySlots
            };
            metadata[currentConcurso].retentionScheduler = { version:RETENTION_SCHEDULER_VERSION, enabled:true, updatedAt:new Date().toISOString() };
            getRetentionEngine(metadata[currentConcurso], true).mode = strategyKey === 'retencao_adaptativa' ? 'adaptive' : 'shadow';
            await saveConcursosMetadata(metadata);
            closeModalConfigHorarios();
            renderMonthCalendar();
            renderPomodoroDailyCounter();
            filterDataByConcurso();
            alert(`Cronograma Método 1 gerado com sucesso! Meta diária do Pomodoro: ${dailySlots}h.`);
        }

        function formatScheduledItemForDisplay(text) {
            return String(text || '')
                .replace(/^🔄\s*/, '')
                .replace(/^Rev\s*\(/, 'Revisão (')
                .trim();
        }

        function openModalDayContent(dateKey) {
            activeSelectedDateKey = dateKey;
            const [year, month, day] = dateKey.split('-').map(Number);
            const dateObj = new Date(year, month - 1, day);
            const formattedDate = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
            const metadata = getConcursosMetadata();
            const topics = metadata[currentConcurso]?.dateSchedule?.[dateKey] || [];
            const revisions = topics.filter(item => item.startsWith('🔄 Rev')).length;
            document.getElementById('dayModalTitle').innerText = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
            const summary = document.getElementById('dayModalSummary');
            if (summary) summary.textContent = `${topics.length} ${topics.length === 1 ? 'item agendado' : 'itens agendados'}${revisions ? ` • ${revisions} ${revisions === 1 ? 'revisão' : 'revisões'}` : ''}`;
            resetAddTopicArea();
            renderDayTopicsList();
            document.getElementById('modalDayContent').style.display = 'flex';
        }

        function closeModalDayContent() { document.getElementById('modalDayContent').style.display = 'none'; }

        function formatDateKeyShort(dateKey) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return String(dateKey || '');
            const [year, month, day] = String(dateKey).split('-');
            return `${day}/${month}`;
        }

        function isRevisionScheduleText(text) {
            return String(text || '').startsWith('🔄 Rev');
        }

        function getScheduleRevisionStrategy(contestMeta = null) {
            const contest = contestMeta || getConcursosMetadata()[currentConcurso] || {};
            return contest?.scheduleConfig?.revisionStrategy || 'revisao24730';
        }

        function getActiveRevisionOffsets(contestMeta = null) {
            const key = getScheduleRevisionStrategy(contestMeta);
            return [...(STRATEGIES_MAP[key] || [])];
        }

        function getAdaptiveRevisionCompletion(item, offset, contestMeta = null) {
            const normalizedOffset = Number(offset);
            if (!item || !Number.isFinite(normalizedOffset)) return false;
            const contest = contestMeta || getConcursosMetadata()[currentConcurso] || {};
            const saved = contest?.adaptiveRevisionProgress?.[String(item.id)]?.[String(normalizedOffset)];
            if (typeof saved === 'boolean') return saved;
            if (normalizedOffset === 1) return !!item.rev_24h;
            if (normalizedOffset === 7) return !!item.rev_7d;
            if (normalizedOffset === 30) return !!item.rev_30d;
            return false;
        }

        function hasAnyAdaptiveRevisionCompletion(item, contestMeta = null) {
            if (!item) return false;
            const contest = contestMeta || getConcursosMetadata()[currentConcurso] || {};
            const saved = contest?.adaptiveRevisionProgress?.[String(item.id)] || {};
            return !!(item.rev_24h || item.rev_7d || item.rev_30d || Object.values(saved).some(Boolean));
        }

        async function toggleAdaptiveRevision(id, offset, currentValue) {
            const item = allEditalItems.find(i => String(i.id) === String(id));
            if (!item) return;
            const metadata = getConcursosMetadata();
            const contest = metadata[currentConcurso] || (metadata[currentConcurso] = {});
            if (!contest.adaptiveRevisionProgress) contest.adaptiveRevisionProgress = {};
            const itemKey = String(item.id);
            if (!contest.adaptiveRevisionProgress[itemKey]) contest.adaptiveRevisionProgress[itemKey] = {};
            const next = !currentValue;
            contest.adaptiveRevisionProgress[itemKey][String(Number(offset))] = next;
            if (Number(offset) === 1) item.rev_24h = next;
            if (Number(offset) === 7) item.rev_7d = next;
            if (Number(offset) === 30) item.rev_30d = next;
            await Promise.all([saveConcursosMetadata(metadata), saveEditalItemToCloud(item)]);
            filterDataByConcurso();
            renderMonthCalendar();
        }

        function renderAdaptiveEditalHeader() {
            const row = document.getElementById('editalTableHeaderRow');
            if (!row) return;
            const offsets = getActiveRevisionOffsets();
            const revisionHeaders = offsets.map(offset => `<th>Rev. ${offset}d</th>`).join('');
            row.innerHTML = `<th style="width:90px;">Prioridade</th><th style="text-align:left;padding-left:1rem;">Assunto</th><th>Teoria</th><th>Questões</th>${revisionHeaders}<th>Ações</th>`;
        }

        function removeTopicRevisionsFromSchedule(dateSchedule, topicText) {
            Object.keys(dateSchedule || {}).forEach(dateKey => {
                if (!Array.isArray(dateSchedule[dateKey])) return;
                dateSchedule[dateKey] = dateSchedule[dateKey].filter(item => {
                    const raw = String(item || '');
                    return !(raw.startsWith('🔄 Rev') && normalizeScheduledTopicForStudy(raw) === topicText);
                });
                if (!dateSchedule[dateKey].length) delete dateSchedule[dateKey];
            });
        }

        function insertNormalTopicBeforeRevisions(dateSchedule, dateKey, topicText) {
            if (!dateSchedule[dateKey]) dateSchedule[dateKey] = [];
            if (dateSchedule[dateKey].some(item => normalizeScheduledTopicForStudy(item) === topicText && !isRevisionScheduleText(item))) return;
            const firstRevision = dateSchedule[dateKey].findIndex(item => isRevisionScheduleText(item));
            if (firstRevision === -1) dateSchedule[dateKey].push(topicText);
            else dateSchedule[dateKey].splice(firstRevision, 0, topicText);
        }

        function reanchorTopicRevisions(dateSchedule, topicText, dateKey, contestMeta = null) {
            removeTopicRevisionsFromSchedule(dateSchedule, topicText);
            const strategy = getScheduleRevisionStrategy(contestMeta);
            const baseDate = new Date(`${dateKey}T00:00:00`);
            if (!Number.isNaN(baseDate.getTime())) applySpacedRevisions(dateSchedule, baseDate, topicText, strategy);
        }

        function findNormalTopicLocation(dateSchedule, topicText, preferredDateKey = null) {
            const keys = Object.keys(dateSchedule || {}).sort();
            if (preferredDateKey && dateSchedule[preferredDateKey]) {
                const idx = dateSchedule[preferredDateKey].findIndex(item => !isRevisionScheduleText(item) && normalizeScheduledTopicForStudy(item) === topicText);
                if (idx !== -1) return { dateKey: preferredDateKey, index: idx };
            }
            for (const dateKey of keys) {
                const items = dateSchedule[dateKey];
                if (!Array.isArray(items)) continue;
                const idx = items.findIndex(item => !isRevisionScheduleText(item) && normalizeScheduledTopicForStudy(item) === topicText);
                if (idx !== -1) return { dateKey, index: idx };
            }
            return null;
        }

        function findNextMovableFutureTopic(dateSchedule, afterDateKey, editalLookup, excludedTopic = '') {
            const futureKeys = Object.keys(dateSchedule || {}).filter(key => key > afterDateKey).sort();
            for (const dateKey of futureKeys) {
                const items = dateSchedule[dateKey];
                if (!Array.isArray(items)) continue;
                for (let index = 0; index < items.length; index++) {
                    const raw = items[index];
                    if (isRevisionScheduleText(raw)) continue;
                    const topicText = normalizeScheduledTopicForStudy(raw);
                    if (!topicText || topicText === excludedTopic) continue;
                    const state = getScheduledItemStudyState(raw, editalLookup);
                    const started = !!(state.matchedItem && (state.matchedItem.teoria || state.matchedItem.questoes));
                    if (!state.done && !started) return { dateKey, index, topicText };
                }
            }
            return null;
        }

        function ensureStudyPlanHistory(contestMeta) {
            if (!Array.isArray(contestMeta.studyPlanHistory)) contestMeta.studyPlanHistory = [];
            return contestMeta.studyPlanHistory;
        }

        function getLatestAdvanceHistory(topicText, currentDateKey = null) {
            const contest = getConcursosMetadata()[currentConcurso] || {};
            const history = Array.isArray(contest.studyPlanHistory) ? contest.studyPlanHistory : [];
            for (let i = history.length - 1; i >= 0; i--) {
                const entry = history[i];
                if (!['advance','manual_advance'].includes(entry?.type) || entry?.topic !== topicText) continue;
                if (currentDateKey && entry?.actualDateKey !== currentDateKey) continue;
                return entry;
            }
            return null;
        }

        function getNextAdaptiveStudySuggestion() {
            const metadata = getConcursosMetadata();
            const contest = metadata[currentConcurso] || {};
            const dateSchedule = contest.dateSchedule || {};
            const todayKey = getLocalDateKey();
            const editalLookup = new Map(editalItems.map(item => [`${item.materia} - ${item.assunto}`, item]));
            const next = findNextMovableFutureTopic(dateSchedule, todayKey, editalLookup);
            if (!next) return null;
            const item = editalLookup.get(next.topicText);
            const activityType = item?.teoria ? 'questoes' : 'teoria';
            return { ...next, item, activityType };
        }

        function renderAdaptiveStudySuggestion(container) {
            if (!container || activeSelectedDateKey !== getLocalDateKey()) return;
            const suggestion = getNextAdaptiveStudySuggestion();
            if (!suggestion) return;
            const currentItems = getConcursosMetadata()[currentConcurso]?.dateSchedule?.[activeSelectedDateKey] || [];
            const normalItems = currentItems.filter(item => !isRevisionScheduleText(item));
            const editalLookup = new Map(editalItems.map(item => [`${item.materia} - ${item.assunto}`, item]));
            const allCurrentDone = normalItems.length === 0 || normalItems.every(item => getScheduledItemStudyState(item, editalLookup).done);
            if (!allCurrentDone) return;
            container.insertAdjacentHTML('beforeend', `
                <div class="edit-selector-box" style="margin-top:12px; border-color:rgba(56,189,248,.35);">
                    <div style="display:flex; gap:12px; align-items:center; justify-content:space-between; flex-wrap:wrap;">
                        <div style="min-width:220px; flex:1;">
                            <strong style="color:var(--modern-blue-2);">Próximo estudo sugerido</strong>
                            <div style="margin-top:4px; font-size:.88rem; opacity:.88;">${escapeHtml(suggestion.topicText)} · planejado para ${formatDateKeyShort(suggestion.dateKey)}</div>
                            <div style="margin-top:3px; font-size:.76rem; opacity:.65;">Ao concluir, o tópico será antecipado e apenas a fila futura será ajustada. A meta diária permanece inalterada.</div>
                        </div>
                        <button class="btn btn-primary btn-sm" onclick="startAdaptiveSuggestedStudy()">Adiantar próximo estudo</button>
                    </div>
                </div>
            `);
        }

        async function applyAdaptiveScheduleAdvance(metadata, context) {
            if (!context?.adaptiveAdvance || !context?.plannedDateKey) return null;
            const contest = metadata[currentConcurso];
            if (!contest) return null;
            const actualDateKey = getLocalDateKey();
            const plannedDateKey = context.plannedDateKey;
            if (!(plannedDateKey > actualDateKey)) return null;

            const dateSchedule = contest.dateSchedule || (contest.dateSchedule = {});
            const topicText = getStudyTopicKey(context.materia, context.assunto);
            const originalLocation = findNormalTopicLocation(dateSchedule, topicText, plannedDateKey);
            if (!originalLocation || originalLocation.dateKey <= actualDateKey) return null;

            const editalLookup = new Map(editalItems.map(item => [`${item.materia} - ${item.assunto}`, item]));
            dateSchedule[originalLocation.dateKey].splice(originalLocation.index, 1);
            if (!dateSchedule[originalLocation.dateKey].length) delete dateSchedule[originalLocation.dateKey];
            insertNormalTopicBeforeRevisions(dateSchedule, actualDateKey, topicText);
            reanchorTopicRevisions(dateSchedule, topicText, actualDateKey, contest);

            const reflowMoves = [];
            let vacancyDateKey = originalLocation.dateKey;
            let safety = 0;
            while (safety++ < 2000) {
                const next = findNextMovableFutureTopic(dateSchedule, vacancyDateKey, editalLookup, topicText);
                if (!next) break;
                const sourceItems = dateSchedule[next.dateKey];
                const currentIndex = sourceItems.findIndex(item => !isRevisionScheduleText(item) && normalizeScheduledTopicForStudy(item) === next.topicText);
                if (currentIndex === -1) break;
                sourceItems.splice(currentIndex, 1);
                if (!sourceItems.length) delete dateSchedule[next.dateKey];
                insertNormalTopicBeforeRevisions(dateSchedule, vacancyDateKey, next.topicText);
                reanchorTopicRevisions(dateSchedule, next.topicText, vacancyDateKey, contest);
                reflowMoves.push({ topic: next.topicText, fromDateKey: next.dateKey, toDateKey: vacancyDateKey });
                vacancyDateKey = next.dateKey;
            }

            const history = ensureStudyPlanHistory(contest);
            history.push({
                type: 'advance',
                topic: topicText,
                materia: context.materia,
                assunto: context.assunto,
                plannedDateKey,
                actualDateKey,
                reflowMoves,
                createdAt: new Date().toISOString()
            });
            if (history.length > 500) contest.studyPlanHistory = history.slice(-500);
            context.dateKey = actualDateKey;
            context.scheduledDateKey = actualDateKey;
            return { topicText, plannedDateKey, actualDateKey, reflowMoves };
        }

        function startAdaptiveSuggestedStudy() {
            const suggestion = getNextAdaptiveStudySuggestion();
            if (!suggestion?.item) return alert('Não há próximo tópico pendente para antecipar.');
            activeSelectedDateKey = suggestion.dateKey;
            const items = getConcursosMetadata()[currentConcurso]?.dateSchedule?.[suggestion.dateKey] || [];
            const idx = items.findIndex(item => !isRevisionScheduleText(item) && normalizeScheduledTopicForStudy(item) === suggestion.topicText);
            if (idx === -1) return alert('O tópico sugerido não está mais disponível no cronograma.');
            startScheduledTopicStudy(idx, suggestion.activityType, true);
        }

        function getTopicStudyPlanStore(contestMeta, create = false) {
            if (!contestMeta) return null;
            if (!contestMeta.topicStudyPlans && create) contestMeta.topicStudyPlans = {};
            return contestMeta.topicStudyPlans || null;
        }

        function getTopicStudyPlan(item, contestMeta = null) {
            if (!item) return null;
            const contest = contestMeta || getConcursosMetadata()[currentConcurso] || {};
            const store = getTopicStudyPlanStore(contest, false);
            if (!store) return null;
            return store[String(item.id)] || store[getStudyTopicKey(item.materia, item.assunto)] || null;
        }

        function getTopicStudySessionsForPlan(item, contestMeta = null, activityType = 'teoria') {
            if (!item) return [];
            const contest = contestMeta || getConcursosMetadata()[currentConcurso] || {};
            const sessions = Array.isArray(contest.studySessions) ? contest.studySessions : [];
            const key = getStudyTopicKey(item.materia, item.assunto);
            return sessions.filter(session => getStudySessionTopicKey(session) === key && (session?.activityType || 'teoria') === activityType);
        }

        function getTopicStudyPlanProgress(item, contestMeta = null) {
            const contest = contestMeta || getConcursosMetadata()[currentConcurso] || {};
            const plan = getTopicStudyPlan(item, contest);
            if (!plan) return null;
            const mode = ['sessions','minutes','lessons'].includes(plan.mode) ? plan.mode : 'sessions';
            let current = 0;
            let target = Math.max(1, Number(plan.target) || 1);
            const theorySessions = getTopicStudySessionsForPlan(item, contest, 'teoria');
            if (mode === 'minutes') current = theorySessions.reduce((sum, session) => sum + Math.max(0, Number(session?.minutes) || 0), 0);
            else if (mode === 'lessons') current = Math.max(0, Number(plan.completedLessons) || 0);
            else current = theorySessions.length;
            const pct = Math.max(0, Math.min(100, Math.round((current / target) * 100)));
            return { plan, mode, current, target, pct, complete: current >= target };
        }

        function getTopicRecordedStudyMinutes(item, contestMeta = null) {
            if (!item) return 0;
            const contest = contestMeta || getConcursosMetadata()[currentConcurso] || {};
            const sessions = Array.isArray(contest.studySessions) ? contest.studySessions : [];
            const key = getStudyTopicKey(item.materia, item.assunto);
            return sessions.reduce((sum, session) => {
                if (getStudySessionTopicKey(session) !== key) return sum;
                return sum + Math.max(0, Number(session?.minutes) || 0);
            }, 0);
        }

        function formatTopicStudyPlanProgress(item, contestMeta = null) {
            const contest = contestMeta || getConcursosMetadata()[currentConcurso] || {};
            const progress = getTopicStudyPlanProgress(item, contest);
            if (!progress) return '';
            let label = '';
            if (progress.mode === 'minutes') label = `${Math.min(progress.current, progress.target)} / ${progress.target} min`;
            else if (progress.mode === 'lessons') label = `Aula ${Math.min(progress.current + (progress.complete ? 0 : 1), progress.target)} de ${progress.target} · ${progress.current}/${progress.target} concluídas`;
            else label = `Bloco ${Math.min(progress.current + (progress.complete ? 0 : 1), progress.target)} de ${progress.target} · ${progress.current}/${progress.target} sessões`;
            const recordedMinutes = getTopicRecordedStudyMinutes(item, contest);
            const lessonMetrics = progress.mode === 'lessons'
                ? `<span class="topic-plan-study-time" title="Soma das sessões registradas em studySessions para este assunto">Tempo estudado neste assunto: <strong>${escapeHtml(formatStudyMinutes(recordedMinutes))}</strong></span><span class="topic-plan-progress-label">Progresso das aulas: ${progress.pct}%</span>`
                : `<span class="topic-plan-progress-label">${progress.pct}%</span>`;
            return `<div class="topic-plan-summary"><span class="topic-plan-pill ${progress.complete ? 'done' : ''}">${progress.complete ? 'Teoria planejada concluída' : escapeHtml(label)}</span>${lessonMetrics}<span class="topic-plan-progress"><span style="width:${progress.pct}%"></span></span></div>`;
        }

        function getTopicStudyPlanBadgeHtml(item, contestMeta = null) {
            const progress = getTopicStudyPlanProgress(item, contestMeta);
            if (!progress) return '';
            const unit = progress.mode === 'minutes' ? 'min' : (progress.mode === 'lessons' ? 'aulas' : 'sessões');
            return `<span class="edital-topic-plan-note">Plano de Teoria: ${Math.min(progress.current, progress.target)}/${progress.target} ${unit} · ${progress.pct}%${progress.complete ? ' · concluído' : ' · em andamento'}</span>`;
        }

        function getStudyPlanDayCapacity(contestMeta, dateObj) {
            const cfg = contestMeta?.scheduleConfig || {};
            const dow = dateObj.getDay();
            const method = Number(cfg.method || contestMeta?.pomodoroScheduleMethod || 0);
            if (method === 3) return 0;
            if (method === 1) {
                if (dow === 6 && cfg.includeSaturday === false) return 0;
                if (dow === 0 && cfg.includeSunday === false) return 0;
                return Math.max(1, Number(cfg.dailySlots) || Number(contestMeta?.pomodoroDailyTargetHours) || 1);
            }
            const weekdays = Array.isArray(cfg.weekdays) && cfg.weekdays.length ? cfg.weekdays : [1,2,3,4,5];
            if (!weekdays.includes(dow)) return 0;
            if (cfg.customDailyHoursByWeekday) return Math.max(1, Math.round(Number(cfg.customDailyHoursByWeekday[dow]) || 1));
            return Math.max(1, Number(cfg.dailySlots) || Number(contestMeta?.pomodoroDailyTargetHours) || 1);
        }

        function findNextStudyPlanDate(contestMeta, afterDateKey, topicText) {
            const schedule = contestMeta.dateSchedule || (contestMeta.dateSchedule = {});
            const date = new Date(`${afterDateKey}T00:00:00`);
            for (let safety = 0; safety < 3660; safety++) {
                date.setDate(date.getDate() + 1);
                const capacity = getStudyPlanDayCapacity(contestMeta, date);
                if (!capacity) continue;
                const dateKey = getLocalDateKey(date);
                const dayItems = Array.isArray(schedule[dateKey]) ? schedule[dateKey] : [];
                if (dayItems.some(raw => !isRevisionScheduleText(raw) && normalizeScheduledTopicForStudy(raw) === topicText)) return dateKey;
                return dateKey;
            }
            return null;
        }

        function topicHasRecordedStudy(topicText, contestMeta) {
            const sessions = Array.isArray(contestMeta?.studySessions) ? contestMeta.studySessions : [];
            return sessions.some(session => getStudySessionTopicKey(session) === topicText && Math.max(0, Number(session?.minutes) || 0) > 0);
        }

        function insertStudyPlanContinuationWithReflow(contestMeta, dateKey, topicText, safety = 0) {
            if (!contestMeta || !dateKey || !topicText || safety > 500) return dateKey;
            const schedule = contestMeta.dateSchedule || (contestMeta.dateSchedule = {});
            if (!schedule[dateKey]) schedule[dateKey] = [];
            if (schedule[dateKey].some(raw => !isRevisionScheduleText(raw) && normalizeScheduledTopicForStudy(raw) === topicText)) return dateKey;
            const dateObj = new Date(`${dateKey}T00:00:00`);
            const capacity = Math.max(1, getStudyPlanDayCapacity(contestMeta, dateObj) || 1);
            const normalItems = schedule[dateKey].filter(raw => !isRevisionScheduleText(raw));
            let displaced = null;
            if (normalItems.length >= capacity) {
                for (let i = schedule[dateKey].length - 1; i >= 0; i--) {
                    const raw = schedule[dateKey][i];
                    if (isRevisionScheduleText(raw)) continue;
                    const candidate = normalizeScheduledTopicForStudy(raw);
                    if (!candidate || candidate === topicText || topicHasRecordedStudy(candidate, contestMeta)) continue;
                    displaced = candidate;
                    schedule[dateKey].splice(i, 1);
                    break;
                }
            }
            insertNormalTopicBeforeRevisions(schedule, dateKey, topicText);
            if (displaced) {
                const nextDate = findNextStudyPlanDate(contestMeta, dateKey, displaced);
                if (nextDate && nextDate !== dateKey) {
                    reanchorTopicRevisions(schedule, displaced, nextDate, contestMeta);
                    insertStudyPlanContinuationWithReflow(contestMeta, nextDate, displaced, safety + 1);
                }
            }
            return dateKey;
        }

        function removeFutureNormalTopicOccurrences(dateSchedule, topicText, afterDateKey) {
            Object.keys(dateSchedule || {}).forEach(dateKey => {
                if (dateKey <= afterDateKey || !Array.isArray(dateSchedule[dateKey])) return;
                dateSchedule[dateKey] = dateSchedule[dateKey].filter(raw => isRevisionScheduleText(raw) || normalizeScheduledTopicForStudy(raw) !== topicText);
                if (!dateSchedule[dateKey].length) delete dateSchedule[dateKey];
            });
        }

        function ensureTopicStudyPlanContinuation(contestMeta, item, afterDateKey) {
            if (!contestMeta || !item) return null;
            const progress = getTopicStudyPlanProgress(item, contestMeta);
            if (!progress || progress.complete) return null;
            const topicText = getStudyTopicKey(item.materia, item.assunto);
            const schedule = contestMeta.dateSchedule || (contestMeta.dateSchedule = {});
            const existing = Object.keys(schedule).sort().find(dateKey => dateKey > afterDateKey && (schedule[dateKey] || []).some(raw => !isRevisionScheduleText(raw) && normalizeScheduledTopicForStudy(raw) === topicText));
            if (existing) return existing;
            const nextDate = findNextStudyPlanDate(contestMeta, afterDateKey, topicText);
            if (!nextDate) return null;
            insertStudyPlanContinuationWithReflow(contestMeta, nextDate, topicText);
            return nextDate;
        }

        function reconcileTopicStudyPlanAfterSession(metadata, context) {
            if (!context || context.activityType !== 'teoria' || !metadata?.[currentConcurso]) return null;
            const contest = metadata[currentConcurso];
            const item = allEditalItems.find(candidate => {
                if ((candidate.concurso || 'Concurso Geral') !== currentConcurso) return false;
                if (context.itemId && String(candidate.id) === String(context.itemId)) return true;
                return getStudyTopicKey(candidate.materia, candidate.assunto) === getStudyTopicKey(context.materia, context.assunto);
            });
            if (!item) return null;
            const progress = getTopicStudyPlanProgress(item, contest);
            if (!progress) return null;
            const todayKey = getLocalDateKey();
            const topicText = getStudyTopicKey(item.materia, item.assunto);
            if (progress.complete) {
                removeFutureNormalTopicOccurrences(contest.dateSchedule || {}, topicText, todayKey);
                reanchorTopicRevisions(contest.dateSchedule || (contest.dateSchedule = {}), topicText, todayKey, contest);
                return { ...progress, continuationDate:null };
            }
            removeTopicRevisionsFromSchedule(contest.dateSchedule || (contest.dateSchedule = {}), topicText);
            if (isFlexibleOpportunityMode(contest)) return { ...progress, continuationDate:null, flexiblePending:true };
            const continuationDate = ensureTopicStudyPlanContinuation(contest, item, todayKey);
            return { ...progress, continuationDate };
        }

        function showStudyPlanEditor(idx) {
            const editArea = document.getElementById(`editArea_${idx}`);
            if (!editArea) return;
            const metadata = getConcursosMetadata();
            const raw = metadata[currentConcurso]?.dateSchedule?.[activeSelectedDateKey]?.[idx];
            const clean = normalizeScheduledTopicForStudy(raw);
            const item = editalItems.find(i => getStudyTopicKey(i.materia, i.assunto) === clean);
            if (!item) return alert('Este item não está vinculado ao edital verticalizado.');
            const plan = getTopicStudyPlan(item, metadata[currentConcurso] || {}) || { mode:'sessions', target:6, sessionMinutes:Math.max(1, parseInt(document.getElementById('focoMin')?.value || '40') || 40), completedLessons:0 };
            editArea.style.display = 'block';
            editArea.innerHTML = `
                <div class="edit-selector-box">
                    <strong style="color:var(--modern-blue-2);">Planejar assunto longo</strong>
                    <div class="topic-plan-editor-help">O assunto continua sendo uma única linha do edital. O plano controla somente quantas sessões, minutos ou aulas de Teoria serão necessários antes de marcar a Teoria como concluída.</div>
                    <div class="topic-plan-editor-grid">
                        <label>Modo
                            <select id="studyPlanMode_${idx}" onchange="updateStudyPlanEditorFields(${idx})">
                                <option value="sessions" ${plan.mode === 'sessions' ? 'selected' : ''}>Sessões / blocos</option>
                                <option value="minutes" ${plan.mode === 'minutes' ? 'selected' : ''}>Carga em minutos</option>
                                <option value="lessons" ${plan.mode === 'lessons' ? 'selected' : ''}>Número de aulas</option>
                            </select>
                        </label>
                        <label id="studyPlanTargetLabel_${idx}">Quantidade
                            <input id="studyPlanTarget_${idx}" type="number" min="1" max="999" value="${Math.max(1, Number(plan.target) || 1)}">
                        </label>
                        <label>Sessão padrão (min)
                            <input id="studyPlanSession_${idx}" type="number" min="1" max="240" value="${Math.max(1, Number(plan.sessionMinutes) || 40)}">
                        </label>
                    </div>
                    <div id="studyPlanLessonStatus_${idx}" class="topic-plan-editor-help"></div>
                    <div style="display:flex; justify-content:flex-end; gap:7px; flex-wrap:wrap;">
                        ${getTopicStudyPlan(item, metadata[currentConcurso] || {}) ? `<button class="btn btn-danger btn-sm" onclick="removeTopicStudyPlan(${idx})">Remover plano</button>` : ''}
                        <button class="btn btn-secondary btn-sm" onclick="renderDayTopicsList()">Cancelar</button>
                        <button class="btn btn-success btn-sm" onclick="saveTopicStudyPlan(${idx})">Salvar plano</button>
                    </div>
                </div>`;
            updateStudyPlanEditorFields(idx);
        }

        function updateStudyPlanEditorFields(idx) {
            const mode = document.getElementById(`studyPlanMode_${idx}`)?.value || 'sessions';
            const label = document.getElementById(`studyPlanTargetLabel_${idx}`);
            const status = document.getElementById(`studyPlanLessonStatus_${idx}`);
            if (label) label.firstChild.textContent = mode === 'minutes' ? 'Carga total de Teoria (min) ' : (mode === 'lessons' ? 'Número de aulas ' : 'Número de sessões ');
            if (status) status.textContent = mode === 'lessons' ? 'No modo Aulas, o tempo continua sendo registrado pelo Pomodoro. Use “Aula concluída” no cartão diário apenas quando terminar uma aula inteira.' : 'O progresso é calculado automaticamente a partir das sessões de Teoria registradas no Pomodoro.';
        }

        async function saveTopicStudyPlan(idx) {
            const metadata = getConcursosMetadata();
            const contest = metadata[currentConcurso] || (metadata[currentConcurso] = {});
            const raw = contest.dateSchedule?.[activeSelectedDateKey]?.[idx];
            const clean = normalizeScheduledTopicForStudy(raw);
            const item = allEditalItems.find(i => (i.concurso || 'Concurso Geral') === currentConcurso && getStudyTopicKey(i.materia, i.assunto) === clean);
            if (!item) return alert('Este item não está vinculado ao edital verticalizado.');
            const mode = document.getElementById(`studyPlanMode_${idx}`)?.value || 'sessions';
            const target = Math.max(1, Math.min(999, parseInt(document.getElementById(`studyPlanTarget_${idx}`)?.value || '1') || 1));
            const sessionMinutes = Math.max(1, Math.min(240, parseInt(document.getElementById(`studyPlanSession_${idx}`)?.value || '40') || 40));
            const store = getTopicStudyPlanStore(contest, true);
            const previous = store[String(item.id)] || {};
            store[String(item.id)] = {
                mode,
                target,
                sessionMinutes,
                completedLessons: mode === 'lessons' ? Math.max(0, Number(previous.completedLessons) || 0) : 0,
                createdAt: previous.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            const progress = getTopicStudyPlanProgress(item, contest);
            const nextTheory = !!progress?.complete;
            const theoryChanged = !!item.teoria !== nextTheory;
            item.teoria = nextTheory;
            const topicText = getStudyTopicKey(item.materia, item.assunto);
            if (nextTheory) {
                removeFutureNormalTopicOccurrences(contest.dateSchedule || {}, topicText, getLocalDateKey());
                reanchorTopicRevisions(contest.dateSchedule || (contest.dateSchedule = {}), topicText, getLocalDateKey(), contest);
            } else {
                removeTopicRevisionsFromSchedule(contest.dateSchedule || (contest.dateSchedule = {}), topicText);
                ensureTopicStudyPlanContinuation(contest, item, activeSelectedDateKey || getLocalDateKey());
            }
            await saveConcursosMetadata(metadata);
            if (theoryChanged) await saveEditalItemToCloud(item);
            filterDataByConcurso();
            renderDayTopicsList();
            renderMonthCalendar();
        }

        async function removeTopicStudyPlan(idx) {
            const metadata = getConcursosMetadata();
            const contest = metadata[currentConcurso] || {};
            const raw = contest.dateSchedule?.[activeSelectedDateKey]?.[idx];
            const clean = normalizeScheduledTopicForStudy(raw);
            const item = allEditalItems.find(i => (i.concurso || 'Concurso Geral') === currentConcurso && getStudyTopicKey(i.materia, i.assunto) === clean);
            if (!item) return;
            const ok = await appConfirm('Remover o planejamento em blocos deste assunto? O histórico de sessões será preservado.', { title:'Remover plano do assunto', confirmText:'Remover', confirmClass:'btn-danger' });
            if (!ok) return;
            const store = getTopicStudyPlanStore(contest, false);
            if (store) delete store[String(item.id)];
            await saveConcursosMetadata(metadata);
            renderDayTopicsList();
            filterDataByConcurso();
        }

        async function completeTopicStudyLesson(idx) {
            const metadata = getConcursosMetadata();
            const contest = metadata[currentConcurso] || {};
            const raw = contest.dateSchedule?.[activeSelectedDateKey]?.[idx];
            const clean = normalizeScheduledTopicForStudy(raw);
            const item = allEditalItems.find(i => (i.concurso || 'Concurso Geral') === currentConcurso && getStudyTopicKey(i.materia, i.assunto) === clean);
            if (!item) return;
            const plan = getTopicStudyPlan(item, contest);
            if (!plan || plan.mode !== 'lessons') return;
            plan.completedLessons = Math.min(Math.max(1, Number(plan.target) || 1), Math.max(0, Number(plan.completedLessons) || 0) + 1);
            plan.updatedAt = new Date().toISOString();
            const progress = getTopicStudyPlanProgress(item, contest);
            const previousTheory = !!item.teoria;
            item.teoria = !!progress?.complete;
            const topicText = getStudyTopicKey(item.materia, item.assunto);
            if (progress?.complete) {
                removeFutureNormalTopicOccurrences(contest.dateSchedule || {}, topicText, getLocalDateKey());
                reanchorTopicRevisions(contest.dateSchedule || (contest.dateSchedule = {}), topicText, getLocalDateKey(), contest);
            } else {
                removeTopicRevisionsFromSchedule(contest.dateSchedule || (contest.dateSchedule = {}), topicText);
                ensureTopicStudyPlanContinuation(contest, item, getLocalDateKey());
            }
            await saveConcursosMetadata(metadata);
            if (previousTheory !== item.teoria) await saveEditalItemToCloud(item);
            filterDataByConcurso();
            renderDayTopicsList();
            renderMonthCalendar();
        }

        function renderDayTopicsList() {
            const container = document.getElementById('dayTopicsContainer');
            if (!container || !activeSelectedDateKey) return;
            container.innerHTML = '';

            const metadata = getConcursosMetadata();
            const dateSchedule = metadata[currentConcurso]?.dateSchedule || {};
            const topics = dateSchedule[activeSelectedDateKey] || [];

            if (topics.length === 0) {
                container.innerHTML = `<p style="opacity:0.85; padding:1rem;">Nenhum tópico agendado para este dia.</p>`;
                renderAdaptiveStudySuggestion(container);
                return;
            }

            topics.forEach((topicoStr, idx) => {
                const cleanTop = normalizeScheduledTopicForStudy(topicoStr);
                const matchedItem = editalItems.find(i => `${i.materia} - ${i.assunto}` === cleanTop);
                const safeMatchedId = matchedItem ? encodeHandlerValue(matchedItem.id) : '';
                const advanceHistory = !isRevisionScheduleText(topicoStr) ? getLatestAdvanceHistory(cleanTop, activeSelectedDateKey) : null;
                const advanceBadge = advanceHistory ? `<span style="display:inline-flex; margin-left:8px; padding:2px 7px; border-radius:999px; font-size:.68rem; color:#7dd3fc; border:1px solid rgba(56,189,248,.3); background:rgba(14,165,233,.08);">Antecipado de ${formatDateKeyShort(advanceHistory.plannedDateKey)}</span>` : '';
                const futureStudyHint = activeSelectedDateKey > getLocalDateKey() && matchedItem && !isRevisionScheduleText(topicoStr) ? `<span style="display:block; margin-top:3px; font-size:.68rem; opacity:.58;">Estudar agora pode antecipar este tópico com reflow do futuro.</span>` : '';
                const studyPlanSummary = matchedItem && !isRevisionScheduleText(topicoStr) ? formatTopicStudyPlanProgress(matchedItem, metadata[currentConcurso] || {}) : '';
                const studyPlan = matchedItem ? getTopicStudyPlan(matchedItem, metadata[currentConcurso] || {}) : null;
                const adaptiveReviewDone = isAdaptiveRetentionReviewText(topicoStr) && getAdaptiveRetentionReviewCompletion(metadata[currentConcurso] || {}, activeSelectedDateKey, cleanTop);
                const adaptiveReviewBadge = adaptiveReviewDone ? `<span style="display:inline-flex;margin-left:8px;padding:2px 7px;border-radius:999px;font-size:.68rem;color:#86efac;border:1px solid rgba(34,197,94,.35);background:rgba(34,197,94,.08);">Revisada</span>` : '';
                container.innerHTML += `
                    <div class="day-topic-row" id="topicRow_${idx}">
                        <div style="flex:1;"><strong style="color:var(--primary-blue); font-size:0.95rem;">${escapeHtml(formatScheduledItemForDisplay(topicoStr))}</strong>${adaptiveReviewBadge}${advanceBadge}${futureStudyHint}${studyPlanSummary}</div>
                        <div class="day-topic-controls-row">
                            ${matchedItem ? `
                                <div class="day-topic-status-inline">
                                    <label>
                                        <input type="checkbox" ${matchedItem.teoria ? 'checked' : ''} onchange="toggleCheckFromModal(decodeURIComponent('${safeMatchedId}'), 'teoria', ${matchedItem.teoria})"> Teoria
                                    </label>
                                    <label>
                                        <input type="checkbox" ${matchedItem.questoes ? 'checked' : ''} onchange="toggleCheckFromModal(decodeURIComponent('${safeMatchedId}'), 'questoes', ${matchedItem.questoes})"> Questões
                                    </label>
                                    ${!adaptiveReviewDone ? `<span class="study-session-delete-group"><label class="study-session-minutes-label" title="Duração da próxima sessão de foco"><span>Sessão</span><span class="study-minutes-field"><input class="study-minutes-input" id="studyMinutes_${idx}" type="number" min="1" max="240" value="${Math.max(1, parseInt(studyPlan?.sessionMinutes || document.getElementById('focoMin')?.value || '40'))}"><span>min</span></span></label><button class="btn btn-danger btn-sm btn-topic-delete-inline" onclick="deleteTopicFromDay(${idx})" title="Apaga este tópico do dia">Apagar</button></span>` : `<button class="btn btn-danger btn-sm btn-topic-delete-inline" onclick="deleteTopicFromDay(${idx})" title="Apaga este tópico do dia">Apagar</button>`}
                                </div>
                            ` : ''}
                            ${matchedItem && !adaptiveReviewDone ? `<div class="study-launch-controls">
                                <button class="btn btn-sm btn-study-theory" onclick="startScheduledTopicStudy(${idx}, 'teoria')" title="Inicia uma sessão de Teoria e contabiliza o tempo em studySessions">Estudar Teoria</button>
                                <button class="btn btn-sm btn-study-questions" onclick="startScheduledTopicStudy(${idx}, 'questoes')" title="Inicia uma sessão de Questões e contabiliza o tempo em studySessions">Estudar Questões</button>
                                <button class="btn btn-sm btn-secondary btn-register-question-result" onclick="openManualQuestionPerformanceForScheduledTopic(${idx})" title="Registra desempenho de questões feitas fora do timer, sem adicionar minutos">Registrar questões externas</button>
                                ${matchedItem && !isRevisionScheduleText(topicoStr) ? `<button class="btn btn-info btn-sm" onclick="showStudyPlanEditor(${idx})">Planejar</button>` : ''}
                                <button class="btn btn-secondary btn-sm" onclick="showEditTopicDropdown(${idx})">Editar</button>
                                ${isLegalStudyMateria(matchedItem.materia) ? `<button class="btn btn-sm btn-study-legal" onclick="openLegalReadingForScheduledTopic(${idx})">Lei Seca</button>` : ''}
                            </div>` : ''}
                            ${studyPlan?.mode === 'lessons' && !getTopicStudyPlanProgress(matchedItem, metadata[currentConcurso] || {})?.complete ? `<div class="day-topic-inline-actions lesson-only-action"><button class="btn btn-success btn-sm" onclick="completeTopicStudyLesson(${idx})" title="Marca uma aula inteira como concluída. Este botão não adiciona minutos.">✓ Concluir esta aula</button></div>` : ''}
                            ${!matchedItem ? `<div class="day-topic-inline-actions fallback-topic-actions"><button class="btn btn-secondary btn-sm" onclick="showEditTopicDropdown(${idx})">Editar</button><button class="btn btn-danger btn-sm" onclick="deleteTopicFromDay(${idx})">Apagar</button></div>` : (adaptiveReviewDone ? `<div class="day-topic-inline-actions fallback-topic-actions"><button class="btn btn-secondary btn-sm" onclick="showEditTopicDropdown(${idx})">Editar</button></div>` : '')}
                        </div>
                        <div id="editArea_${idx}" style="width:100%; display:none;"></div>
                    </div>
                `;
            });
            renderAdaptiveStudySuggestion(container);
        }

        function getUniqueMateriasFromEdital() {
            const set = new Set();
            editalItems.forEach(i => { if (i.materia) set.add(i.materia); });
            return Array.from(set);
        }

        function getAssuntosForMateria(matName) {
            return editalItems.filter(i => i.materia === matName).map(i => i.assunto);
        }

        function showEditTopicDropdown(idx) {
            const editArea = document.getElementById(`editArea_${idx}`);
            if (!editArea) return;
            const materias = getUniqueMateriasFromEdital();
            if (materias.length === 0) return alert('O edital atual não possui matérias para selecionar.');
            let matOptions = materias.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');

            editArea.innerHTML = `
                <div class="edit-selector-box">
                    <label style="font-size:0.82rem; font-weight:700; color:#93c5fd;">Selecione a Matéria e o Assunto do Edital:</label>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <select id="editMatSel_${idx}" onchange="updateEditAssuntoDropdown(${idx})" style="flex:1; min-width:160px;">${matOptions}</select>
                        <select id="editAssSel_${idx}" style="flex:1; min-width:180px;"></select>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:4px;">
                        <button class="btn btn-secondary btn-sm" onclick="renderDayTopicsList()">Cancelar</button>
                        <button class="btn btn-info btn-sm" onclick="addManualTopicToDay(${idx})">Inserir Manualmente</button>
                        <button class="btn btn-success btn-sm" onclick="confirmEditTopicWithSwap(${idx})">Salvar / Trocar Assunto</button>
                    </div>
                </div>
            `;
            editArea.style.display = 'block';
            updateEditAssuntoDropdown(idx);
        }

        async function addManualTopicToDay(targetIdx) {
            const matSel = document.getElementById(`editMatSel_${targetIdx}`);
            const selectedMat = matSel ? matSel.value : '';
            const novoAssunto = prompt(`Digite o novo assunto para a matéria "${selectedMat}":`);
            if (!novoAssunto || !novoAssunto.trim()) return;

            const newFullString = `${selectedMat} - ${novoAssunto.trim()}`;
            let metadata = getConcursosMetadata();
            if (!metadata[currentConcurso]) metadata[currentConcurso] = {};
            if (!metadata[currentConcurso].dateSchedule) metadata[currentConcurso].dateSchedule = {};

            metadata[currentConcurso].dateSchedule[activeSelectedDateKey][targetIdx] = newFullString;
            await saveConcursosMetadata(metadata);
            renderDayTopicsList();
            renderMonthCalendar();
        }

        function updateEditAssuntoDropdown(idx) {
            const matSel = document.getElementById(`editMatSel_${idx}`);
            const assSel = document.getElementById(`editAssSel_${idx}`);
            if (!matSel || !assSel) return;
            const selectedMat = matSel.value;
            const assuntos = getAssuntosForMateria(selectedMat);
            assSel.innerHTML = assuntos.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
        }

        async function confirmEditTopicWithSwap(targetIdx) {
            const matSel = document.getElementById(`editMatSel_${targetIdx}`);
            const assSel = document.getElementById(`editAssSel_${targetIdx}`);
            if (!matSel || !assSel) return;

            const newMateria = matSel.value;
            const newAssunto = assSel.value;
            const newFullString = `${newMateria} - ${newAssunto}`;

            let metadata = getConcursosMetadata();
            if (!metadata[currentConcurso]) metadata[currentConcurso] = {};
            if (!metadata[currentConcurso].dateSchedule) metadata[currentConcurso].dateSchedule = {};

            const dateSchedule = metadata[currentConcurso].dateSchedule;
            const oldFullString = dateSchedule[activeSelectedDateKey][targetIdx];

            let foundDate = null;
            let foundIndex = -1;
            Object.keys(dateSchedule).forEach(dKey => {
                const arr = dateSchedule[dKey];
                const matchIdx = arr.findIndex(item => item === newFullString || item.endsWith(`: ${newFullString}`));
                if (matchIdx !== -1) { foundDate = dKey; foundIndex = matchIdx; }
            });

            if (foundDate && (foundDate !== activeSelectedDateKey || foundIndex !== targetIdx)) {
                dateSchedule[foundDate][foundIndex] = oldFullString;
                dateSchedule[activeSelectedDateKey][targetIdx] = newFullString;
                alert(`O assunto "${newFullString}" já estava agendado em ${foundDate}. Os assuntos foram trocados entre si com sucesso!`);
            } else {
                dateSchedule[activeSelectedDateKey][targetIdx] = newFullString;
            }

            await saveConcursosMetadata(metadata);
            renderDayTopicsList();
            renderMonthCalendar();
        }

        function showAddTopicSelectors() {
            const container = document.getElementById('addNewTopicArea');
            const materias = getUniqueMateriasFromEdital();
            if (materias.length === 0) return alert('Adicione ou importe matérias no edital primeiro.');
            let matOptions = materias.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');

            container.innerHTML = `
                <div class="edit-selector-box">
                    <label style="font-size:0.85rem; font-weight:700; color:var(--primary-blue);">Adicionar Tópico a Este Dia (Selecione da Lista do Edital):</label>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <select id="addMatSel" onchange="updateAddAssuntoDropdown()" style="flex:1; min-width:160px;">${matOptions}</select>
                        <select id="addAssSel" style="flex:1; min-width:180px;"></select>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:6px;">
                        <button class="btn btn-secondary btn-sm" onclick="resetAddTopicArea()">Cancelar</button>
                        <button class="btn btn-primary btn-sm" onclick="confirmAddTopicWithSwap()">Adicionar ao Dia</button>
                    </div>
                </div>
            `;
            updateAddAssuntoDropdown();
        }

        function updateAddAssuntoDropdown() {
            const matSel = document.getElementById('addMatSel');
            const assSel = document.getElementById('addAssSel');
            if (!matSel || !assSel) return;
            const selectedMat = matSel.value;
            const assuntos = getAssuntosForMateria(selectedMat);
            assSel.innerHTML = assuntos.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
        }

        function resetAddTopicArea() {
            const container = document.getElementById('addNewTopicArea');
            container.innerHTML = `<button class="btn btn-primary btn-sm" onclick="showAddTopicSelectors()">Adicionar Novo Tópico</button>`;
        }

        async function confirmAddTopicWithSwap() {
            const matSel = document.getElementById('addMatSel');
            const assSel = document.getElementById('addAssSel');
            if (!matSel || !assSel) return;

            const newMateria = matSel.value;
            const newAssunto = assSel.value;
            const newFullString = `${newMateria} - ${newAssunto}`;

            let metadata = getConcursosMetadata();
            if (!metadata[currentConcurso]) metadata[currentConcurso] = {};
            const contest = metadata[currentConcurso];
            if (!contest.dateSchedule) contest.dateSchedule = {};
            if (!contest.dateSchedule[activeSelectedDateKey]) contest.dateSchedule[activeSelectedDateKey] = [];

            const existing = findNormalTopicLocation(contest.dateSchedule, newFullString);
            if (existing) {
                if (existing.dateKey === activeSelectedDateKey) {
                    resetAddTopicArea();
                    return alert('Este tópico já está agendado neste dia. Nenhuma duplicidade foi criada.');
                }

                if (existing.dateKey > activeSelectedDateKey) {
                    const moveIt = confirm(
                        `Este tópico já está planejado para ${formatDateKeyShort(existing.dateKey)}.\n\n` +
                        `Deseja antecipá-lo para ${formatDateKeyShort(activeSelectedDateKey)} e ajustar somente a fila posterior, sem duplicar o assunto?`
                    );
                    if (!moveIt) return;

                    const editalLookup = new Map(editalItems.map(item => [`${item.materia} - ${item.assunto}`, item]));
                    contest.dateSchedule[existing.dateKey].splice(existing.index, 1);
                    if (!contest.dateSchedule[existing.dateKey].length) delete contest.dateSchedule[existing.dateKey];
                    insertNormalTopicBeforeRevisions(contest.dateSchedule, activeSelectedDateKey, newFullString);
                    reanchorTopicRevisions(contest.dateSchedule, newFullString, activeSelectedDateKey, contest);

                    const reflowMoves = [];
                    let vacancyDateKey = existing.dateKey;
                    let safety = 0;
                    while (safety++ < 2000) {
                        const next = findNextMovableFutureTopic(contest.dateSchedule, vacancyDateKey, editalLookup, newFullString);
                        if (!next) break;
                        const sourceItems = contest.dateSchedule[next.dateKey];
                        const currentIndex = sourceItems.findIndex(item => !isRevisionScheduleText(item) && normalizeScheduledTopicForStudy(item) === next.topicText);
                        if (currentIndex === -1) break;
                        sourceItems.splice(currentIndex, 1);
                        if (!sourceItems.length) delete contest.dateSchedule[next.dateKey];
                        insertNormalTopicBeforeRevisions(contest.dateSchedule, vacancyDateKey, next.topicText);
                        reanchorTopicRevisions(contest.dateSchedule, next.topicText, vacancyDateKey, contest);
                        reflowMoves.push({ topic: next.topicText, fromDateKey: next.dateKey, toDateKey: vacancyDateKey });
                        vacancyDateKey = next.dateKey;
                    }

                    const history = ensureStudyPlanHistory(contest);
                    history.push({
                        type: 'manual_advance',
                        topic: newFullString,
                        materia: newMateria,
                        assunto: newAssunto,
                        plannedDateKey: existing.dateKey,
                        actualDateKey: activeSelectedDateKey,
                        reflowMoves,
                        createdAt: new Date().toISOString()
                    });
                    if (history.length > 500) contest.studyPlanHistory = history.slice(-500);

                    await saveConcursosMetadata(metadata);
                    resetAddTopicArea();
                    renderDayTopicsList();
                    renderMonthCalendar();
                    return;
                }

                const duplicatePast = confirm(
                    `Este tópico já aparece no cronograma em ${formatDateKeyShort(existing.dateKey)}.\n\n` +
                    'Adicionar outra ocorrência criaria duplicidade. Deseja manter o cronograma como está?'
                );
                resetAddTopicArea();
                if (!duplicatePast) renderDayTopicsList();
                return;
            }

            contest.dateSchedule[activeSelectedDateKey].push(newFullString);
            await saveConcursosMetadata(metadata);
            resetAddTopicArea();
            renderDayTopicsList();
            renderMonthCalendar();
        }

        async function toggleCheckFromModal(id, field, currentValue) {
            await toggleCheck(id, field, currentValue);
            renderDayTopicsList();
        }

        async function deleteTopicFromDay(idx) {
            if (confirm('Deseja remover este tópico do dia?')) {
                let metadata = getConcursosMetadata();
                metadata[currentConcurso].dateSchedule[activeSelectedDateKey].splice(idx, 1);
                await saveConcursosMetadata(metadata);
                renderDayTopicsList();
                renderMonthCalendar();
            }
        }

        function populateNotesMateriaDropdowns() {
            const mSel = document.getElementById('notesMateriaSelect');
            const modalSel = document.getElementById('inputNotaMateria');
            if (!mSel || !modalSel) return;
            mSel.innerHTML = ''; modalSel.innerHTML = '';

            const setMaterias = new Set();
            editalItems.forEach(i => { if (i.materia) setMaterias.add(i.materia); });
            if (setMaterias.size === 0) setMaterias.add('Geral');

            setMaterias.forEach(mat => {
                mSel.innerHTML += `<option value="${escapeHtml(mat)}">${escapeHtml(mat)}</option>`;
                modalSel.innerHTML += `<option value="${escapeHtml(mat)}">${escapeHtml(mat)}</option>`;
            });
        }

        function populateNotaAssuntoDropdown(selectedAssunto = '') {
            const materiaSel = document.getElementById('inputNotaMateria');
            const assuntoSel = document.getElementById('inputNotaAssunto');
            if (!materiaSel || !assuntoSel) return;

            const materia = materiaSel.value;
            const assuntos = [...new Set(
                editalItems
                    .filter(i => i.materia === materia && i.assunto)
                    .map(i => i.assunto.trim())
                    .filter(Boolean)
            )];

            assuntoSel.innerHTML = '';
            assuntos.forEach(assunto => {
                const opt = document.createElement('option');
                opt.value = assunto;
                opt.textContent = assunto;
                assuntoSel.appendChild(opt);
            });

            const outroOpt = document.createElement('option');
            outroOpt.value = '__outro__';
            outroOpt.textContent = 'Outro';
            assuntoSel.appendChild(outroOpt);

            if (selectedAssunto && assuntos.includes(selectedAssunto)) {
                assuntoSel.value = selectedAssunto;
            } else if (selectedAssunto === '__outro__' || assuntos.length === 0) {
                assuntoSel.value = '__outro__';
            } else {
                assuntoSel.value = assuntos[0];
            }

            handleNotaAssuntoChange();
        }

        function handleNotaAssuntoChange() {
            const assuntoSel = document.getElementById('inputNotaAssunto');
            const titleGroup = document.getElementById('notaTituloCustomGroup');
            const titleInput = document.getElementById('inputNotaTitulo');
            if (!assuntoSel || !titleGroup || !titleInput) return;

            const isOutro = assuntoSel.value === '__outro__';
            titleGroup.style.display = isOutro ? 'flex' : 'none';
            if (!isOutro) titleInput.value = '';
        }

        function loadNotesData() {
            populateNotesMateriaDropdowns();
            populateNotaAssuntoDropdown();
            renderNotesList();
        }

        function renderNotesList() {
            const container = document.getElementById('notesContainer');
            if (!container) return;
            container.innerHTML = '';

            const selectedMat = document.getElementById('notesMateriaSelect').value;
            const metadata = getConcursosMetadata();
            const notesList = metadata[currentConcurso]?.structuredNotes || [];
            const filtered = notesList.filter(n => n.materia === selectedMat);

            if (filtered.length === 0) {
                container.innerHTML = `<p style="opacity:0.8; padding:1rem;">Nenhuma anotação cadastrada para a matéria <strong>${escapeHtml(selectedMat)}</strong>.</p>`;
                return;
            }

            filtered.forEach((nota, idx) => {
                const globalIndex = notesList.indexOf(nota);
                container.innerHTML += `
                    <div class="note-card">
                        <div class="note-card-header">
                            <span class="note-card-title">${escapeHtml(nota.titulo)}</span>
                            <span class="note-card-date">Editado em ${escapeHtml(nota.data || 'Recente')}</span>
                        </div>
                        <div class="note-card-body" style="white-space:pre-wrap;">${escapeHtml(nota.conteudo)}</div>
                        <div class="note-card-actions">
                            <button class="btn btn-secondary btn-sm" onclick="editNota(${globalIndex})">Editar</button>
                            <button class="btn btn-danger btn-sm" onclick="deleteNota(${globalIndex})">Excluir</button>
                        </div>
                    </div>
                `;
            });
        }

        function openModalNovaNota() {
            currentEditingNoteIndex = null;
            document.getElementById('modalNotaTitle').innerText = 'Nova Nota';
            document.getElementById('inputNotaTitulo').value = '';
            document.getElementById('inputNotaConteudo').value = '';
            populateNotaAssuntoDropdown();
            document.getElementById('modalNovaNota').style.display = 'flex';
        }

        function closeModalNovaNota() { document.getElementById('modalNovaNota').style.display = 'none'; }

        function editNota(globalIndex) {
            const metadata = getConcursosMetadata();
            const notesList = metadata[currentConcurso]?.structuredNotes || [];
            const nota = notesList[globalIndex];
            if (!nota) return;

            currentEditingNoteIndex = globalIndex;
            document.getElementById('modalNotaTitle').innerText = `Editar Nota (${nota.materia})`;
            document.getElementById('inputNotaMateria').value = nota.materia;

            const assuntosDaMateria = editalItems
                .filter(i => i.materia === nota.materia && i.assunto)
                .map(i => i.assunto.trim());
            const assuntoSalvo = nota.assunto || '';
            const assuntoConhecido = assuntoSalvo && assuntosDaMateria.includes(assuntoSalvo);
            populateNotaAssuntoDropdown(assuntoConhecido ? assuntoSalvo : '__outro__');
            document.getElementById('inputNotaTitulo').value = assuntoConhecido ? '' : nota.titulo;
            handleNotaAssuntoChange();

            document.getElementById('inputNotaConteudo').value = nota.conteudo;
            document.getElementById('modalNovaNota').style.display = 'flex';
        }

        async function salvarNota() {
            const materia = document.getElementById('inputNotaMateria').value;
            const assuntoSelecionado = document.getElementById('inputNotaAssunto').value;
            const tituloCustom = document.getElementById('inputNotaTitulo').value.trim();
            const isOutro = assuntoSelecionado === '__outro__';
            const assunto = isOutro ? '' : assuntoSelecionado;
            const titulo = isOutro ? tituloCustom : assuntoSelecionado;
            const conteudo = document.getElementById('inputNotaConteudo').value.trim();
            if (!titulo || !conteudo) return alert(isOutro ? 'Preencha o título personalizado e o conteúdo da anotação.' : 'Preencha o conteúdo da anotação.');

            let metadata = getConcursosMetadata();
            if (!metadata[currentConcurso]) metadata[currentConcurso] = {};
            if (!metadata[currentConcurso].structuredNotes) metadata[currentConcurso].structuredNotes = [];

            const nowStr = new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            if (currentEditingNoteIndex !== null) {
                metadata[currentConcurso].structuredNotes[currentEditingNoteIndex] = { materia, assunto, titulo, conteudo, data: nowStr };
            } else {
                metadata[currentConcurso].structuredNotes.push({ materia, assunto, titulo, conteudo, data: nowStr });
            }

            await saveConcursosMetadata(metadata);
            closeModalNovaNota();
            document.getElementById('notesMateriaSelect').value = materia;
            renderNotesList();
        }

        async function deleteNota(globalIndex) {
            if (confirm('Deseja excluir esta anotação?')) {
                let metadata = getConcursosMetadata();
                if (metadata[currentConcurso]?.structuredNotes) {
                    metadata[currentConcurso].structuredNotes.splice(globalIndex, 1);
                    await saveConcursosMetadata(metadata);
                    renderNotesList();
                }
            }
        }

        function openModalConfigHorarios() {
            document.getElementById('cfgDataInicio').value = new Date().toISOString().split('T')[0];
            document.getElementById('modalConfigHorarios').style.display = 'flex';
        }
        function closeModalConfigHorarios() { document.getElementById('modalConfigHorarios').style.display = 'none'; }

        /* FLASHCARDS COM SUPABASE */
        function populateFcMateriaDropdown() {
            const mSel = document.getElementById('fcMateriaSelect');
            if (!mSel) return;
            mSel.innerHTML = '<option value="">Selecione a Matéria (Opcional)</option>';
            const setMaterias = new Set();
            editalItems.forEach(i => { if (i.materia) setMaterias.add(i.materia); });
            setMaterias.forEach(mat => { mSel.innerHTML += `<option value="${escapeHtml(mat)}">${escapeHtml(mat)}</option>`; });
            updateFcAssuntoOptions();
        }

        function updateFcAssuntoOptions() {
            const mVal = document.getElementById('fcMateriaSelect').value;
            const aSel = document.getElementById('fcAssuntoSelect');
            if (!aSel) return;
            aSel.innerHTML = '<option value="">Selecione o Assunto (Opcional)</option>';
            if (!mVal) return;
            const assuntos = editalItems.filter(i => i.materia === mVal).map(i => i.assunto);
            assuntos.forEach(ass => { aSel.innerHTML += `<option value="${escapeHtml(ass)}">${escapeHtml(ass)}</option>`; });
        }

        async function saveFlashcardsData() {
            flashcardsList.forEach(fc => {
                if (!fc.id) fc.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
            });
            let metadata = getConcursosMetadata();
            if (!metadata[currentConcurso]) metadata[currentConcurso] = {};
            metadata[currentConcurso].flashcards = flashcardsList;
            setFlashcardsDirty(true);
            await saveConcursosMetadata(metadata);
            if (navigator.onLine && currentUser) scheduleFlashcardSync();
        }

        async function loadFlashcardsData() {
            const localMetadata = getConcursosMetadata();
            const localFlashcards = localMetadata[currentConcurso]?.flashcards || [];
            if (navigator.onLine && currentUser) {
                try {
                    const syncState = getSyncState();
                    if (syncState.flashcardsDirty[currentConcurso] || syncState.flashcardDeletes.length > 0) {
                        flashcardsList = localFlashcards;
                        await flushPendingFlashcards();
                    }
                    const remainingState = getSyncState();
                    if (remainingState.flashcardsDirty[currentConcurso] || remainingState.flashcardDeletes.length > 0) {
                        flashcardsList = localFlashcards;
                        throw new Error('Há flashcards locais aguardando sincronização.');
                    }
                    const { data, error } = await runSupabaseRequest(() => supabaseClient
                        .from('flashcards')
                        .select('*')
                        .eq('user_id', currentUser.id)
                        .eq('concurso', currentConcurso));

                    if (!error && data) {
                        flashcardsList = data.map(fc => ({
                            id: fc.id,
                            materia: fc.materia,
                            assunto: fc.assunto,
                            pergunta: fc.pergunta,
                            resposta: fc.resposta
                        }));
                        const cachedMetadata = getConcursosMetadata();
                        if (!cachedMetadata[currentConcurso]) cachedMetadata[currentConcurso] = {};
                        cachedMetadata[currentConcurso].flashcards = flashcardsList;
                        localStorage.setItem(getConcursosMetadataStorageKey(), JSON.stringify(cachedMetadata));
                    } else {
                        flashcardsList = localFlashcards;
                    }
                } catch(e) {
                    flashcardsList = localFlashcards;
                }
            } else {
                flashcardsList = localFlashcards;
            }
            populateFcMateriaDropdown();
            renderFlashcardFolders();
            renderFlashcards();
        }

        async function deleteFlashcardFromCloud(id) {
            if (!id) return;
            queueFlashcardDelete(id);
            if (navigator.onLine && currentUser) scheduleFlashcardSync();
        }

        async function flushPendingFlashcards(concursoName = currentConcurso, cards = flashcardsList) {
            if (!navigator.onLine || !currentUser) return;
            const initialState = getSyncState();

            for (const deleteBatch of chunkArray([...initialState.flashcardDeletes], 100)) {
                const result = await runSupabaseRequest(() => supabaseClient.from('flashcards').delete()
                    .in('id', deleteBatch)
                    .eq('user_id', currentUser.id));
                throwIfSupabaseError(result, 'Falha ao sincronizar exclusões de flashcards');
                const latestState = getSyncState();
                const confirmedIds = new Set(deleteBatch.map(String));
                latestState.flashcardDeletes = latestState.flashcardDeletes.filter(id => !confirmedIds.has(String(id)));
                saveSyncState(latestState);
            }

            if (getSyncState().flashcardsDirty[concursoName]) {
                const originalCardsSignature = JSON.stringify(cards);
                const payloadList = cards.map(fc => {
                    if (!fc.id) fc.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
                    return {
                        id: String(fc.id),
                        user_id: currentUser.id,
                        concurso: concursoName,
                        materia: fc.materia || '',
                        assunto: fc.assunto || '',
                        pergunta: fc.pergunta,
                        resposta: fc.resposta,
                        updated_at: new Date().toISOString()
                    };
                });
                if (JSON.stringify(cards) !== originalCardsSignature) {
                    const metadataWithIds = getConcursosMetadata();
                    const savedCards = metadataWithIds[concursoName]?.flashcards || [];
                    if (JSON.stringify(savedCards) === originalCardsSignature) {
                        if (!metadataWithIds[concursoName]) metadataWithIds[concursoName] = {};
                        metadataWithIds[concursoName].flashcards = cards;
                        localStorage.setItem(getConcursosMetadataStorageKey(), JSON.stringify(metadataWithIds));
                    }
                }
                for (const payloadBatch of chunkArray(payloadList, 50)) {
                    const result = await runSupabaseRequest(() => supabaseClient.from('flashcards').upsert(payloadBatch, { onConflict: 'id' }));
                    throwIfSupabaseError(result, 'Falha ao sincronizar flashcards');
                }

                const latestMetadata = getConcursosMetadata();
                const currentCards = latestMetadata[concursoName]?.flashcards || [];
                if (JSON.stringify(currentCards) === JSON.stringify(cards)) {
                    const latestState = getSyncState();
                    delete latestState.flashcardsDirty[concursoName];
                    saveSyncState(latestState);
                }
            }
        }

        async function flushAllPendingFlashcards() {
            const metadata = getConcursosMetadata();
            const dirtyConcursos = Object.keys(getSyncState().flashcardsDirty);
            for (const concursoName of dirtyConcursos) {
                const cards = metadata[concursoName]?.flashcards || [];
                await flushPendingFlashcards(concursoName, cards);
            }
            if (getSyncState().flashcardDeletes.length > 0) {
                await flushPendingFlashcards(currentConcurso, flashcardsList);
            }
        }

        function renderFlashcardFolders() {
            const folderContainer = document.getElementById('flashcardFoldersContainer');
            if (!folderContainer) return;
            folderContainer.innerHTML = '';

            if (flashcardsList.length === 0) {
                folderContainer.innerHTML = '<p style="opacity: 0.75; font-size:0.9rem;">Nenhum baralho disponível.</p>';
                return;
            }

            const deckHierarchy = {};
            flashcardsList.forEach(fc => {
                const mat = fc.materia || 'Geral / Sem Matéria';
                const ass = fc.assunto || 'Sem Assunto Específico';
                if (!deckHierarchy[mat]) deckHierarchy[mat] = { total: 0, assuntos: {} };
                deckHierarchy[mat].total++;
                if (!deckHierarchy[mat].assuntos[ass]) deckHierarchy[mat].assuntos[ass] = 0;
                deckHierarchy[mat].assuntos[ass]++;
            });

            Object.keys(deckHierarchy).forEach(matName => {
                const matData = deckHierarchy[matName];
                const isOpen = openFcFolders[matName] === true;
                const isMatActive = (activeFcMateriaFilter === matName && !activeFcAssuntoFilter);
                const safeMatHandler = encodeHandlerValue(matName);

                let subfoldersHtml = '';
                Object.keys(matData.assuntos).forEach(assName => {
                    const count = matData.assuntos[assName];
                    const isAssActive = (activeFcMateriaFilter === matName && activeFcAssuntoFilter === assName);
                    const safeAssHandler = encodeHandlerValue(assName);
                    subfoldersHtml += `
                        <div class="anki-subfolder-item ${isAssActive ? 'active-filter' : ''}" onclick="setFlashcardViewFilter(decodeURIComponent('${safeMatHandler}'), decodeURIComponent('${safeAssHandler}'))">
                            <span style="font-size:0.9rem; font-weight:600;">${escapeHtml(assName)}</span>
                            <span style="font-size:0.8rem; opacity:0.8;">${count} cartões</span>
                        </div>
                    `;
                });

                folderContainer.innerHTML += `
                    <div class="anki-folder-card">
                        <div class="anki-folder-header" onclick="toggleFcFolder(decodeURIComponent('${safeMatHandler}'))">
                            <div class="anki-folder-title">
                                <span>${escapeHtml(matName)}</span>
                                ${isMatActive ? '<span style="color:#34d399; font-size:0.75rem;">(Caixa Aberta)</span>' : ''}
                            </div>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <span class="anki-folder-count">${matData.total} cartões</span>
                                <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); setFlashcardViewFilter(decodeURIComponent('${safeMatHandler}'), '')" title="Abrir caixa desta matéria">Abrir Caixa</button>
                                <span>${isOpen ? 'Fechar' : 'Abrir'}</span>
                            </div>
                        </div>
                        ${isOpen ? `<div class="anki-subfolder-list">${subfoldersHtml}</div>` : ''}
                    </div>
                `;
            });

            const btnReset = document.getElementById('btnResetFcFilter');
            if (btnReset) btnReset.style.display = (activeFcMateriaFilter || activeFcAssuntoFilter) ? 'inline-flex' : 'none';
        }

        function toggleFcFolder(matName) {
            openFcFolders[matName] = !openFcFolders[matName];
            renderFlashcardFolders();
        }

        function setFlashcardViewFilter(mat, ass) {
            activeFcMateriaFilter = mat;
            activeFcAssuntoFilter = ass;
            renderFlashcardFolders();
            renderFlashcards();
        }

        function renderFlashcards() {
            const container = document.getElementById('flashcardsContainer');
            container.innerHTML = '';
            if (!activeFcMateriaFilter && !activeFcAssuntoFilter) return;

            let displayList = flashcardsList.map((fc, idx) => ({ ...fc, originalIndex: idx }));
            if (activeFcMateriaFilter) displayList = displayList.filter(fc => (fc.materia || 'Geral / Sem Matéria') === activeFcMateriaFilter);
            if (activeFcAssuntoFilter) displayList = displayList.filter(fc => (fc.assunto || 'Sem Assunto Específico') === activeFcAssuntoFilter);

            if (displayList.length === 0) {
                container.innerHTML = '<p style="opacity: 0.8; padding:1rem;">Nenhum flashcard encontrado para este filtro.</p>';
                return;
            }

            const grouped = {};
            displayList.forEach(fc => {
                const mKey = fc.materia || 'Geral / Sem Matéria';
                if (!grouped[mKey]) grouped[mKey] = [];
                grouped[mKey].push(fc);
            });

            Object.keys(grouped).forEach(mName => {
                let cardsHtml = '';
                grouped[mName].forEach(fc => {
                    cardsHtml += `
                        <div class="flashcard-box">
                            <div class="flashcard-content">
                                <div class="flashcard-meta">
                                    <span class="flashcard-badge-materia">${escapeHtml(fc.materia || 'Geral')}</span>
                                    ${fc.assunto ? `<span class="flashcard-badge-assunto">${escapeHtml(fc.assunto)}</span>` : ''}
                                </div>
                                <p><strong>P:</strong> ${escapeHtml(fc.pergunta)}</p>
                                <p style="margin-top:6px; color:#34d399;"><strong>R:</strong> ${escapeHtml(fc.resposta)}</p>
                            </div>
                            <div style="display:flex; gap:6px; flex-shrink:0;">
                                <button class="btn btn-secondary btn-sm" onclick="openEditarFlashcardModal(${fc.originalIndex})" title="Editar Flashcard">Editar</button>
                                <button class="btn btn-danger btn-sm" onclick="removeFlashcard(${fc.originalIndex})" title="Apagar Flashcard Individual">Excluir</button>
                            </div>
                        </div>
                    `;
                });

                container.innerHTML += `
                    <div style="margin-bottom:1.5rem; background: rgba(0,0,0,0.15); padding: 1rem; border-radius: 8px; border: 1px solid var(--primary-blue);">
                        <h4 style="color:var(--header-materia-text); margin-bottom:0.8rem; border-bottom:1px solid var(--border-color); padding-bottom:4px; display:flex; justify-content:space-between; align-items:center;">
                            <span>${escapeHtml(mName)}</span>
                            <span style="font-size:0.8rem; font-weight:normal;">(${grouped[mName].length} cartões)</span>
                        </h4>
                        ${cardsHtml}
                    </div>
                `;
            });
        }

        function openEditarFlashcardModal(idx) {
            editingFcIndex = idx;
            const fc = flashcardsList[idx];
            if (!fc) return;
            document.getElementById('editFcMateria').value = fc.materia || '';
            document.getElementById('editFcAssunto').value = fc.assunto || '';
            document.getElementById('editFcPergunta').value = fc.pergunta || '';
            document.getElementById('editFcResposta').value = fc.resposta || '';
            document.getElementById('modalEditarFlashcard').style.display = 'flex';
        }

        function closeModalEditarFlashcard() {
            document.getElementById('modalEditarFlashcard').style.display = 'none';
            editingFcIndex = null;
        }

        async function salvarEdicaoFlashcard() {
            if (editingFcIndex === null) return;
            const mat = document.getElementById('editFcMateria').value.trim();
            const ass = document.getElementById('editFcAssunto').value.trim();
            const perg = document.getElementById('editFcPergunta').value.trim();
            const resp = document.getElementById('editFcResposta').value.trim();
            if (!perg || !resp) return alert('Pergunta e Resposta são obrigatórias.');

            flashcardsList[editingFcIndex].materia = mat;
            flashcardsList[editingFcIndex].assunto = ass;
            flashcardsList[editingFcIndex].pergunta = perg;
            flashcardsList[editingFcIndex].resposta = resp;

            closeModalEditarFlashcard();
            renderFlashcardFolders();
            renderFlashcards();
            await saveFlashcardsData();
        }

        async function removeFlashcard(idx) {
            if (confirm('Deseja apagar este flashcard individualmente?')) {
                const removed = flashcardsList.splice(idx, 1);
                if (removed[0] && removed[0].id) {
                    await deleteFlashcardFromCloud(removed[0].id);
                }
                renderFlashcardFolders();
                renderFlashcards();
                await saveFlashcardsData();
            }
        }

        function parseTextToFlashcards(rawText, selectedMateria = '', selectedAssunto = '') {
            if (!rawText || !rawText.trim()) return 0;
            const lines = rawText.split(/\r?\n|\r/);
            let currentPergunta = '';
            let currentResposta = '';
            let count = 0;

            lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.length < 2) return;
                if (/^(p:|pergunta:)/i.test(trimmed)) {
                    if (currentPergunta && currentResposta) {
                        flashcardsList.push({
                            id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
                            materia: selectedMateria, assunto: selectedAssunto, pergunta: currentPergunta, resposta: currentResposta
                        });
                        count++;
                        currentResposta = '';
                    }
                    currentPergunta = trimmed.replace(/^(p:|pergunta:)/i, '').trim();
                } else if (/^(r:|resposta:)/i.test(trimmed)) {
                    currentResposta = trimmed.replace(/^(r:|resposta:)/i, '').trim();
                } else {
                    const parts = trimmed.split(/;|,/);
                    if (parts.length >= 2) {
                        const p = parts[0].trim();
                        const r = parts.slice(1).join(';').trim();
                        if (p && r && p.length > 1 && r.length > 1) {
                            flashcardsList.push({
                                id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
                                materia: selectedMateria, assunto: selectedAssunto, pergunta: p, resposta: r
                            });
                            count++;
                        }
                    }
                }
            });

            if (currentPergunta && currentResposta) {
                flashcardsList.push({
                    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
                    materia: selectedMateria, assunto: selectedAssunto, pergunta: currentPergunta, resposta: currentResposta
                });
                count++;
            }
            return count;
        }

        async function processPastedFlashcardsText() {
            const textArea = document.getElementById('fcPasteTextArea');
            const rawText = textArea.value;
            const materia = document.getElementById('fcMateriaSelect').value;
            const assunto = document.getElementById('fcAssuntoSelect').value;
            if (!rawText || !rawText.trim()) return alert('Cole o texto das perguntas e respostas na caixa antes de converter.');

            const importedCount = parseTextToFlashcards(rawText, materia, assunto);
            if (importedCount > 0) {
                textArea.value = '';
                renderFlashcardFolders();
                renderFlashcards();
                await saveFlashcardsData();
                alert(`Sucesso! ${importedCount} flashcards gerados.`);
            } else {
                alert('Formato não reconhecido. Use "P:" e "R:" ou separe por ponto e vírgula (;).');
            }
        }

        function buildFlashcardExportPayload() {
            const hierarchy = {};
            (flashcardsList || []).forEach(fc => {
                const materia = String(fc.materia || 'Geral / Sem Matéria').trim() || 'Geral / Sem Matéria';
                const assunto = String(fc.assunto || 'Sem Assunto Específico').trim() || 'Sem Assunto Específico';
                if (!hierarchy[materia]) hierarchy[materia] = {};
                if (!hierarchy[materia][assunto]) hierarchy[materia][assunto] = [];
                hierarchy[materia][assunto].push({
                    pergunta: String(fc.pergunta || ''),
                    resposta: String(fc.resposta || '')
                });
            });

            const pastas = Object.keys(hierarchy).sort((a,b) => a.localeCompare(b, 'pt-BR')).map(materia => ({
                materia,
                assuntos: Object.keys(hierarchy[materia]).sort((a,b) => a.localeCompare(b, 'pt-BR')).map(assunto => ({
                    assunto,
                    flashcards: hierarchy[materia][assunto]
                }))
            }));

            return {
                formato: 'painel-estudos-flashcards',
                versao: 1,
                concursoOrigem: currentConcurso,
                exportadoEm: new Date().toISOString(),
                totalFlashcards: (flashcardsList || []).length,
                pastas
            };
        }

        function exportAllFlashcards() {
            if (!Array.isArray(flashcardsList) || flashcardsList.length === 0) {
                alert('Não há flashcards neste concurso para exportar.');
                return;
            }
            const payload = buildFlashcardExportPayload();
            const safeContest = String(currentConcurso || 'concurso')
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'concurso';
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `flashcards_${safeContest}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        function normalizeImportedFlashcardsPayload(payload) {
            const cards = [];
            const pushCard = (raw, materiaFallback = '', assuntoFallback = '') => {
                if (!raw || typeof raw !== 'object') return;
                if (cards.length >= IMPORT_LIMITS.maxFlashcards) throw new Error('O arquivo excede o limite de 10.000 flashcards.');
                const pergunta = normalizeImportedText(raw.pergunta ?? raw.frente ?? raw.question ?? '', IMPORT_LIMITS.perguntaChars);
                const resposta = normalizeImportedText(raw.resposta ?? raw.verso ?? raw.answer ?? '', IMPORT_LIMITS.respostaChars);
                if (!pergunta || !resposta) return;
                cards.push({
                    materia: normalizeImportedText(raw.materia ?? materiaFallback ?? '', IMPORT_LIMITS.materiaChars),
                    assunto: normalizeImportedText(raw.assunto ?? assuntoFallback ?? '', IMPORT_LIMITS.assuntoChars),
                    pergunta,
                    resposta
                });
            };

            if (payload?.formato === 'painel-estudos-flashcards' && Array.isArray(payload.pastas)) {
                payload.pastas.forEach(pasta => {
                    const materia = String(pasta?.materia || '').trim();
                    (pasta?.assuntos || []).forEach(grupo => {
                        const assunto = String(grupo?.assunto || '').trim();
                        (grupo?.flashcards || grupo?.cards || []).forEach(card => pushCard(card, materia, assunto));
                    });
                });
                return cards;
            }

            const flat = Array.isArray(payload) ? payload :
                (Array.isArray(payload?.flashcards) ? payload.flashcards :
                (Array.isArray(payload?.cards) ? payload.cards : []));
            flat.forEach(card => pushCard(card));
            return cards;
        }

        async function importFlashcardsFromFile(event) {
            const input = event?.target;
            const file = input?.files?.[0];
            if (!file) return;
            try {
                assertImportFileSafe(file);
                const text = await file.text();
                const payload = assertSafeJsonPayload(JSON.parse(text));
                const importedCards = normalizeImportedFlashcardsPayload(payload);
                if (!importedCards.length) throw new Error('O arquivo não contém flashcards reconhecíveis.');

                const existingKeys = new Set((flashcardsList || []).map(fc =>
                    [fc.materia, fc.assunto, fc.pergunta, fc.resposta]
                        .map(v => String(v || '').trim().toLocaleLowerCase('pt-BR')).join('\u241f')
                ));
                let added = 0;
                let duplicates = 0;
                importedCards.forEach(card => {
                    const key = [card.materia, card.assunto, card.pergunta, card.resposta]
                        .map(v => String(v || '').trim().toLocaleLowerCase('pt-BR')).join('\u241f');
                    if (existingKeys.has(key)) { duplicates++; return; }
                    existingKeys.add(key);
                    flashcardsList.push({
                        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
                        materia: card.materia,
                        assunto: card.assunto,
                        pergunta: card.pergunta,
                        resposta: card.resposta
                    });
                    added++;
                });

                if (added) {
                    openFcFolders = {};
                    activeFcMateriaFilter = '';
                    activeFcAssuntoFilter = '';
                    await saveFlashcardsData();
                    renderFlashcardFolders();
                    renderFlashcards();
                    populateFcMateriaDropdown();
                }
                alert(`${added} flashcard(s) importado(s) para "${currentConcurso}".${duplicates ? `\n${duplicates} duplicado(s) ignorado(s).` : ''}`);
            } catch (error) {
                console.error('Falha ao importar flashcards:', error);
                alert('Não foi possível importar este arquivo de flashcards. Verifique se ele é um JSON exportado pelo Estudo Adaptativo Inteligente.');
            } finally {
                if (input) input.value = '';
            }
        }

        function openModalFiltroEstudoFlashcards() {
            const matSel = document.getElementById('studyFilterMateria');
            if (!matSel) return;
            matSel.innerHTML = '<option value="">Todas as Matérias</option>';
            const setMaterias = new Set();
            flashcardsList.forEach(fc => { if (fc.materia) setMaterias.add(fc.materia); });
            setMaterias.forEach(mat => { matSel.innerHTML += `<option value="${escapeHtml(mat)}">${escapeHtml(mat)}</option>`; });
            updateStudyFilterAssuntoOptions();
            document.getElementById('modalFiltroEstudoFC').style.display = 'flex';
        }

        function closeModalFiltroEstudoFlashcards() { document.getElementById('modalFiltroEstudoFC').style.display = 'none'; }

        function updateStudyFilterAssuntoOptions() {
            const matVal = document.getElementById('studyFilterMateria').value;
            const assSel = document.getElementById('studyFilterAssunto');
            if (!assSel) return;
            assSel.innerHTML = '<option value="">Todos os Assuntos</option>';
            if (!matVal) return;
            const setAssuntos = new Set();
            flashcardsList.forEach(fc => { if (fc.materia === matVal && fc.assunto) setAssuntos.add(fc.assunto); });
            setAssuntos.forEach(ass => { assSel.innerHTML += `<option value="${escapeHtml(ass)}">${escapeHtml(ass)}</option>`; });
        }

        function getFlashcardShuffleHistoryKey() {
            const uid = currentUser?.id || 'guest';
            return `flashcard_shuffle_history_${uid}`;
        }

        function getFlashcardStudyToken(fc) {
            if (fc?.id) return String(fc.id);
            return [fc?.materia, fc?.assunto, fc?.pergunta, fc?.resposta]
                .map(v => String(v || '').trim().toLocaleLowerCase('pt-BR'))
                .join('\u241f');
        }

        function getSecureRandomIndex(maxExclusive) {
            if (maxExclusive <= 1) return 0;
            try {
                if (window.crypto?.getRandomValues) {
                    const range = 0x100000000;
                    const limit = range - (range % maxExclusive);
                    const buffer = new Uint32Array(1);
                    do window.crypto.getRandomValues(buffer); while (buffer[0] >= limit);
                    return buffer[0] % maxExclusive;
                }
            } catch (_) {}
            return Math.floor(Math.random() * maxExclusive);
        }

        function fisherYatesShuffle(list) {
            const shuffled = [...list];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = getSecureRandomIndex(i + 1);
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled;
        }

        function readFlashcardShuffleHistory() {
            try {
                const parsed = JSON.parse(localStorage.getItem(getFlashcardShuffleHistoryKey()) || '{}');
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch (_) {
                return {};
            }
        }

        function saveFlashcardShuffleHistory(history) {
            try {
                const entries = Object.entries(history || {})
                    .sort((a, b) => Number(b[1]?.at || 0) - Number(a[1]?.at || 0))
                    .slice(0, 40);
                localStorage.setItem(getFlashcardShuffleHistoryKey(), JSON.stringify(Object.fromEntries(entries)));
            } catch (_) {}
        }

        function shuffleFlashcardsForStudy(list, deckKey = 'all') {
            const source = Array.isArray(list) ? [...list] : [];
            if (source.length <= 1) return source;

            const history = readFlashcardShuffleHistory();
            const scopedKey = `${currentConcurso || 'sem-concurso'}::${deckKey}`;
            const previous = history[scopedKey] || null;
            let shuffled = source;

            for (let attempt = 0; attempt < 8; attempt++) {
                shuffled = fisherYatesShuffle(source);
                const tokens = shuffled.map(getFlashcardStudyToken);
                const signature = tokens.join('\u241e');
                const firstToken = tokens[0] || '';
                const firstChanged = !previous?.first || firstToken !== previous.first;
                const orderChanged = !previous?.signature || signature !== previous.signature;
                if (firstChanged && orderChanged) break;
            }

            // Com mais de um cartão, evita deliberadamente começar pelo mesmo cartão da sessão anterior.
            if (previous?.first && getFlashcardStudyToken(shuffled[0]) === previous.first) {
                const swapIndex = shuffled.findIndex((fc, idx) => idx > 0 && getFlashcardStudyToken(fc) !== previous.first);
                if (swapIndex > 0) [shuffled[0], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[0]];
            }

            let tokens = shuffled.map(getFlashcardStudyToken);
            let signature = tokens.join('\u241e');
            if (previous?.signature && signature === previous.signature && shuffled.length > 2) {
                shuffled = [...shuffled.slice(1), shuffled[0]];
                tokens = shuffled.map(getFlashcardStudyToken);
                signature = tokens.join('\u241e');
            }

            history[scopedKey] = { first: tokens[0] || '', signature, at: Date.now() };
            saveFlashcardShuffleHistory(history);
            return shuffled;
        }

        function startFilteredStudyModal() {
            const targetMateria = document.getElementById('studyFilterMateria').value;
            const targetAssunto = document.getElementById('studyFilterAssunto').value;
            let filteredCards = [...flashcardsList];
            if (targetMateria) filteredCards = filteredCards.filter(fc => fc.materia === targetMateria);
            if (targetAssunto) filteredCards = filteredCards.filter(fc => fc.assunto === targetAssunto);
            if (filteredCards.length === 0) return alert('Nenhum flashcard encontrado para o filtro.');

            closeModalFiltroEstudoFlashcards();
            const deckKey = `filtro:${targetMateria || '*'}:${targetAssunto || '*'}`;
            startStudyModalWithList(filteredCards, deckKey);
        }

        function startShuffleStudyModal() {
            if (flashcardsList.length === 0) return alert('Importe flashcards antes de iniciar o estudo.');
            startStudyModalWithList(flashcardsList, 'todos');
        }

        function startStudyModalWithList(list, deckKey = 'todos') {
            studyQueue = shuffleFlashcardsForStudy(list, deckKey);
            currentStudyIdx = 0;
            showingAnswer = false;
            updateStudyModalCard();
            document.getElementById('modalStudyFlashcards').style.display = 'flex';
        }

        function updateStudyModalCard() {
            if (currentStudyIdx >= studyQueue.length) {
                alert('Parabéns! Você concluiu a revisão de todos os flashcards selecionados.');
                closeStudyModal();
                return;
            }
            const fc = studyQueue[currentStudyIdx];
            document.getElementById('studyModalProgress').innerText = `${currentStudyIdx + 1} / ${studyQueue.length}`;
            const metaContainer = document.getElementById('studyCardMeta');
            metaContainer.innerHTML = `<span class="flashcard-badge-materia">${escapeHtml(fc.materia || 'Geral')}</span>`;
            if (fc.assunto) metaContainer.innerHTML += `<span class="flashcard-badge-assunto">${escapeHtml(fc.assunto)}</span>`;
            showingAnswer = false;
            document.getElementById('studyCardLabel').innerText = 'FRENTE (Clique para virar)';
            document.getElementById('studyCardText').innerText = fc.pergunta;
        }

        function toggleStudyCardAnswer() {
            if (currentStudyIdx >= studyQueue.length) return;
            const fc = studyQueue[currentStudyIdx];
            showingAnswer = !showingAnswer;
            if (showingAnswer) {
                document.getElementById('studyCardLabel').innerText = 'VERSO / RESPOSTA';
                document.getElementById('studyCardText').innerText = fc.resposta;
            } else {
                document.getElementById('studyCardLabel').innerText = 'FRENTE (Clique para virar)';
                document.getElementById('studyCardText').innerText = fc.pergunta;
            }
        }

        function nextStudyCard() { currentStudyIdx++; updateStudyModalCard(); }
        function closeStudyModal() { document.getElementById('modalStudyFlashcards').style.display = 'none'; }

        function initMonthYearSelectors() {
            const mSel = document.getElementById('monthSelect');
            const ySel = document.getElementById('yearSelect');
            if (!mSel || !ySel) return;
            mSel.innerHTML = ''; ySel.innerHTML = '';
            MESES.forEach((m, idx) => { mSel.innerHTML += `<option value="${idx}" ${idx === selectedMonth ? 'selected' : ''}>${m}</option>`; });
            const yearStart = selectedYear - 1;
            for (let y = yearStart; y <= yearStart + 5; y++) {
                ySel.innerHTML += `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}</option>`;
            }
        }

        function onMonthYearChange() {
            selectedMonth = parseInt(document.getElementById('monthSelect').value);
            selectedYear = parseInt(document.getElementById('yearSelect').value);
            renderMonthCalendar();
        }

        function getScheduledItemStudyState(scheduleText, editalLookup = null, dateKey = null) {
            const text = String(scheduleText || '');
            const cleanTop = normalizeScheduledTopicForStudy(text);
            const isRevision = text.startsWith('🔄 Rev');
            const lookup = editalLookup || new Map(editalItems.map(item => [`${item.materia} - ${item.assunto}`, item]));
            const matchedItem = lookup.get(cleanTop);

            if (!matchedItem) {
                return { done: false, isRevision, matched: false, cleanTop };
            }

            let done = false;
            if (isRevision) {
                if (isAdaptiveRetentionReviewText(text)) {
                    const contest = getConcursosMetadata()[currentConcurso] || {};
                    done = dateKey ? getAdaptiveRetentionReviewCompletion(contest, dateKey, cleanTop) : false;
                } else {
                    const match = text.match(/🔄 Rev \((24h|\d+d)\):/);
                    const offset = match ? (match[1] === '24h' ? 1 : Number(match[1].replace('d',''))) : null;
                    done = offset ? getAdaptiveRevisionCompletion(matchedItem, offset) : false;
                }
            } else {
                // O estudo-base só está concluído quando as duas etapas foram realizadas.
                done = !!(matchedItem.teoria && matchedItem.questoes);
            }

            return { done, isRevision, matched: true, cleanTop, matchedItem };
        }

        function getPendingScheduledItems(items, editalLookup = null, dateKey = null) {
            if (!Array.isArray(items)) return [];
            return items.filter(it => !getScheduledItemStudyState(it, editalLookup, dateKey).done);
        }

        function renderMonthCalendar() {
            const __calendarStarted = performance.now();
            const grid = document.getElementById('monthCalendarGrid');
            if (!grid) return;

            const metadata = getConcursosMetadata();
            const dateSchedule = metadata[currentConcurso]?.dateSchedule || {};
            const firstDay = new Date(selectedYear, selectedMonth, 1).getDay();
            const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
            const todayObj = new Date();
            const isCurrentMonth = todayObj.getMonth() === selectedMonth && todayObj.getFullYear() === selectedYear;
            const todayKey = getLocalDateKey(todayObj);

            // Índice para evitar procurar repetidamente o mesmo tópico em toda a lista do edital.
            const editalLookup = new Map(editalItems.map(item => [`${item.materia} - ${item.assunto}`, item]));
            const htmlParts = [];

            for (let i = 0; i < firstDay; i++) {
                htmlParts.push('<div class="month-day-cell other-month" aria-hidden="true"></div>');
            }

            for (let day = 1; day <= daysInMonth; day++) {
                const dateKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isToday = isCurrentMonth && todayObj.getDate() === day;
                const items = dateSchedule[dateKey] || [];
                let completedCount = 0;
                let revisionCount = 0;
                const badgeParts = [];

                items.forEach(it => {
                    const state = getScheduledItemStudyState(it, editalLookup, dateKey);
                    if (state.isRevision) revisionCount++;
                    if (state.done) completedCount++;
                    badgeParts.push(`<div class="clean-subject-badge ${state.done ? 'done' : (state.isRevision ? 'rev' : '')}">${escapeHtml(formatScheduledItemForDisplay(it))}</div>`);
                });

                const allDone = items.length > 0 && completedCount === items.length;
                const isOverdue = items.length > 0 && dateKey < todayKey && !allDone;
                const studyDayStateClass = allDone ? 'study-completed' : (isOverdue ? 'study-overdue' : '');
                const mobileClass = allDone ? 'done' : (isOverdue ? 'late' : (revisionCount > 0 ? 'rev' : ''));
                const mobileMeta = items.length > 0
                    ? `<div class="month-day-mobile-meta"><span class="month-day-mobile-count ${mobileClass}" title="${items.length} itens agendados">${allDone ? 'Concluído' : items.length}</span></div>`
                    : '<div class="month-day-mobile-meta"></div>';

                htmlParts.push(`
                    <div class="month-day-cell ${isToday ? 'today' : ''} ${studyDayStateClass}" data-date-key="${dateKey}" onclick="openModalDayContent('${dateKey}')" role="button" tabindex="0" aria-label="Dia ${day}, ${items.length} itens agendados">
                        <div class="day-num-header">
                            <span>${day}</span>
                            <button class="btn btn-secondary btn-sm" style="padding:0 4px; font-size:0.7rem;" title="Abrir dia" tabindex="-1">Abrir</button>
                        </div>
                        <div class="day-badges-scroll">${badgeParts.join('')}</div>
                        ${mobileMeta}
                    </div>
                `);
            }

            // Uma única escrita no DOM reduz reflows/repaints, especialmente em celulares.
            grid.innerHTML = htmlParts.join('');
            const __calendarDuration = performance.now() - __calendarStarted;
            if (__calendarDuration >= 16) recordLocalPerformance('measure', 'renderMonthCalendar', __calendarDuration);
            renderDelayedPanel();
        }

        function getMateriaScheduleWeight(materia, items, metadata) {
            const explicit = Number(metadata?.[currentConcurso]?.materiaWeights?.[materia]);
            if (Number.isFinite(explicit) && explicit > 0) return explicit;
            const itemWeight = items.map(i => Number(i.peso)).find(v => Number.isFinite(v) && v > 0);
            if (itemWeight) return itemWeight;
            const priority = Math.max(1, Math.min(4, Number(items[0]?.prioridade) || 2));
            return 5 - priority; // P1=4, P2=3, P3=2, P4=1.
        }

        // V9.65.1 — Score adaptativo da matéria.
        // A frequência entre disciplinas passa a reagir ao estado real de aprendizagem,
        // e não apenas ao peso/fair-share. O resultado é normalizado em 0–100.
        function computeMateriaAdaptiveScore(materia, topicItems, metadata) {
            const contest = metadata?.[currentConcurso] || {};
            const now = new Date();
            const items = Array.isArray(topicItems) ? topicItems : [];
            if (!items.length) return { total:0, adaptiveWeight:1, components:{} };

            const explicitWeight = Math.max(0.25, getMateriaScheduleWeight(materia, items, metadata));
            const priority = Math.max(1, Math.min(4, Math.min(...items.map(i => Number(i.prioridade) || 2))));
            const phase = getExamPhaseProfile(contest, now);

            let retentionSum = 0;
            let retentionCount = 0;
            let overdueCount = 0;
            let overdueDaysSum = 0;
            let questionRiskSum = 0;
            let questionCount = 0;
            let topicScoreSum = 0;
            let topicScorePeak = 0;

            items.forEach(item => {
                const state = getRetentionTopicState(contest, item?.materia, item?.assunto, false);
                const retention = state?.lastStudyAt ? calculateRetentionFromState(state, now) : null;
                if (Number.isFinite(retention)) {
                    retentionSum += retention;
                    retentionCount++;
                }

                const nextAt = state?.nextReviewAt ? new Date(state.nextReviewAt) : null;
                if (nextAt && Number.isFinite(nextAt.getTime()) && nextAt <= now) {
                    overdueCount++;
                    overdueDaysSum += Math.max(0, (now.getTime() - nextAt.getTime()) / 86400000);
                }

                const accuracy = Number(state?.questionStats?.lastAccuracy);
                if (Number.isFinite(accuracy)) {
                    const confidence = Math.max(0.08, Math.min(1, Number(state?.questionStats?.confidence) || 0.25));
                    questionRiskSum += Math.max(0, 100 - accuracy) * confidence;
                    questionCount++;
                }

                const score = computeRetentionSchedulerScore(item, { contest, now }).total;
                topicScoreSum += score;
                topicScorePeak = Math.max(topicScorePeak, score);
            });

            const avgRetention = retentionCount ? retentionSum / retentionCount : null;
            const avgQuestionRisk = questionCount ? questionRiskSum / questionCount : 0;
            const avgTopicScore = topicScoreSum / items.length;
            const avgOverdueDays = overdueCount ? overdueDaysSum / overdueCount : 0;
            const overdueRatio = overdueCount / items.length;

            const components = {
                // Peso continua relevante, porém deixou de comandar sozinho a distribuição.
                weight: Math.min(18, explicitWeight * 3.2),
                priority: (5 - priority) * 5.5,
                retentionRisk: avgRetention == null ? 4 : Math.min(24, Math.max(0, 100 - avgRetention) * 0.24),
                overdue: Math.min(22, overdueRatio * 18 + Math.min(8, avgOverdueDays * 0.8)),
                questions: Math.min(16, avgQuestionRisk * 0.16),
                topicUrgency: Math.min(16, (avgTopicScore * 0.008) + (topicScorePeak * 0.004)),
                examPhase: Math.min(8, Math.max(0, Number(phase?.score) || 0) * 0.025)
            };

            const raw = Object.values(components).reduce((sum, value) => sum + Number(value || 0), 0);
            const total = Math.max(0, Math.min(100, raw));
            // 1–5.5: matérias urgentes podem aparecer mais vezes, sem bloquear as demais.
            const adaptiveWeight = Math.max(1, Math.min(5.5, 1 + total / 22));
            return {
                total,
                adaptiveWeight,
                components,
                avgRetention,
                avgQuestionRisk,
                overdueCount,
                priority,
                explicitWeight
            };
        }

        function createWeightedInterleavingState(items, metadata, { pendingOnly = true } = {}) {
            const grouped = new Map();
            const source = pendingOnly ? items.filter(item => !(item.teoria && item.questoes)) : [...items];
            source.forEach(item => {
                const key = item.materia || 'Geral';
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key).push(item);
            });
            const contest = metadata?.[currentConcurso] || {};
            const queues = [...grouped.entries()].map(([materia, topicItems]) => {
                const sortedItems = [...topicItems].sort((a,b) => {
                    const scoreA = computeRetentionSchedulerScore(a, { contest }).total;
                    const scoreB = computeRetentionSchedulerScore(b, { contest }).total;
                    if (Math.abs(scoreA-scoreB) > 1e-9) return scoreB-scoreA;
                    return (a.assunto_prioridade||1)-(b.assunto_prioridade||1);
                });
                const materiaAdaptive = computeMateriaAdaptiveScore(materia, topicItems, metadata);
                return {
                    materia,
                    items: sortedItems,
                    // Mantido para compatibilidade/diagnóstico; a seleção usa adaptiveWeight.
                    weight: Math.max(0.25, getMateriaScheduleWeight(materia, topicItems, metadata)),
                    adaptiveWeight: materiaAdaptive.adaptiveWeight,
                    adaptiveScore: materiaAdaptive.total,
                    adaptiveComponents: materiaAdaptive.components,
                    served: 0,
                    lastTurn: -1,
                    priority: Math.max(1, Math.min(4, Math.min(...topicItems.map(i => Number(i.prioridade)||2)))),
                    schedulerScore: sortedItems.length ? computeRetentionSchedulerScore(sortedItems[0], { contest }).total : 0
                };
            });
            return { queues, turn: 0, lastMateria: null };
        }

        function countWeightedInterleavingRemaining(state) {
            return (state?.queues || []).reduce((sum, queue) => sum + queue.items.length, 0);
        }

        function takeWeightedInterleavedItem(state, usedMateriasToday = new Set()) {
            if (!state) return null;
            let available = state.queues.filter(q => q.items.length);
            if (!available.length) return null;

            // 1) Evita repetir a mesma disciplina consecutivamente quando houver alternativa.
            if (state.lastMateria && available.some(q => q.materia !== state.lastMateria)) {
                available = available.filter(q => q.materia !== state.lastMateria);
            }

            // 2) Dentro do dia, tenta usar disciplinas diferentes antes de repetir alguma.
            const unseenToday = available.filter(q => !usedMateriasToday.has(q.materia));
            if (unseenToday.length) available = unseenToday;

            // 3) Seleção híbrida adaptativa. Urgência da matéria domina a decisão,
            // enquanto frequência já atendida reduz progressivamente sua pressão.
            // O tempo de espera impede que matérias de menor risco sejam esquecidas.
            available.sort((a,b) => {
                const waitA = Math.max(0, state.turn - a.lastTurn);
                const waitB = Math.max(0, state.turn - b.lastTurn);
                const pressureA = (a.adaptiveScore || 0) * 8
                    + Math.min(220, waitA * 32)
                    + Math.min(120, (a.schedulerScore || 0) * 0.06)
                    - (a.served / Math.max(1, a.adaptiveWeight || 1)) * 185;
                const pressureB = (b.adaptiveScore || 0) * 8
                    + Math.min(220, waitB * 32)
                    + Math.min(120, (b.schedulerScore || 0) * 0.06)
                    - (b.served / Math.max(1, b.adaptiveWeight || 1)) * 185;
                if (Math.abs(pressureA - pressureB) > 1e-9) return pressureB - pressureA;
                if (Math.abs((a.adaptiveScore||0)-(b.adaptiveScore||0)) > 1e-9) return (b.adaptiveScore||0)-(a.adaptiveScore||0);
                if (Math.abs((a.schedulerScore||0)-(b.schedulerScore||0)) > 1e-9) return (b.schedulerScore||0)-(a.schedulerScore||0);
                if (a.priority !== b.priority) return a.priority - b.priority;
                return a.materia.localeCompare(b.materia, 'pt-BR');
            });

            const chosen = available[0];
            const item = chosen.items.shift();
            const contest = getConcursosMetadata()[currentConcurso] || {};
            chosen.schedulerScore = chosen.items.length ? computeRetentionSchedulerScore(chosen.items[0], { contest }).total : 0;
            chosen.served += 1;
            chosen.lastTurn = state.turn++;
            state.lastMateria = chosen.materia;
            usedMateriasToday.add(chosen.materia);
            return item;
        }

        function buildWeightedPendingSequence(items, metadata) {
            const state = createWeightedInterleavingState(items, metadata, { pendingOnly:true });
            const result = [];
            const used = new Set();
            while (countWeightedInterleavingRemaining(state)) {
                const item = takeWeightedInterleavedItem(state, used);
                if (!item) break;
                result.push(item);
                // Esta função não conhece a capacidade diária; reinicia a diversidade
                // quando todas as disciplinas ainda disponíveis já passaram pelo ciclo.
                const activeCount = state.queues.filter(q => q.items.length).length;
                if (activeCount && used.size >= activeCount) used.clear();
            }
            return result;
        }

        function inferScheduleWeekdays(dateSchedule, fromKey) {
            const set = new Set();
            Object.entries(dateSchedule || {}).forEach(([dateKey, items]) => {
                if (dateKey < fromKey || !Array.isArray(items)) return;
                if (!items.some(text => !String(text).startsWith('🔄 Rev'))) return;
                set.add(new Date(dateKey + 'T00:00:00').getDay());
            });
            return [...set].sort((a,b)=>a-b);
        }

        function inferScheduleSlots(dateSchedule, fromKey) {
            let max = 0;
            Object.entries(dateSchedule || {}).forEach(([dateKey, items]) => {
                if (dateKey < fromKey || !Array.isArray(items)) return;
                const count = items.filter(text => !String(text).startsWith('🔄 Rev')).length;
                max = Math.max(max, count);
            });
            return max;
        }

        async function reorganizarMateriasCronograma() {
            if (!editalItems.length) { await appNotice('Não há matérias no edital atual para reorganizar.'); return; }
            const metadata = getConcursosMetadata();
            if (isFlexibleOpportunityMode(metadata[currentConcurso] || {})) {
                return appNotice('O modo Estudo por Oportunidade não usa uma fila rígida para reorganizar. A melhor próxima atividade é calculada no momento em que você toca em “Estudar agora”.', { title:'Modo flexível' });
            }
            if (!metadata[currentConcurso]) metadata[currentConcurso] = {};
            const contestMeta = metadata[currentConcurso];
            const oldSchedule = contestMeta.dateSchedule || {};
            const todayKey = getLocalDateKey(new Date());
            const pendingState = createWeightedInterleavingState(editalItems, metadata, { pendingOnly:true });
            const pendingCount = countWeightedInterleavingRemaining(pendingState);
            if (!pendingCount) { await appNotice('Todos os tópicos do edital já foram estudados. Não há matérias pendentes para redistribuir.'); return; }

            const ok = await appConfirm(
                `Reorganizar ${pendingCount} tópicos pendentes a partir de hoje?\n\n` +
                'O histórico dos dias anteriores será preservado. A redistribuição será adaptativa: o sistema combinará peso, prioridade P1–P4, retenção, revisões vencidas, desempenho em questões, urgência dos tópicos e proximidade da prova. Também evitará repetir a mesma matéria consecutivamente quando houver alternativa. Tópicos adicionados manualmente serão incluídos.',
                { title:'Reorganizar Matérias', confirmText:'Reorganizar', confirmClass:'btn-primary' }
            );
            if (!ok) return;

            const cfg = contestMeta.scheduleConfig || {};
            const dailySlots = Math.max(1, Number(cfg.dailySlots) || Number(contestMeta.pomodoroDailyTargetHours) || inferScheduleSlots(oldSchedule, todayKey) || 1);
            const customDailyHours = (cfg.method === 2 && cfg.customDailyHoursByWeekday) ? cfg.customDailyHoursByWeekday : null;
            const revisionStrategy = cfg.revisionStrategy || 'classica';
            let weekdays = Array.isArray(cfg.weekdays) && cfg.weekdays.length ? [...cfg.weekdays] : inferScheduleWeekdays(oldSchedule, todayKey);
            const method = Number(cfg.method || contestMeta.pomodoroScheduleMethod || 0);
            if (!weekdays.length && method !== 1) weekdays = [1,2,3,4,5];

            const rebuilt = {};
            const editalByTopic = new Map(editalItems.map(item => [`${item.materia} - ${item.assunto}`, item]));
            Object.entries(oldSchedule).forEach(([dateKey, items]) => {
                if (!Array.isArray(items)) return;
                if (dateKey < todayKey) {
                    rebuilt[dateKey] = [...items];
                    return;
                }
                // Mantém revisões futuras de tópicos que já começaram a ser estudados;
                // a redistribuição atua somente sobre o conteúdo ainda pendente.
                const preservedReviews = items.filter(text => {
                    const raw = String(text);
                    if (!raw.startsWith('🔄 Rev')) return false;
                    const topic = raw.replace(/^🔄 Rev \(\d+d\): /, '');
                    const item = editalByTopic.get(topic);
                    return !!(item && (item.teoria || item.questoes || hasAnyAdaptiveRevisionCompletion(item, contestMeta)));
                });
                if (preservedReviews.length) rebuilt[dateKey] = [...new Set(preservedReviews)];
            });

            let currDate = new Date(todayKey + 'T00:00:00');
            let safety = 0;
            while (countWeightedInterleavingRemaining(pendingState) && safety < 5000) {
                safety++;
                const dow = currDate.getDay();
                let canStudy;
                if (method === 1) {
                    canStudy = !((dow === 6 && cfg.includeSaturday === false) || (dow === 0 && cfg.includeSunday === false));
                } else {
                    canStudy = weekdays.includes(dow);
                }
                if (canStudy) {
                    const dateKey = getLocalDateKey(currDate);
                    const slotsForDay = customDailyHours ? Math.max(1, Math.round(Number(customDailyHours[dow]) || 1)) : dailySlots;
                    if (!rebuilt[dateKey]) rebuilt[dateKey] = [];
                    const usedMateriasToday = new Set();
                    for (let slot=0; slot<slotsForDay; slot++) {
                        const item = takeWeightedInterleavedItem(pendingState, usedMateriasToday);
                        if (!item) break;
                        const topicText = `${item.materia} - ${item.assunto}`;
                        if (!rebuilt[dateKey].includes(topicText)) rebuilt[dateKey].push(topicText);
                        applySpacedRevisions(rebuilt, currDate, topicText, revisionStrategy);
                    }
                }
                currDate.setDate(currDate.getDate()+1);
            }

            contestMeta.dateSchedule = rebuilt;
            contestMeta.pomodoroDailyTargetHours = dailySlots;
            contestMeta.scheduleConfig = {
                ...cfg,
                method: method || 2,
                startDate: todayKey,
                revisionStrategy,
                dailySlots: customDailyHours ? null : dailySlots,
                ...(method === 1 ? {} : { weekdays, customDailyHoursByWeekday: customDailyHours || null })
            };
            await saveConcursosMetadata(metadata);
            renderMonthCalendar();
            renderPomodoroDailyCounter();
            await appNotice('Cronograma reorganizado de forma adaptativa. O histórico anterior foi preservado e a frequência das matérias foi recalculada com peso, prioridade, retenção, revisões vencidas, desempenho em questões, urgência dos tópicos e proximidade da prova. A diversidade entre disciplinas continua protegida.', { title:'Reorganização concluída' });
        }

        async function limparCronogramaMesAtual() {
            const metadata = getConcursosMetadata();
            if (!metadata[currentConcurso]) metadata[currentConcurso] = { dataProva:null, dateSchedule:{} };
            const contest = metadata[currentConcurso];
            if (!contest.dateSchedule || typeof contest.dateSchedule !== 'object') contest.dateSchedule = {};
            if (!Array.isArray(contest.studySessions)) contest.studySessions = [];

            const scheduledCount = Object.values(contest.dateSchedule).reduce((total, items) =>
                total + (Array.isArray(items) ? items.length : 0), 0);
            const sessionCount = contest.studySessions.length;
            const hasPlanning = scheduledCount > 0 || sessionCount > 0 || Number(contest.pomodoroDailyTargetHours || 0) > 0 || contest.scheduleConfig;

            if (!hasPlanning) {
                // Corrige também qualquer metadado residual de versões anteriores.
                contest.dateSchedule = {};
                contest.studySessions = [];
                contest.pomodoroDailyTargetHours = 0;
                contest.pomodoroScheduleMethod = null;
                contest.adaptiveRevisionProgress = {};
                contest.retentionEngine = {
                    schemaVersion: RETENTION_ENGINE_SCHEMA_VERSION,
                    mode:'shadow', targetRetention:RETENTION_TARGET_DEFAULT, topics:{},
                    createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
                };
                delete contest.scheduleConfig;
                await saveConcursosMetadata(metadata);
                renderMonthCalendar();
                renderDelayedPanel();
                renderPomodoroDailyCounter();
                renderSubjectStudyHours();
                renderChart();
                updateModernOverview();
                await appNotice('O cronograma deste concurso já está vazio e sem meta ativa.', { title:'Cronograma vazio' });
                return;
            }

            const confirmar = await appConfirm(
                `Deseja limpar TODO o cronograma de "${currentConcurso}"?\n\n` +
                'Isso removerá todos os agendamentos e revisões futuras, zerará a meta diária, apagará as sessões de estudo vinculadas ao planejamento e reconciliará o Progresso Geral.\n\n' +
                'Os flashcards, anotações e o edital verticalizado serão preservados.',
                { title:'Limpar Cronograma', confirmText:'Limpar tudo', danger:true }
            );
            if (!confirmar) return;

            // Fonte de verdade única: ao apagar o planejamento, nenhum estado derivado
            // pode sobreviver como se ainda houvesse cronograma ativo.
            contest.dateSchedule = {};
            contest.studySessions = [];
            contest.studyPlanHistory = [];
            contest.pomodoroDailyTargetHours = 0;
            contest.pomodoroScheduleMethod = null;
            contest.adaptiveRevisionProgress = {};
            contest.retentionEngine = {
                schemaVersion: RETENTION_ENGINE_SCHEMA_VERSION,
                mode:'shadow', targetRetention:RETENTION_TARGET_DEFAULT, topics:{},
                createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
            };
            delete contest.scheduleConfig;

            // Remove resíduos legados de Pomodoro específicos do concurso.
            const extraPrefix = getPomodoroExtraStoragePrefix();
            const legacyKeys = [];
            for (let index = 0; index < localStorage.length; index++) {
                const key = localStorage.key(index);
                if (key && key.startsWith(extraPrefix)) legacyKeys.push(key);
            }
            legacyKeys.forEach(key => localStorage.removeItem(key));

            // O contador diário legado não é mais a fonte canônica, mas é zerado para
            // evitar ressurgimento caso uma versão antiga seja aberta posteriormente.
            localStorage.removeItem(getDailyPomodoroStorageKey());

            // Encerra qualquer sessão/timer ainda apontando para o planejamento removido.
            clearInterval(timerInterval);
            timerInterval = null;
            timerHasStarted = false;
            isTimerPaused = false;
            currentFocusCycleMinutes = 0;
            clearActiveStudyContext();
            resetTimer();

            await saveConcursosMetadata(metadata);

            // Sem sessões restantes, Teoria e Questões do concurso voltam a falso.
            const changedItems = [];
            allEditalItems.forEach(item => {
                if ((item.concurso || 'Concurso Geral') !== currentConcurso) return;
                if (item.teoria || item.questoes || item.rev_24h || item.rev_7d || item.rev_30d) {
                    item.teoria = false;
                    item.questoes = false;
                    item.rev_24h = false;
                    item.rev_7d = false;
                    item.rev_30d = false;
                    changedItems.push(item);
                }
            });
            if (changedItems.length) {
                saveEditalToLocalStorage();
                const state = getSyncState();
                changedItems.forEach(item => {
                    const id = String(item.id);
                    state.editalUpserts[id] = { ...item, id };
                    state.editalDeletes = state.editalDeletes.filter(savedId => String(savedId) !== id);
                });
                saveSyncState(state);
            }

            // Atualização coordenada: calendário, abas Hoje/Atrasadas/Próximas,
            // Meta Diária, Pomodoro, Horas por Matéria e Progresso Geral.
            currentDelayedFilter = 'hoje';
            document.querySelectorAll('.filter-tab').forEach((tb, idx) => tb.classList.toggle('active', idx === 0));
            filterDataByConcurso();
            renderMonthCalendar();
            renderDelayedPanel();
            renderPomodoroDailyCounter();
            renderSubjectStudyHours();
            renderChart();
            updateModernOverview();

            if (navigator.onLine && currentUser && changedItems.length) {
                try { await flushPendingEdital(); }
                catch (error) { console.warn('Reset do progresso mantido na fila de sincronização:', error); }
            }

            await appNotice(`Cronograma de "${currentConcurso}" totalmente limpo e sincronizado.\n\nAgendamentos removidos: ${scheduledCount}\nSessões de estudo removidas: ${sessionCount}\nTópicos de Teoria/Questões zerados: ${changedItems.length}.`, { title:'Cronograma limpo' });
        }

        async function limparMateriasEstudadas() {
            const itensDoConcurso = allEditalItems.filter(item =>
                (item.concurso || 'Concurso Geral') === currentConcurso
            );

            if (itensDoConcurso.length === 0) {
                await appNotice('Não há matérias neste concurso para limpar.');
                return;
            }

            const contestMeta = getConcursosMetadata()[currentConcurso] || {};
            const marcados = itensDoConcurso.filter(item =>
                item.teoria || item.questoes || hasAnyAdaptiveRevisionCompletion(item, contestMeta)
            );

            if (marcados.length === 0) {
                await appNotice('Todas as matérias deste concurso já estão marcadas como não estudadas.');
                return;
            }

            const confirmar = await appConfirm(
                `Deseja marcar novamente como não estudados os ${marcados.length} tópicos já concluídos/revisados de "${currentConcurso}"?\n\n` +
                'O cronograma não será apagado. Apenas Teoria, Questões e Revisões serão desmarcadas.',
                { title:'Limpar Matérias', confirmText:'Desmarcar estudos', danger:true }
            );
            if (!confirmar) return;

            // Atualização local em lote: evita uma gravação/renderização por tópico.
            marcados.forEach(item => {
                item.teoria = false;
                item.questoes = false;
                item.rev_24h = false;
                item.rev_7d = false;
                item.rev_30d = false;
            });
            const metadata = getConcursosMetadata();
            if (metadata[currentConcurso]) metadata[currentConcurso].adaptiveRevisionProgress = {};
            saveConcursosMetadata(metadata);

            saveEditalToLocalStorage();

            // Coloca todos os registros alterados na fila em uma única gravação.
            const state = getSyncState();
            marcados.forEach(item => {
                const id = String(item.id);
                state.editalUpserts[id] = { ...item, id };
                state.editalDeletes = state.editalDeletes.filter(savedId => String(savedId) !== id);
            });
            saveSyncState(state);

            filterDataByConcurso();
            renderMonthCalendar();

            // Sincroniza em segundo plano; se falhar, a fila permanece protegida localmente.
            if (navigator.onLine && currentUser) {
                syncAllWithSupabase().catch(error =>
                    console.warn('Limpeza das matérias aguardando sincronização:', error)
                );
            }

            await appNotice(`${marcados.length} tópicos foram marcados novamente como não estudados.`, { title:'Matérias atualizadas' });
        }

        function filterDelayedList(type, btn) {
            currentDelayedFilter = type;
            document.querySelectorAll('.filter-tab').forEach(tb => tb.classList.remove('active'));
            if (btn) btn.classList.add('active');
            renderDelayedPanel();
        }

        function formatScheduleShortDate(dateKey) {
            const parts = String(dateKey || '').split('-');
            if (parts.length !== 3) return String(dateKey || '');
            return `${parts[2]}/${parts[1]}`;
        }

        function daysBetweenDateKeys(fromKey, toKey) {
            const parseKey = (key) => {
                const [year, month, day] = String(key).split('-').map(Number);
                return new Date(year, month - 1, day);
            };
            const diff = parseKey(toKey).getTime() - parseKey(fromKey).getTime();
            return Math.max(0, Math.round(diff / 86400000));
        }

        function toggleDelayedItemsContainer() {
            const container = document.getElementById('delayedItemsContainer');
            if (!container) return;
            container.classList.toggle('collapsed');
        }

        function openScheduledDayFromDelayed(dateKey, event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return;

            const [year, month] = dateKey.split('-').map(Number);
            selectedYear = year;
            selectedMonth = month - 1;

            const calendarTab = document.getElementById('tab-calendario');
            const desktopTabButton = [...document.querySelectorAll('.tab-btn')]
                .find(btn => /cronograma mensal/i.test(btn.textContent || ''));

            if (calendarTab && !calendarTab.classList.contains('active') && desktopTabButton) {
                switchTab('tab-calendario', desktopTabButton);
            }

            initMonthYearSelectors();
            const monthSelect = document.getElementById('monthSelect');
            const yearSelect = document.getElementById('yearSelect');
            if (monthSelect) monthSelect.value = String(selectedMonth);
            if (yearSelect) yearSelect.value = String(selectedYear);
            renderMonthCalendar();

            requestAnimationFrame(() => {
                const target = document.querySelector(`.month-day-cell[data-date-key="${dateKey}"]`);
                if (target) {
                    target.scrollIntoView({ behavior:'smooth', block:'center' });
                    target.classList.add('schedule-jump-highlight');
                    setTimeout(() => target.classList.remove('schedule-jump-highlight'), 1600);
                }
                openModalDayContent(dateKey);
            });
        }

        function renderDelayedPanel() {
            const container = document.getElementById('delayedItemsContainer');
            if (!container) return;
            container.innerHTML = '';

            const metadata = getConcursosMetadata();
            const dateSchedule = metadata[currentConcurso]?.dateSchedule || {};
            const todayStr = getLocalDateKey();

            // A agenda e o calendário devem obedecer à MESMA regra de conclusão.
            // Um item concluído deixa imediatamente de ser considerado pendente/atrasado.
            const editalLookup = new Map(editalItems.map(item => [`${item.materia} - ${item.assunto}`, item]));
            const scheduleWithPending = Object.keys(dateSchedule).sort().map(dKey => ({
                date: dKey,
                items: getPendingScheduledItems(dateSchedule[dKey], editalLookup, dKey)
            }));

            const count = scheduleWithPending
                .filter(group => group.date < todayStr)
                .reduce((sum, group) => sum + group.items.length, 0);
            document.getElementById('delayedBadgeCount').textContent = `${count} atrasadas`;

            const displayList = scheduleWithPending.filter(group => {
                if (!group.items.length) return false;
                if (currentDelayedFilter === 'hoje') return group.date === todayStr;
                if (currentDelayedFilter === 'atrasadas') return group.date < todayStr;
                if (currentDelayedFilter === 'proximas') return group.date > todayStr;
                return false;
            });

            if (displayList.length === 0) {
                container.innerHTML = '<p style="opacity: 0.8; font-size:0.9rem;">Nenhum item agendado para esta aba.</p>';
                return;
            }

            let html = '';
            displayList.forEach(group => {
                const formattedDate = formatScheduleShortDate(group.date);
                const isLate = group.date < todayStr;
                const isToday = group.date === todayStr;
                const daysLate = isLate ? daysBetweenDateKeys(group.date, todayStr) : 0;
                const daysAhead = group.date > todayStr ? daysBetweenDateKeys(todayStr, group.date) : 0;
                const itemCountText = `${group.items.length} ${group.items.length === 1 ? 'matéria' : 'matérias'}`;

                let timingBadge = '';
                if (isLate) {
                    timingBadge = `<span class="delayed-day-late">${daysLate} ${daysLate === 1 ? 'dia de atraso' : 'dias de atraso'}</span>`;
                } else if (isToday) {
                    timingBadge = '<span class="delayed-day-late" style="color:#38bdf8;border-color:rgba(56,189,248,.35);background:rgba(56,189,248,.12);">Hoje</span>';
                } else {
                    timingBadge = `<span class="delayed-day-count">em ${daysAhead} ${daysAhead === 1 ? 'dia' : 'dias'}</span>`;
                }

                const openClass = isToday ? ' open' : '';
                let itemsHtml = '';
                group.items.forEach(it => {
                    itemsHtml += `
                        <div class="delayed-card">
                            <div class="delayed-card-info">
                                <p class="delayed-item-link" role="button" tabindex="0" title="Abrir este dia no cronograma" onclick="openScheduledDayFromDelayed('${group.date}', event)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openScheduledDayFromDelayed('${group.date}', event);}">${escapeHtml(formatScheduledItemForDisplay(it))}</p>
                                <span class="delayed-tag">${escapeHtml(currentConcurso)}</span>
                            </div>
                        </div>`;
                });

                html += `
                    <div class="delayed-day-group${openClass}">
                        <button type="button" class="delayed-day-summary" ondblclick="this.parentElement.classList.toggle('open')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.parentElement.classList.toggle('open');}" title="Duplo clique para expandir ou recolher">
                            <span class="delayed-day-summary-main">
                                <span class="delayed-day-date">${escapeHtml(formattedDate)}</span>
                                ${timingBadge}
                                <span class="delayed-day-count">${escapeHtml(itemCountText)}</span>
                            </span>
                            
                        </button>
                        <div class="delayed-day-content">${itemsHtml}</div>
                    </div>`;
            });

            container.innerHTML = html;
        }

        function scheduleBackgroundTask(task, timeout = 400) {
            const runner = () => Promise.resolve().then(task).catch(error => console.warn('Tarefa em segundo plano falhou:', error));
            if ('requestIdleCallback' in window) {
                window.requestIdleCallback(runner, { timeout });
            } else {
                window.setTimeout(runner, Math.min(timeout, 300));
            }
        }

        // Telemetria estritamente local de performance. Nada é enviado para servidores.
        window.__appPerformance = window.__appPerformance || { longTasks: [], measures: [] };
        function recordLocalPerformance(type, name, duration) {
            const bucket = type === 'longtask' ? window.__appPerformance.longTasks : window.__appPerformance.measures;
            bucket.push({ name: String(name || type), duration: Math.round(Number(duration) || 0), at: Date.now() });
            if (bucket.length > 40) bucket.splice(0, bucket.length - 40);
        }
        function measureLocalTask(name, fn) {
            const started = performance.now();
            try { return fn(); }
            finally {
                const elapsed = performance.now() - started;
                if (elapsed >= 16) recordLocalPerformance('measure', name, elapsed);
            }
        }
        if ('PerformanceObserver' in window) {
            try {
                const longTaskObserver = new PerformanceObserver(list => {
                    list.getEntries().forEach(entry => recordLocalPerformance('longtask', entry.name || 'longtask', entry.duration));
                });
                longTaskObserver.observe({ type: 'longtask', buffered: true });
            } catch (_) {}
        }

        async function loadData() {
            // MOBILE-FIRST: mostra imediatamente o que já está salvo no aparelho.
            loadLocalMetadata();
            loadLocalEditalData();
            ensureCurrentConcursoForUser();
            filterDataByConcurso();
            initMonthYearSelectors();
            renderMonthCalendar();
            loadNotesData();

            // Flashcards locais também aparecem antes de qualquer espera de rede.
            const localMetadata = getConcursosMetadata();
            const progressMigration = migrateStudySessionProgressV9663(localMetadata);
            if (progressMigration.changed) {
                editalItems = allEditalItems.filter(i => (i.concurso || 'Concurso Geral') === currentConcurso);
                renderTable();
                renderChartNow();
                renderMonthCalendar();
            }
            const retentionMigrated = ensureRetentionEngineForAllContests(localMetadata);
            if (retentionMigrated) {
                // Migração transparente: deriva o núcleo de retenção do histórico canônico
                // sem alterar cronograma/revisões atuais. Persistência ocorre em segundo plano.
                localStorage.setItem(getConcursosMetadataStorageKey(), JSON.stringify(localMetadata));
                metadataCache = localMetadata;
                setMetadataDirty(true);
                scheduleBackgroundTask(() => saveConcursosMetadata(localMetadata), 900);
            }
            flashcardsList = localMetadata[currentConcurso]?.flashcards || [];
            populateFcMateriaDropdown();
            renderFlashcardFolders();
            renderFlashcards();

            // A nuvem atualiza a interface depois, sem bloquear a primeira renderização.
            if (navigator.onLine && currentUser) {
                const loadUserId = currentUser.id;
                const loadGeneration = userContextGeneration;
                scheduleBackgroundTask(async () => {
                    if (!isAuthenticatedUserContextCurrent(loadUserId, loadGeneration)) return;
                    try {
                        await syncAllWithSupabase();
                    } catch (error) {
                        console.warn('Sincronização em segundo plano adiada:', error);
                    }
                }, 250);
            }
            scheduleLocalBackup('estado inicial carregado', 2200);
        }

        async function flushPendingConcursoDeletes() {
            if (!navigator.onLine || !currentUser) return;

            const pending = [...getSyncState().concursoDeletes];
            for (const concursoName of pending) {
                const editalResult = await runSupabaseRequest(() => supabaseClient
                    .from('edital')
                    .delete()
                    .eq('user_id', currentUser.id)
                    .eq('concurso', concursoName));
                throwIfSupabaseError(editalResult, `Falha ao excluir edital do concurso ${concursoName}`);

                const flashcardsResult = await runSupabaseRequest(() => supabaseClient
                    .from('flashcards')
                    .delete()
                    .eq('user_id', currentUser.id)
                    .eq('concurso', concursoName));
                throwIfSupabaseError(flashcardsResult, `Falha ao excluir flashcards do concurso ${concursoName}`);

                const latestState = getSyncState();
                latestState.concursoDeletes = latestState.concursoDeletes.filter(name => name !== concursoName);
                delete latestState.flashcardsDirty[concursoName];
                saveSyncState(latestState);
            }
        }

        async function syncAllWithSupabase() {
            if (!currentUser) return;
            cancelScheduledDeltaSyncs();
            const syncUserId = currentUser.id;
            const syncGeneration = userContextGeneration;
            if (syncPromise) return syncPromise;

            syncUiMode = 'syncing';
            updateSyncIndicator();
            syncPromise = (async () => {
                // Exclusões de concursos vêm primeiro para impedir que dados removidos
                // sejam baixados novamente antes da limpeza remota terminar.
                await flushPendingConcursoDeletes();
                if (!isAuthenticatedUserContextCurrent(syncUserId, syncGeneration)) return;
                await flushPendingEdital();
                if (!isAuthenticatedUserContextCurrent(syncUserId, syncGeneration)) return;
                const stateAfterEdital = getSyncState();
                if (Object.keys(stateAfterEdital.editalUpserts).length > 0 || stateAfterEdital.editalDeletes.length > 0) {
                    throw new Error('Ainda existem alterações do edital aguardando envio.');
                }

                const { data, error } = await runSupabaseRequest(() => supabaseClient
                    .from('edital')
                    .select('*')
                    .eq('user_id', syncUserId)
                    .order('prioridade', { ascending: true }));

                if (!isAuthenticatedUserContextCurrent(syncUserId, syncGeneration)) return;
                if (error) throw new Error(`Falha ao baixar edital: ${error.message}`);
                allEditalItems = (data || []).map(item => ({ ...item, id: String(item.id), concurso: item.concurso || 'Concurso Geral' }));
                saveEditalToLocalStorage();

                await loadConcursosMetadata();
                if (!isAuthenticatedUserContextCurrent(syncUserId, syncGeneration)) return;
                const syncedMetadata = getConcursosMetadata();
                const progressMigration = migrateStudySessionProgressV9663(syncedMetadata);
                if (progressMigration.changed) saveEditalToLocalStorage();
                if (ensureRetentionEngineForAllContests(syncedMetadata) || progressMigration.metadataChanged) await saveConcursosMetadata(syncedMetadata);
                if (!isAuthenticatedUserContextCurrent(syncUserId, syncGeneration)) return;
                await flushAllPendingFlashcards();
                if (!isAuthenticatedUserContextCurrent(syncUserId, syncGeneration)) return;
                ensureCurrentConcursoForUser();
                filterDataByConcurso();
                renderMonthCalendar();
                loadNotesData();
                await loadFlashcardsData();
            })();

            try {
                await syncPromise;
                if (!hasPendingSync()) setLastSuccessfulSyncNow();
            } finally {
                syncPromise = null;
                syncUiMode = 'idle';
                updateOnlineStatusBannerOnly();
                updateSyncIndicator();
            }
        }

        function updateOnlineStatusBannerOnly() {
            const banner = document.getElementById('offline-banner');
            if (!navigator.onLine) {
                banner.textContent = hasPendingSync()
                    ? 'Modo Offline — suas alterações estão protegidas e aguardam sincronização.'
                    : 'Modo Offline — os dados continuam disponíveis neste dispositivo.';
                banner.style.display = 'block';
            } else {
                banner.style.display = 'none';
            }
            updateSyncIndicator();
        }

        async function forceFullSync(evt) {
            if (!currentUser) return alert('Você precisa estar logado para sincronizar.');
            const btn = evt ? evt.target : null;
            if (btn) btn.innerText = 'Sincronizando...';
            syncUiMode = 'syncing';
            updateSyncIndicator();
            try {
                await syncAllWithSupabase();
                if (hasPendingSync()) throw new Error('Algumas alterações continuam aguardando conexão com o servidor.');
                alert('Sincronização concluída com sucesso!');
            } catch (err) {
                const message = isLikelyNetworkError(err)
                    ? 'O Supabase não respondeu após três tentativas. Seus dados continuam salvos neste dispositivo e permanecerão na fila. Aguarde alguns segundos e tente novamente.'
                    : err.message;
                alert('Erro ao sincronizar: ' + message);
            } finally {
                if (btn) btn.innerText = 'Sincronizar Agora';
                if (!syncPromise) syncUiMode = 'idle';
                updateSyncIndicator();
            }
        }

        function getEditalLocalStorageKey() {
            const uid = currentUser ? currentUser.id : 'guest';
            return `edital_offline_data_${uid}`;
        }

        function loadLocalEditalData() {
            const local = localStorage.getItem(getEditalLocalStorageKey());
            if (local) {
                try {
                    allEditalItems = JSON.parse(local).map(item => ({ ...item, id: String(item.id), concurso: item.concurso || 'Concurso Geral' }));
                } catch(e) { allEditalItems = []; }
            }
        }

        function saveEditalToLocalStorage() {
            localStorage.setItem(getEditalLocalStorageKey(), JSON.stringify(allEditalItems));
            scheduleLocalBackup('alteração no edital verticalizado');
        }

        async function saveEditalItemToCloud(item) {
            // Delta sync: grava imediatamente no aparelho e agrupa alterações rápidas.
            saveEditalToLocalStorage();
            queueEditalUpsert(item);
            if (navigator.onLine && currentUser) scheduleEditalSync();
        }

        async function deleteEditalItemFromCloud(id) {
            allEditalItems = allEditalItems.filter(i => String(i.id) !== String(id));
            saveEditalToLocalStorage();
            queueEditalDelete(id);
            if (navigator.onLine && currentUser) scheduleEditalSync();
            filterDataByConcurso();
        }

        async function flushPendingEdital() {
            if (!navigator.onLine || !currentUser) return;
            const initialState = getSyncState();

            for (const deleteBatch of chunkArray([...initialState.editalDeletes], 100)) {
                const result = await runSupabaseRequest(() => supabaseClient.from('edital').delete()
                    .in('id', deleteBatch)
                    .eq('user_id', currentUser.id));
                throwIfSupabaseError(result, 'Falha ao sincronizar exclusões do edital');
                const latestState = getSyncState();
                const confirmedIds = new Set(deleteBatch.map(String));
                latestState.editalDeletes = latestState.editalDeletes.filter(id => !confirmedIds.has(String(id)));
                saveSyncState(latestState);
            }

            const pendingItems = Object.values(initialState.editalUpserts);
            if (pendingItems.length > 0) {
                for (const sourceBatch of chunkArray(pendingItems, 50)) {
                    const payloadBatch = sourceBatch.map(item => ({
                        id: String(item.id),
                        user_id: currentUser.id,
                        materia: item.materia || 'Geral',
                        assunto: item.assunto || 'Tópico',
                        prioridade: parseInt(item.prioridade) || 1,
                        assunto_prioridade: parseInt(item.assunto_prioridade) || 1,
                        concurso: item.concurso || currentConcurso,
                        teoria: !!item.teoria,
                        questoes: !!item.questoes,
                        rev_24h: !!item.rev_24h,
                        rev_7d: !!item.rev_7d,
                        rev_30d: !!item.rev_30d
                    }));
                    const result = await runSupabaseRequest(() => supabaseClient.from('edital').upsert(payloadBatch, { onConflict: 'id' }));
                    throwIfSupabaseError(result, 'Falha ao sincronizar alterações do edital');
                    const latestState = getSyncState();
                    sourceBatch.forEach(item => {
                        const id = String(item.id);
                        if (JSON.stringify(latestState.editalUpserts[id]) === JSON.stringify(item)) {
                            delete latestState.editalUpserts[id];
                        }
                    });
                    saveSyncState(latestState);
                }
            }
        }

        function isSystemConcurso(nome) {
            return String(nome || '').trim().toLowerCase() === 'concurso geral';
        }

        function hasRealCurrentConcurso() {
            return !!String(currentConcurso || '').trim() && !isSystemConcurso(currentConcurso);
        }

        function updateConcursoActionState() {
            const hasRealConcurso = !!currentConcurso && !isSystemConcurso(currentConcurso);
            const renameBtn = document.getElementById('btnRenomearConcurso');
            const deleteBtn = document.getElementById('btnExcluirConcurso');
            const badge = document.getElementById('countdownBadge');

            if (renameBtn) {
                renameBtn.disabled = !hasRealConcurso;
                renameBtn.title = hasRealConcurso ? 'Renomear concurso atual' : 'Crie ou selecione um concurso para renomear';
            }
            if (deleteBtn) {
                deleteBtn.disabled = !hasRealConcurso;
                deleteBtn.title = hasRealConcurso ? 'Excluir concurso atual' : 'Crie ou selecione um concurso para excluir';
            }
            if (badge) {
                badge.classList.toggle('disabled', !hasRealConcurso);
                badge.style.pointerEvents = hasRealConcurso ? '' : 'none';
                badge.style.opacity = hasRealConcurso ? '' : '0.55';
                badge.title = hasRealConcurso ? 'Clique para alterar a data da prova' : 'Crie ou selecione um concurso';
            }
        }

        function renderConcursoSelector() {
            const select = document.getElementById('concursoSelect');
            select.innerHTML = '';
            const metadata = getConcursosMetadata();
            const set = new Set();

            Object.keys(metadata).forEach(nome => { if (!isSystemConcurso(nome)) set.add(nome); });
            allEditalItems.forEach(i => {
                const nome = i.concurso || 'Concurso Geral';
                if (!isSystemConcurso(nome)) set.add(nome);
            });

            const list = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
            const currentVisible = list.includes(currentConcurso);

            if (!currentVisible) {
                const placeholder = document.createElement('option');
                placeholder.value = '';
                placeholder.textContent = list.length ? 'Selecione um concurso...' : 'Crie um concurso para começar';
                placeholder.selected = true;
                placeholder.disabled = true;
                select.appendChild(placeholder);
            }

            list.forEach(c => {
                const option = document.createElement('option');
                option.value = c;
                option.textContent = c;
                option.selected = c === currentConcurso;
                select.appendChild(option);
            });

            updateConcursoActionState();
            updateCountdownBadge();
        }

        function changeConcurso(val) {
            if (!val) return;
            currentConcurso = val;
            setLastStudiedConcurso(currentConcurso);
            filterDataByConcurso();
            renderMonthCalendar();
            loadNotesData();
            loadFlashcardsData();
        }

        function filterDataByConcurso() {
            editalItems = allEditalItems.filter(i => (i.concurso || 'Concurso Geral') === currentConcurso);
            renderConcursoSelector();
            document.getElementById('edital-title').innerText = `Edital: ${currentConcurso}`;
            populateFcMateriaDropdown();
            populateNotesMateriaDropdowns();
            renderTable();
            renderChart();
            renderPomodoroDailyCounter();
        }

        function openModalNovoConcurso() { document.getElementById('modalNovoConcurso').style.display = 'flex'; }
        function closeModalNovoConcurso() { document.getElementById('modalNovoConcurso').style.display = 'none'; }

        async function confirmarNovoConcurso() {
            const nome = document.getElementById('inputNomeConcurso').value.trim();
            const dataProva = document.getElementById('inputDataConcurso').value;
            if (!nome) return alert('Informe o nome do concurso.');

            let metadata = getConcursosMetadata();
            metadata[nome] = { dataProva: dataProva || null, dateSchedule: {} };
            await saveConcursosMetadata(metadata);

            currentConcurso = nome;
            setLastStudiedConcurso(currentConcurso);
            document.getElementById('inputNomeConcurso').value = '';
            document.getElementById('inputDataConcurso').value = '';
            closeModalNovoConcurso();
            changeConcurso(currentConcurso);
        }

        async function renomearConcursoAtual() {
            if (!hasRealCurrentConcurso()) {
                await appNotice('Crie ou selecione um concurso antes de renomear.', { title:'Renomear concurso' });
                return;
            }

            const antigoNome = currentConcurso;
            const novoNome = await appPrompt({
                title:'Renomear concurso',
                label:'Novo nome do concurso',
                value:antigoNome,
                maxLength:140,
                confirmText:'Renomear'
            });
            if (novoNome === null) return;
            const nomeFormatado = String(novoNome).trim();
            if (!nomeFormatado || nomeFormatado === antigoNome) return;

            let metadata = getConcursosMetadata();
            const nomeJaExiste = Object.keys(metadata).some(nome => nome !== antigoNome && nome.localeCompare(nomeFormatado,'pt-BR',{sensitivity:'base'}) === 0)
                || allEditalItems.some(item => (item.concurso || 'Concurso Geral') !== antigoNome && String(item.concurso || '').localeCompare(nomeFormatado,'pt-BR',{sensitivity:'base'}) === 0);
            if (nomeJaExiste) {
                await appNotice('Já existe um concurso cadastrado com esse nome.', { title:'Renomear concurso' });
                return;
            }

            metadata[nomeFormatado] = metadata[antigoNome] || { dataProva: null, dateSchedule: {} };
            delete metadata[antigoNome];
            await saveConcursosMetadata(metadata);

            const oldFileKey = `edital_file_${currentUser ? currentUser.id : 'guest'}_${antigoNome}`;
            const newFileKey = `edital_file_${currentUser ? currentUser.id : 'guest'}_${nomeFormatado}`;
            await moveEditalFileRecord(oldFileKey, newFileKey);

            allEditalItems.forEach(item => {
                if ((item.concurso || 'Concurso Geral') === antigoNome) {
                    item.concurso = nomeFormatado;
                    queueEditalUpsert(item);
                }
            });
            saveEditalToLocalStorage();
            setFlashcardsDirty(true, antigoNome);
            setFlashcardsDirty(true, nomeFormatado);

            currentConcurso = nomeFormatado;
            setLastStudiedConcurso(currentConcurso);
            changeConcurso(currentConcurso);
            if (navigator.onLine && currentUser) syncAllWithSupabase().catch(error => console.warn('Renomeação aguardando sincronização:', error));
            await appNotice(`Concurso renomeado para "${nomeFormatado}".`, { title:'Concurso atualizado' });
        }

        async function removerConcursoAtual(btn = null) {
            if (!hasRealCurrentConcurso()) {
                await appNotice('Crie ou selecione um concurso antes de excluir.', { title:'Excluir concurso' });
                return;
            }

            const concursoRemovido = currentConcurso;
            const first = await appConfirm(
                `Deseja excluir o concurso "${concursoRemovido}"? Esta ação remove matérias, assuntos, cronograma e dados vinculados ao concurso.`,
                { title:'Excluir concurso', confirmText:'Continuar', danger:true }
            );
            if (!first) return;
            const second = await appConfirm(
                `Confirma a exclusão definitiva do concurso "${concursoRemovido}" deste aplicativo?`,
                { title:'Confirmação final', confirmText:'Excluir concurso', danger:true }
            );
            if (!second) return;

            const originalButtonText = btn ? btn.textContent : '';
            if (btn) { btn.disabled = true; btn.textContent = 'Excluindo...'; }

            try {
                queueConcursoDelete(concursoRemovido);
                const idsRemovidos = allEditalItems
                    .filter(item => (item.concurso || 'Concurso Geral') === concursoRemovido)
                    .map(item => String(item.id));
                const syncState = getSyncState();
                idsRemovidos.forEach(id => {
                    delete syncState.editalUpserts[id];
                    if (!syncState.editalDeletes.includes(id)) syncState.editalDeletes.push(id);
                });
                saveSyncState(syncState);

                allEditalItems = allEditalItems.filter(item => (item.concurso || 'Concurso Geral') !== concursoRemovido);
                saveEditalToLocalStorage();

                const metadata = getConcursosMetadata();
                delete metadata[concursoRemovido];
                metadataCache = metadata;
                localStorage.setItem(getConcursosMetadataStorageKey(), JSON.stringify(metadata));
                setMetadataDirty(true);

                deleteEditalFileRecord(getEditalFileStorageKey(concursoRemovido))
                    .catch(error => console.warn('Anexo local será removido posteriormente:', error));

                const remaining = Object.keys(metadata).filter(nome => !isSystemConcurso(nome));
                currentConcurso = remaining[0] || 'Concurso Geral';
                setLastStudiedConcurso(currentConcurso);
                filterDataByConcurso();
                renderMonthCalendar();
                updateModernOverview();
                renderRetentionDiagnostics();

                if (navigator.onLine && currentUser) {
                    scheduleBackgroundTask(async () => {
                        try { await syncAllWithSupabase(); }
                        catch (error) { console.warn(`Exclusão de "${concursoRemovido}" mantida na fila:`, error); updateOnlineStatusBannerOnly(); }
                    }, 50);
                }

                await appNotice(`Concurso "${concursoRemovido}" removido. A sincronização com a nuvem continuará automaticamente quando necessário.`, { title:'Concurso excluído' });
            } catch (error) {
                console.error('Falha ao excluir concurso:', error);
                await appNotice('Não foi possível concluir a exclusão local: ' + error.message, { title:'Falha ao excluir' });
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = originalButtonText || 'Excluir'; }
            }
        }

        async function excluirMateriaEspecifica() {
            const materias = getUniqueMateriasFromEdital();
            if (materias.length === 0) return alert('Não há matérias cadastradas para excluir.');
            const listaFormatada = materias.map((m, idx) => `${idx + 1}. ${m}`).join('\n');
            const resposta = prompt(`Digite o NÚMERO ou o NOME exato da matéria que deseja excluir:\n\n${listaFormatada}`);
            if (!resposta || !resposta.trim()) return;

            let materiaParaExcluir = null;
            const numIndex = parseInt(resposta.trim()) - 1;
            if (!isNaN(numIndex) && numIndex >= 0 && numIndex < materias.length) materiaParaExcluir = materias[numIndex];
            else materiaParaExcluir = materias.find(m => m.toLowerCase() === resposta.trim().toLowerCase());

            if (!materiaParaExcluir) return alert('Matéria não encontrada.');
            if (confirm(`Tem certeza de que deseja excluir a matéria "${materiaParaExcluir}" e TODOS os seus assuntos?`)) {
                const itemsToDelete = editalItems.filter(i => i.materia === materiaParaExcluir);
                for (let item of itemsToDelete) await deleteEditalItemFromCloud(item.id);
                filterDataByConcurso();
                alert(`A matéria "${materiaParaExcluir}" foi excluída com sucesso!`);
            }
        }

        let draggedMateriaName = null;
        let materiaPointerState = null;
        let suppressMateriaClickUntil = 0;
        let materiaGlobalDragHandlersBound = false;

        function getStoredMateriaOrder() {
            const metadata = getConcursosMetadata();
            const order = metadata[currentConcurso]?.materiaOrder;
            return Array.isArray(order) ? order : [];
        }

        function buildDisplayedMateriaOrder(materiasMap) {
            const names = Object.keys(materiasMap);
            if (!names.length) return [];

            // Regra canônica de exibição:
            // 1) a prioridade da matéria é sempre soberana: P1, P2, P3, P4;
            // 2) a ordem manual é preservada apenas ENTRE matérias da mesma prioridade;
            // 3) matérias novas, ainda ausentes de materiaOrder, entram ao fim do seu próprio bloco de prioridade.
            const stored = getStoredMateriaOrder().filter(name => names.includes(name));
            const storedIndex = new Map(stored.map((name, index) => [name, index]));
            const naturalIndex = new Map(names.map((name, index) => [name, index]));

            return [...names].sort((a, b) => {
                const pa = clampMateriaPriority(materiasMap[a]?.prioridade || 1);
                const pb = clampMateriaPriority(materiasMap[b]?.prioridade || 1);
                if (pa !== pb) return pa - pb;

                const aStored = storedIndex.has(a);
                const bStored = storedIndex.has(b);
                if (aStored && bStored) return storedIndex.get(a) - storedIndex.get(b);
                if (aStored !== bStored) return aStored ? -1 : 1;
                return naturalIndex.get(a) - naturalIndex.get(b);
            });
        }

        async function persistMateriaOrder(order) {
            const metadata = getConcursosMetadata();
            if (!metadata[currentConcurso]) metadata[currentConcurso] = {};
            metadata[currentConcurso].materiaOrder = [...order];
            await saveConcursosMetadata(metadata);
        }

        function clampMateriaPriority(value) {
            const parsed = parseInt(value, 10);
            if (!Number.isFinite(parsed)) return 1;
            return Math.min(4, Math.max(1, parsed));
        }

        function getMateriaPriority(materiaName) {
            const item = editalItems.find(entry => entry.materia === materiaName);
            return clampMateriaPriority(item?.prioridade ?? 1);
        }

        async function applyMateriaPriority(materiaName, priority) {
            const normalizedPriority = clampMateriaPriority(priority);
            const affected = editalItems.filter(item => item.materia === materiaName);
            affected.forEach(item => { item.prioridade = normalizedPriority; });
            await Promise.all(affected.map(item => saveEditalItemToCloud(item)));
            return normalizedPriority;
        }

        async function moveMateriaToPosition(sourceName, targetName, placeAfter = false) {
            if (!sourceName || !targetName || sourceName === targetName) return;
            const materiasMap = {};
            editalItems.forEach(item => {
                const mat = item.materia || 'Geral';
                if (!materiasMap[mat]) materiasMap[mat] = { prioridade: item.prioridade || 1 };
            });
            const order = buildDisplayedMateriaOrder(materiasMap);
            const sourceIndex = order.indexOf(sourceName);
            const targetIndexBefore = order.indexOf(targetName);
            if (sourceIndex < 0 || targetIndexBefore < 0) return;

            // A matéria movida herda a prioridade da matéria de destino. A posição manual permanece independente.
            const targetPriority = getMateriaPriority(targetName);
            order.splice(sourceIndex, 1);
            let targetIndex = order.indexOf(targetName);
            if (placeAfter) targetIndex += 1;
            order.splice(targetIndex, 0, sourceName);

            await applyMateriaPriority(sourceName, targetPriority);
            await persistMateriaOrder(order);
            filterDataByConcurso();
        }

        function handleMateriaHeaderClick(event, materiaName) {
            if (Date.now() < suppressMateriaClickUntil) {
                event?.preventDefault?.();
                event?.stopPropagation?.();
                return;
            }
            toggleMateria(materiaName);
        }

        function cleanupMateriaDragVisuals() {
            document.querySelectorAll('.materia-header-row.materia-dragging,.materia-header-row.materia-drop-before,.materia-header-row.materia-drop-after').forEach(r => {
                r.classList.remove('materia-dragging','materia-drop-before','materia-drop-after');
            });
            document.querySelectorAll('.materia-drag-ghost').forEach(el => el.remove());
            document.body.classList.remove('materia-touch-dragging');
        }

        function createMateriaDragGhost(state, clientX, clientY) {
            const rect = state.sourceRow.getBoundingClientRect();
            const ghost = document.createElement('div');
            ghost.className = 'materia-drag-ghost';
            ghost.textContent = state.sourceName;
            const width = Math.min(rect.width, Math.max(260, window.innerWidth - 24));
            ghost.style.width = `${width}px`;
            ghost.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
            ghost.style.top = `${Math.max(8, clientY - Math.min(rect.height / 2, 32))}px`;
            document.body.appendChild(ghost);
            state.ghost = ghost;
            state.ghostOffsetY = Math.min(rect.height / 2, 32);
        }

        function positionMateriaGhost(state, clientY) {
            if (!state?.ghost) return;
            const ghostRect = state.ghost.getBoundingClientRect();
            const maxTop = Math.max(8, window.innerHeight - ghostRect.height - 8);
            const top = Math.max(8, Math.min(clientY - (state.ghostOffsetY || 28), maxTop));
            state.ghost.style.top = `${top}px`;
        }

        function updateMateriaDropTarget(state, clientX, clientY) {
            document.querySelectorAll('.materia-header-row.materia-drop-before,.materia-header-row.materia-drop-after').forEach(r => {
                r.classList.remove('materia-drop-before','materia-drop-after');
            });
            const hit = document.elementFromPoint(clientX, clientY)?.closest?.('#edital-list .materia-header-row');
            if (!hit) return;
            state.targetRow = hit;
            const rect = hit.getBoundingClientRect();
            state.placeAfter = clientY > rect.top + rect.height / 2;
            hit.classList.add(state.placeAfter ? 'materia-drop-after' : 'materia-drop-before');
        }

        function autoScrollMateriaDrag(clientY) {
            const edge = Math.min(110, Math.max(70, window.innerHeight * .12));
            if (clientY < edge) {
                const speed = Math.max(5, Math.round((edge - clientY) / 5));
                window.scrollBy({ top: -speed, behavior: 'auto' });
            } else if (clientY > window.innerHeight - edge) {
                const speed = Math.max(5, Math.round((clientY - (window.innerHeight - edge)) / 5));
                window.scrollBy({ top: speed, behavior: 'auto' });
            }
        }

        function activateMateriaPointerDrag(state, event) {
            if (!state || state.active) return;
            state.active = true;
            draggedMateriaName = state.sourceName;
            state.sourceRow.classList.add('materia-dragging');
            document.body.classList.add('materia-touch-dragging');
            suppressMateriaClickUntil = Date.now() + 900;
            try { state.sourceRow.setPointerCapture(state.pointerId); } catch (_) {}
            createMateriaDragGhost(state, event?.clientX ?? state.startX, event?.clientY ?? state.startY);
            updateMateriaDropTarget(state, event?.clientX ?? state.startX, event?.clientY ?? state.startY);
            if (state.pointerType !== 'mouse' && navigator.vibrate) navigator.vibrate(18);
        }

        async function finishMateriaPointerDrag(event, cancelled = false) {
            const state = materiaPointerState;
            if (!state || (event && state.pointerId !== event.pointerId)) return;
            clearTimeout(state.timer);
            materiaPointerState = null;
            if (!state.active) return;

            event?.preventDefault?.();
            event?.stopPropagation?.();
            const targetName = decodeURIComponent(state.targetRow?.dataset?.materia || '');
            const sourceName = state.sourceName;
            const placeAfter = !!state.placeAfter;
            draggedMateriaName = null;
            suppressMateriaClickUntil = Date.now() + 800;
            cleanupMateriaDragVisuals();
            try { state.sourceRow.releasePointerCapture(state.pointerId); } catch (_) {}
            if (!cancelled && targetName && targetName !== sourceName) {
                await moveMateriaToPosition(sourceName, targetName, placeAfter);
            }
        }

        function ensureMateriaGlobalDragHandlers() {
            if (materiaGlobalDragHandlersBound) return;
            materiaGlobalDragHandlersBound = true;

            document.addEventListener('pointermove', event => {
                const state = materiaPointerState;
                if (!state || state.pointerId !== event.pointerId) return;
                const dx = event.clientX - state.startX;
                const dy = event.clientY - state.startY;
                const distance = Math.hypot(dx, dy);

                if (!state.active) {
                    if (state.pointerType === 'mouse') {
                        if (distance < 4) return;
                        activateMateriaPointerDrag(state, event);
                    } else {
                        // Antes do long-press, um gesto vertical normal continua rolando a página.
                        if (distance > 11) {
                            clearTimeout(state.timer);
                            materiaPointerState = null;
                            return;
                        }
                        return;
                    }
                }

                event.preventDefault();
                positionMateriaGhost(state, event.clientY);
                updateMateriaDropTarget(state, event.clientX, event.clientY);
                autoScrollMateriaDrag(event.clientY);
            }, { passive:false, capture:true });

            document.addEventListener('pointerup', event => finishMateriaPointerDrag(event, false), { capture:true });
            document.addEventListener('pointercancel', event => finishMateriaPointerDrag(event, true), { capture:true });
        }

        function bindMateriaPointerReorder() {
            ensureMateriaGlobalDragHandlers();
            document.querySelectorAll('#edital-list .materia-header-row').forEach(row => {
                if (row.dataset.dragBound === '1') return;
                row.dataset.dragBound = '1';
                row.addEventListener('pointerdown', event => {
                    if (event.button !== undefined && event.button !== 0) return;
                    if (event.target.closest('input,button,select,a,label')) return;
                    const sourceName = decodeURIComponent(row.dataset.materia || '');
                    if (!sourceName) return;

                    const state = {
                        sourceRow: row,
                        sourceName,
                        pointerId: event.pointerId,
                        pointerType: event.pointerType || 'mouse',
                        startX: event.clientX,
                        startY: event.clientY,
                        active: false,
                        targetRow: row,
                        placeAfter: false,
                        timer: null,
                        ghost: null
                    };
                    materiaPointerState = state;

                    if (state.pointerType !== 'mouse') {
                        // Long-press curto: rápido o bastante para parecer imediato, mas sem bloquear o scroll normal.
                        state.timer = setTimeout(() => {
                            if (materiaPointerState === state) activateMateriaPointerDrag(state, event);
                        }, 220);
                    }
                }, { passive:true });
            });
        }

        function exportMateriasConteudos() {
            const groups = {};
            editalItems.forEach(item => {
                const materia = item.materia || 'Geral';
                if (!groups[materia]) groups[materia] = [];
                groups[materia].push(item);
            });
            const order = buildDisplayedMateriaOrder(Object.fromEntries(Object.entries(groups).map(([name, items]) => [name, { prioridade: items[0]?.prioridade || 1 }])));
            const materias = order.map(materia => {
                const items = [...(groups[materia] || [])].sort((a,b) => (a.assunto_prioridade || 1) - (b.assunto_prioridade || 1));
                return {
                    materia,
                    prioridade: clampMateriaPriority(items[0]?.prioridade || 1),
                    assuntos: items.map(item => ({
                        nome: item.assunto,
                        prioridade: item.assunto_prioridade || 1
                    }))
                };
            });
            if (!materias.length) return alert('Não há matérias para exportar neste concurso.');
            const payload = {
                tipo: 'painel_estudos_materias',
                versao: 1,
                origemConcurso: currentConcurso,
                exportadoEm: new Date().toISOString(),
                materiaOrder: order,
                materias
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const safeContest = String(currentConcurso || 'concurso').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'');
            a.href = url;
            a.download = `materias_${safeContest || 'concurso'}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 500);
        }

        function renderTable() {
            const __renderStarted = performance.now();
            renderAdaptiveEditalHeader();
            const tbody = document.getElementById('edital-list');
            const htmlParts = [];
            const materiasMap = {};
            editalItems.forEach(item => {
                const mat = item.materia || 'Geral';
                const itemPriority = clampMateriaPriority(item.prioridade || 1);
                if (!materiasMap[mat]) materiasMap[mat] = { items: [], prioridade: itemPriority };
                else materiasMap[mat].prioridade = Math.min(clampMateriaPriority(materiasMap[mat].prioridade), itemPriority);
                materiasMap[mat].items.push(item);
            });

            const sortedMaterias = buildDisplayedMateriaOrder(materiasMap);

            sortedMaterias.forEach(materiaName => {
                const group = materiasMap[materiaName];
                const isOpen = openMaterias[materiaName] === true;
                const totalChecksMateria = Math.max(1, group.items.length * 2);
                const doneChecksMateria = group.items.reduce((sum, topic) => sum + ['teoria','questoes'].filter(key => !!topic[key]).length, 0);
                const materiaPct = Math.round((doneChecksMateria / totalChecksMateria) * 100);
                const colorIdx = getMateriaColorIndex(materiaName, sortedMaterias);
                const safeMateriaHandler = encodeHandlerValue(materiaName);

                const activeRevisionOffsets = getActiveRevisionOffsets();
                const dynamicColspan = 4 + activeRevisionOffsets.length;
                htmlParts.push(`
                    <tr class="materia-header-row" data-materia="${safeMateriaHandler}" style="background: ${PALETA_CORES_MATERIAS[colorIdx % PALETA_CORES_MATERIAS.length]};" onclick="handleMateriaHeaderClick(event, decodeURIComponent('${safeMateriaHandler}'))">
                        <td onclick="event.stopPropagation()">
                            <input type="number" class="priority-input" value="${clampMateriaPriority(group.prioridade)}" min="1" max="4" step="1" onchange="updateMateriaPriority(decodeURIComponent('${safeMateriaHandler}'), this.value)" title="Prioridade da disciplina (1 a 4)">
                        </td>
                        <td colspan="${dynamicColspan}">
                            <div class="materia-header-content">
                                <span class="materia-header-main">
                                    <strong class="materia-header-title">${escapeHtml(materiaName)}</strong>
                                    <span class="materia-header-meta">${group.items.length} assuntos · Prioridade ${clampMateriaPriority(group.prioridade)}<span class="materia-drag-hint">segure e arraste para mover</span></span>
                                </span>
                                <span class="materia-header-right">
                                    <span class="materia-progress-ring" style="--pct:${materiaPct}"><span>${materiaPct}%</span></span>
                                    <span class="materia-expand-label">${isOpen ? 'Recolher' : 'Expandir'}</span>
                                </span>
                            </div>
                        </td>
                    </tr>
                `);

                if (isOpen) {
                    const sortedAssuntos = [...group.items].sort((a, b) => (a.assunto_prioridade || 1) - (b.assunto_prioridade || 1));
                    sortedAssuntos.forEach(item => {
                        const safeId = encodeHandlerValue(item.id);
                        const revisionCells = activeRevisionOffsets.map(offset => {
                            const checked = getAdaptiveRevisionCompletion(item, offset);
                            return `<td data-study-control="true"><span class="revision-model-note">${offset}d</span><input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleAdaptiveRevision(decodeURIComponent('${safeId}'), ${offset}, ${checked})"></td>`;
                        }).join('');
                        htmlParts.push(`
                            <tr class="adaptive-edital-row" style="--control-count:${2 + activeRevisionOffsets.length}; border-left: 4px solid ${PALETA_SOLIDAS[colorIdx % PALETA_SOLIDAS.length]};">
                                <td>
                                    <input type="number" class="priority-input" value="${item.assunto_prioridade || 1}" min="1" onchange="updateAssuntoPriority(decodeURIComponent('${safeId}'), this.value)" title="Prioridade do Assunto">
                                </td>
                                <td style="text-align: left; padding-left: 1.5rem;">${escapeHtml(item.assunto)}${getTopicStudyPlanBadgeHtml(item, getConcursosMetadata()[currentConcurso] || {})}</td>
                                <td data-study-control="true"><span class="revision-model-note">Teoria</span><input type="checkbox" ${item.teoria ? 'checked' : ''} onchange="toggleCheck(decodeURIComponent('${safeId}'), 'teoria', ${item.teoria})"></td>
                                <td data-study-control="true"><span class="revision-model-note">Questões</span><input type="checkbox" ${item.questoes ? 'checked' : ''} onchange="toggleCheck(decodeURIComponent('${safeId}'), 'questoes', ${item.questoes})"></td>
                                ${revisionCells}
                                <td><button class="btn btn-danger btn-sm" onclick="clearRowCheckboxes(decodeURIComponent('${safeId}'))">Limpar</button></td>
                            </tr>
                        `);
                    });
                }
            });
            tbody.innerHTML = htmlParts.join('');
            bindMateriaPointerReorder();
            const __renderDuration = performance.now() - __renderStarted;
            if (__renderDuration >= 16) recordLocalPerformance('measure', 'renderTable', __renderDuration);
        }

        function toggleMateria(materiaName) { openMaterias[materiaName] = !openMaterias[materiaName]; renderTable(); }
        function toggleAllAccordions(open) { editalItems.forEach(i => openMaterias[i.materia] = open); renderTable(); }

        async function updateMateriaPriority(materiaName, newPriority) {
            const val = clampMateriaPriority(newPriority);
            await applyMateriaPriority(materiaName, val);
            filterDataByConcurso();
        }

        async function updateAssuntoPriority(id, newPriority) {
            const val = parseInt(newPriority) || 1;
            const item = allEditalItems.find(i => String(i.id) === String(id));
            if (item) {
                item.assunto_prioridade = val;
                await saveEditalItemToCloud(item);
                filterDataByConcurso();
            }
        }

        async function toggleCheck(id, field, currentValue) {
            const item = allEditalItems.find(i => String(i.id) === String(id));
            if (item) {
                if (field === 'teoria' && !currentValue) {
                    const progress = getTopicStudyPlanProgress(item, getConcursosMetadata()[currentConcurso] || {});
                    if (progress && !progress.complete) {
                        await appNotice('Este assunto possui um plano de Teoria ainda em andamento. Conclua os blocos/minutos/aulas planejados ou remova o plano antes de marcar a Teoria como concluída.', { title:'Plano de estudo em andamento' });
                        filterDataByConcurso();
                        return;
                    }
                }
                item[field] = !currentValue;
                await saveEditalItemToCloud(item);
                filterDataByConcurso();
                renderMonthCalendar();
            }
        }

        async function clearRowCheckboxes(id) {
            const item = allEditalItems.find(i => String(i.id) === String(id));
            if (item) {
                item.teoria = false; item.questoes = false; item.rev_24h = false; item.rev_7d = false; item.rev_30d = false;
                const metadata = getConcursosMetadata();
                const contest = metadata[currentConcurso] || (metadata[currentConcurso] = {});
                if (contest.adaptiveRevisionProgress) delete contest.adaptiveRevisionProgress[String(item.id)];
                await Promise.all([saveEditalItemToCloud(item), saveConcursosMetadata(metadata)]);
                filterDataByConcurso();
                renderMonthCalendar();
            }
        }

        async function addManualItem(e) {
            e.preventDefault();
            const materia = document.getElementById('materia').value.trim();
            const assunto = document.getElementById('assunto').value.trim();
            const prioridade = parseInt(document.getElementById('prioridade').value) || 1;

            const newItem = {
                id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
                materia, assunto, prioridade: clampMateriaPriority(prioridade), assunto_prioridade: 1, peso: 5 - clampMateriaPriority(prioridade), concurso: currentConcurso,
                user_id: currentUser ? currentUser.id : null,
                teoria: false, questoes: false, rev_24h: false, rev_7d: false, rev_30d: false
            };

            allEditalItems.push(newItem);
            openMaterias[materia] = true;
            await saveEditalItemToCloud(newItem);
            document.getElementById('materia').value = '';
            document.getElementById('assunto').value = '';
            filterDataByConcurso();
        }

        async function clearData() {
            if (!hasRealCurrentConcurso()) {
                await appNotice('Selecione um concurso real antes de limpar o edital.', { title:'Limpar Edital Atual' });
                return;
            }

            const concursoAlvo = currentConcurso;
            const toRemove = allEditalItems.filter(i => (i.concurso || 'Concurso Geral') === concursoAlvo);
            const count = toRemove.length;
            if (!count) {
                await appNotice('O edital atual já está vazio.', { title:'Limpar Edital Atual' });
                return;
            }

            const first = await appConfirm(
                `Você está prestes a apagar ${count} tópico${count===1?'':'s'} do edital "${concursoAlvo}". Matérias e assuntos deste concurso serão removidos.`,
                { title:'Limpar Edital Atual', confirmText:'Continuar', danger:true }
            );
            if (!first) return;

            const second = await appConfirm(
                `Confirma a exclusão completa do edital "${concursoAlvo}"? O histórico de estudo já registrado será preservado, mas os tópicos do edital não poderão ser recuperados pelo botão Voltar.`,
                { title:'Confirmação final', confirmText:'Apagar edital', danger:true }
            );
            if (!second) return;

            const ids = toRemove.map(item => String(item.id));
            const idSet = new Set(ids);

            // Primeiro aplica a exclusão localmente em uma única operação. Isso garante resposta
            // imediata inclusive offline; a fila de sincronização cuida do Supabase depois.
            allEditalItems = allEditalItems.filter(item => !idSet.has(String(item.id)));
            const syncState = getSyncState();
            ids.forEach(id => {
                delete syncState.editalUpserts[id];
                if (!syncState.editalDeletes.includes(id)) syncState.editalDeletes.push(id);
            });
            saveSyncState(syncState);
            saveEditalToLocalStorage();

            // Remove somente metadados derivados dos tópicos apagados. Horas/sessões históricas
            // permanecem intactas, pois studySessions é a fonte canônica do tempo estudado.
            const metadata = getConcursosMetadata();
            const contest = metadata[concursoAlvo];
            if (contest) {
                if (contest.adaptiveRevisionProgress) {
                    ids.forEach(id => delete contest.adaptiveRevisionProgress[id]);
                }
                if (contest.topicStudyPlans) {
                    ids.forEach(id => delete contest.topicStudyPlans[id]);
                }
                await saveConcursosMetadata(metadata);
            }

            filterDataByConcurso();
            renderMonthCalendar();
            updateModernOverview();
            renderRetentionDiagnostics?.();
            updateSyncIndicator();

            let cloudPending = false;
            if (navigator.onLine && currentUser) {
                try {
                    for (const batch of chunkArray(ids, 100)) {
                        const result = await runSupabaseRequest(() => supabaseClient.from('edital').delete()
                            .in('id', batch)
                            .eq('user_id', currentUser.id));
                        throwIfSupabaseError(result, 'Falha ao excluir edital no servidor');

                        const latest = getSyncState();
                        const confirmed = new Set(batch.map(String));
                        latest.editalDeletes = latest.editalDeletes.filter(id => !confirmed.has(String(id)));
                        saveSyncState(latest);
                    }
                    setLastSuccessfulSyncNow();
                } catch (error) {
                    cloudPending = true;
                    console.warn('Edital removido localmente; exclusão mantida na fila de sincronização:', error);
                }
            } else {
                cloudPending = true;
            }

            updateSyncIndicator();
            await appNotice(
                cloudPending
                    ? `O edital "${concursoAlvo}" foi limpo neste dispositivo. A exclusão no servidor ficará pendente até a próxima sincronização.`
                    : `O edital "${concursoAlvo}" foi apagado com sucesso.`,
                { title:'Edital limpo' }
            );
        }

        async function importJSON(event) {
            const file = event.target.files ? event.target.files[0] : null;
            if (!file) return;
            try { assertImportFileSafe(file); }
            catch (error) { event.target.value = ''; return alert(error.message); }

            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    let rawData = assertSafeJsonPayload(JSON.parse(e.target.result));
                    let formattedData = [];

                    let targetConcurso = rawData.concurso || rawData.nome || currentConcurso;
                    if (!targetConcurso || targetConcurso === 'Concurso Geral') {
                        targetConcurso = prompt("Informe o nome do Concurso para este arquivo JSON:", "TJ-CE Técnico Judiciário");
                    }
                    if (!targetConcurso) return alert("Nome do concurso é obrigatório para importação.");

                    currentConcurso = normalizeImportedText(targetConcurso, IMPORT_LIMITS.concursoChars);
                    if (!currentConcurso) return alert('Nome do concurso inválido para importação.');
                    setLastStudiedConcurso(currentConcurso);

                    let metadata = getConcursosMetadata();
                    if (!metadata[currentConcurso]) {
                        metadata[currentConcurso] = { dataProva: null, dateSchedule: {} };
                    }
                    await saveConcursosMetadata(metadata);

                    let listMaterias = Array.isArray(rawData) ? rawData : (rawData.materias || rawData.disciplinas || rawData.modulos || rawData.edital || rawData.conteudos || []);

                    if (Array.isArray(listMaterias)) {
                        listMaterias.forEach((matObj, idxMat) => {
                            let mName = normalizeImportedText(matObj.materia || matObj.disciplina || matObj.nome || matObj.titulo || `Matéria ${idxMat + 1}`, IMPORT_LIMITS.materiaChars);
                            if (!mName) return;
                            let prio = clampMateriaPriority(matObj.prioridade || matObj.ordem || (idxMat + 1));
                            let listAssuntos = matObj.assuntos || matObj.topicos || matObj.conteudos || matObj.itens || [];

                            if (Array.isArray(listAssuntos)) {
                                listAssuntos.forEach((assuntoItem, idxAss) => {
                                    if (formattedData.length >= IMPORT_LIMITS.maxTopics) throw new Error('O arquivo excede o limite de 12.000 tópicos.');
                                    let assuntoText = normalizeImportedText(typeof assuntoItem === 'string' ? assuntoItem : (assuntoItem.nome || assuntoItem.titulo || assuntoItem.assunto || 'Tópico'), IMPORT_LIMITS.assuntoChars);
                                    if (!assuntoText) return;

                                    const itemObj = {
                                        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random() + idxMat + idxAss),
                                        materia: mName, 
                                        assunto: assuntoText,
                                        prioridade: prio, 
                                        assunto_prioridade: (typeof assuntoItem === 'object' && assuntoItem ? (parseInt(assuntoItem.prioridade || assuntoItem.assunto_prioridade || (idxAss + 1)) || (idxAss + 1)) : (idxAss + 1)), 
                                        concurso: currentConcurso,
                                        user_id: currentUser ? currentUser.id : null,
                                        teoria: false, questoes: false, rev_24h: false, rev_7d: false, rev_30d: false
                                    };

                                    formattedData.push(itemObj);
                                    allEditalItems.push(itemObj);
                                    openMaterias[mName] = true;
                                });
                            }
                        });
                    }

                    if (formattedData.length > 0) {
                        if (Array.isArray(rawData?.materiaOrder)) {
                            const importedNames = new Set(formattedData.map(item => item.materia));
                            const importedOrder = rawData.materiaOrder.filter(name => importedNames.has(name));
                            const remainingNames = [...importedNames].filter(name => !importedOrder.includes(name));
                            metadata = getConcursosMetadata();
                            if (!metadata[currentConcurso]) metadata[currentConcurso] = { dataProva: null, dateSchedule: {} };
                            metadata[currentConcurso].materiaOrder = [...importedOrder, ...remainingNames];
                            await saveConcursosMetadata(metadata);
                        }
                        saveEditalToLocalStorage();
                        formattedData.forEach(queueEditalUpsert);

                        if (navigator.onLine && currentUser) {
                            try {
                                await flushPendingEdital();
                            } catch (errSync) {
                                console.warn('Importação mantida na fila de sincronização:', errSync);
                            }
                        }

                        filterDataByConcurso();
                        alert(`Sucesso! ${formattedData.length} tópicos foram gravados no Edital do concurso "${currentConcurso}".`);
                    } else {
                        alert('Não foi possível identificar matérias e assuntos válidos no JSON.');
                    }
                } catch(err) {
                    console.error('Erro na leitura do JSON:', err);
                    alert('Erro ao processar o arquivo JSON. Certifique-se de que o arquivo está correto.');
                }
            };
            reader.readAsText(file);
            event.target.value = '';
        }

        function updateCountdownBadge() {
            const badge = document.getElementById('countdownBadge');
            if (!badge) return;
            if (isSystemConcurso(currentConcurso)) {
                badge.textContent = 'Sem concurso selecionado';
                updateConcursoActionState();
                return;
            }
            const metadata = getConcursosMetadata();
            const dataStr = metadata[currentConcurso]?.dataProva;
            if (!dataStr) { badge.textContent = "Data da prova não definida"; updateConcursoActionState(); return; }
            const diffDias = Math.ceil((new Date(dataStr + "T00:00:00") - new Date()) / (1000 * 60 * 60 * 24));
            const phase = getExamPhaseProfile(metadata[currentConcurso] || {});
            badge.textContent = diffDias < 0 ? "Prova realizada" : (diffDias === 0 ? "Prova hoje · Reta final" : `${diffDias} dia${diffDias===1?'':'s'} · ${phase.label}`);
            updateConcursoActionState();
        }

        async function editarDataProva() {
            if (!hasRealCurrentConcurso()) {
                await appNotice('Crie ou selecione um concurso antes de definir a data da prova.', { title:'Data da prova' });
                return;
            }
            const metadata = getConcursosMetadata();
            const novaData = await appPrompt({
                title:'Data da prova',
                label:'Data',
                type:'date',
                value:metadata[currentConcurso]?.dataProva || '',
                help:'Deixe o campo vazio para remover a data cadastrada.',
                confirmText:'Salvar data'
            });
            if (novaData === null) return;
            if (!metadata[currentConcurso]) metadata[currentConcurso] = {};
            metadata[currentConcurso].dataProva = String(novaData).trim() || null;
            await saveConcursosMetadata(metadata);
            updateCountdownBadge();
            renderRetentionDiagnostics();
            renderMonthCalendar();
        }

        let chartRenderSequence = 0;

        function renderChart() {
            const sequence = ++chartRenderSequence;
            scheduleBackgroundTask(() => {
                if (sequence !== chartRenderSequence) return;
                renderChartNow();
            }, 600);
        }

        function renderChartNow() {
            const canvas = document.getElementById('progressChart');
            if (!canvas || typeof Chart === 'undefined') return;
            const ctx = canvas.getContext('2d');
            const legendGrid = document.getElementById('chartLegendGrid');
            const counts = {};

            editalItems.forEach(item => {
                const mat = item.materia || 'Geral';
                if (!counts[mat]) counts[mat] = { total: 0, concluido: 0 };
                counts[mat].total += 2;
                if (item.teoria) counts[mat].concluido++;
                if (item.questoes) counts[mat].concluido++;
            });

            const topicCount = editalItems.length;
            const theoryDone = editalItems.filter(i => !!i.teoria).length;
            const questionsDone = editalItems.filter(i => !!i.questoes).length;
            const theoryContributionRaw = topicCount ? (theoryDone / topicCount) * 50 : 0;
            const questionsContributionRaw = topicCount ? (questionsDone / topicCount) * 50 : 0;
            const totalStudyProgressRaw = Math.min(100, theoryContributionRaw + questionsContributionRaw);
            const formatContribution = value => value > 0 && value < 1 ? value.toFixed(1) : String(Math.round(value));
            const formatOverall = value => value > 0 && value < 1 ? value.toFixed(1) : String(Math.round(value));
            const theoryEl = document.getElementById('studyTheoryProgress');
            const questionsEl = document.getElementById('studyQuestionsProgress');
            const totalEl = document.getElementById('studyTotalProgress');
            if (theoryEl) theoryEl.textContent = `${formatContribution(theoryContributionRaw)} / 50%`;
            if (questionsEl) questionsEl.textContent = `${formatContribution(questionsContributionRaw)} / 50%`;
            if (totalEl) totalEl.textContent = `${formatOverall(totalStudyProgressRaw)}%`;

            const labels = Object.keys(counts);
            const percentData = labels.map(l => Math.round((counts[l].concluido / (counts[l].total || 1)) * 100));
            const gradientPairs = [
                ['#ff9f0a','#ff2d55'], ['#00e5d4','#5b4dff'], ['#ff2aa3','#8b2cff'], ['#ffb000','#ff4d6d'],
                ['#11d9f3','#3267ff'], ['#ff3b9a','#9b2cff'], ['#00d9d2','#8b2cff'], ['#ffb000','#ff2d55']
            ];
            const chartHeight = Math.max(180, canvas.clientHeight || canvas.height || 180);
            const barGradients = labels.map((_, idx) => {
                const pair = gradientPairs[idx % gradientPairs.length];
                const gradient = ctx.createLinearGradient(0, chartHeight, 0, 0);
                gradient.addColorStop(0, pair[1]);
                gradient.addColorStop(1, pair[0]);
                return gradient;
            });

            if (legendGrid) {
                legendGrid.innerHTML = labels.map((mName, idx) => {
                    const pair = gradientPairs[idx % gradientPairs.length];
                    return `
                        <div class="chart-legend-item">
                            <span class="chart-legend-color" style="background:linear-gradient(180deg, ${pair[0]}, ${pair[1]});"></span>
                            <span>${escapeHtml(mName)} (${percentData[idx]}%)</span>
                        </div>
                    `;
                }).join('');
            }

            const progressRailPlugin = {
                id: 'progressRailPlugin',
                beforeDatasetsDraw(chart) {
                    const meta = chart.getDatasetMeta(0);
                    const area = chart.chartArea;
                    if (!meta?.data?.length || !area) return;
                    const chartCtx = chart.ctx;
                    chartCtx.save();
                    chartCtx.fillStyle = 'rgba(112, 103, 118, 0.42)';
                    meta.data.forEach(bar => {
                        const width = Math.max(18, Math.min(30, Number(bar.width) || 24));
                        const x = bar.x - width / 2;
                        const y = area.top;
                        const h = Math.max(1, area.bottom - area.top);
                        const radius = width / 2;
                        chartCtx.beginPath();
                        if (typeof chartCtx.roundRect === 'function') chartCtx.roundRect(x, y, width, h, radius);
                        else {
                            chartCtx.moveTo(x + radius, y);
                            chartCtx.arcTo(x + width, y, x + width, y + radius, radius);
                            chartCtx.arcTo(x + width, y + h, x + width - radius, y + h, radius);
                            chartCtx.arcTo(x, y + h, x, y + h - radius, radius);
                            chartCtx.arcTo(x, y, x + radius, y, radius);
                        }
                        chartCtx.fill();
                    });
                    chartCtx.restore();
                }
            };

            if (myChart) myChart.destroy();
            myChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Progresso %',
                        data: percentData,
                        backgroundColor: barGradients,
                        borderRadius: 999,
                        borderSkipped: false,
                        maxBarThickness: 30,
                        minBarLength: 2,
                        categoryPercentage: 0.76,
                        barPercentage: 0.72
                    }]
                },
                plugins: [progressRailPlugin],
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 420, easing: 'easeOutQuart' },
                    layout: { padding: { top: 6, right: 6, bottom: 2, left: 6 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            displayColors: false,
                            callbacks: { label: context => `${context.parsed.y}% concluído` }
                        }
                    },
                    scales: {
                        x: { display: false, grid: { display: false }, border: { display: false } },
                        y: { display: false, beginAtZero: true, max: 100, grid: { display: false }, border: { display: false } }
                    }
                }
            });
        }

        function getMateriaColorIndex(materiaName, sortedMaterias) {
            const idx = sortedMaterias.indexOf(materiaName);
            return idx >= 0 ? idx % PALETA_CORES_MATERIAS.length : 0;
        }

        let timerInterval = null;
        let timeLeft = 40 * 60;
        let isTimerPaused = false;
        let timerHasStarted = false;
        let currentFocusCycleMinutes = 0;
        let currentTimerTotalSeconds = 40 * 60;
        let timerMode = 'focus';
        let activeStudyContext = null;
        let pendingLegalStudyContext = null;
        let focusSessionCommitted = false;
        let pomodoroAudioContext = null;

        function preparePomodoroAudio() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                if (!pomodoroAudioContext) pomodoroAudioContext = new AudioCtx();
                if (pomodoroAudioContext.state === 'suspended') {
                    pomodoroAudioContext.resume().catch(() => {});
                }
            } catch (error) {
                console.warn('Áudio do Pomodoro indisponível:', error);
            }
        }

        function playPomodoroBell() {
            try {
                preparePomodoroAudio();
                const ctx = pomodoroAudioContext;
                if (!ctx) return;

                const master = ctx.createGain();
                master.gain.setValueAtTime(0.0001, ctx.currentTime);
                master.gain.exponentialRampToValueAtTime(1.0, ctx.currentTime + 0.015);
                master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
                master.connect(ctx.destination);

                // Harmônicos metálicos para produzir um som semelhante a sino.
                [880, 1320, 1760].forEach((frequency, index) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = index === 0 ? 'sine' : 'triangle';
                    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
                    gain.gain.setValueAtTime(index === 0 ? 0.8 : 0.28 / index, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (0.8 - index * 0.1));
                    osc.connect(gain);
                    gain.connect(master);
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.9);
                });
            } catch (error) {
                console.warn('Não foi possível tocar o sino do Pomodoro:', error);
            }
        }

        function playPomodoroBellSequence(count, spacingMs) {
            const total = Math.max(1, parseInt(count) || 1);
            const spacing = Math.max(120, parseInt(spacingMs) || 300);
            for (let index = 0; index < total; index++) {
                setTimeout(playPomodoroBell, index * spacing);
            }
        }

        function playPomodoroStartBell() {
            // Dois toques rápidos ao iniciar um novo ciclo de foco.
            playPomodoroBellSequence(2, 280);
        }

        function playPomodoroPauseBell() {
            // Um toque ao pausar.
            playPomodoroBellSequence(1, 0);
        }

        function playPomodoroCompletionBell() {
            // Cinco toques fortes e mais próximos ao finalizar.
            playPomodoroBellSequence(5, 320);
        }

        function normalizeScheduledTopicForStudy(rawText) {
            return String(rawText || '').replace(/^🔄 Rev \((?:24h|\d+d|Adaptativa)\):\s*/, '').trim();
        }

        function renderActiveStudyContext() {
            const box = document.getElementById('activeStudyContextBox');
            const title = document.getElementById('activeStudyContextTitle');
            if (!box || !title) return;
            if (!activeStudyContext || activeStudyContext.concurso !== currentConcurso) {
                box.classList.remove('visible');
                title.textContent = '';
                return;
            }
            const advanceNote = activeStudyContext.adaptiveAdvance && activeStudyContext.plannedDateKey
                ? `<span style="margin-left:8px; font-size:.72rem; color:#7dd3fc;">Antecipando de ${formatDateKeyShort(activeStudyContext.plannedDateKey)} para hoje</span>`
                : '';
            const modeLabel = activeStudyContext.recoveryMethod === 'revisao_curta' ? 'Revisão curta' : (activeStudyContext.recoveryMethod === 'revisao_ativa' ? 'Revisão ativa' : (activeStudyContext.recoveryMethod === 'reestudo' ? 'Reestudo de teoria' : (activeStudyContext.activityType === 'questoes' ? 'Questões' : (activeStudyContext.activityType === 'lei_seca' ? 'Lei Seca' : 'Teoria'))));
            const legalNote = activeStudyContext.activityType === 'lei_seca' && activeStudyContext.norma
                ? `<span style="margin-left:8px;font-size:.72rem;opacity:.8;">${escapeHtml(activeStudyContext.norma)}${activeStudyContext.articleStart ? ` · arts. ${escapeHtml(activeStudyContext.articleStart)}${activeStudyContext.articleEnd ? `–${escapeHtml(activeStudyContext.articleEnd)}` : ''}` : ''}</span>`
                : '';
            title.innerHTML = `<span class="study-mode-badge">${modeLabel}</span>${escapeHtml(activeStudyContext.materia)} — ${escapeHtml(activeStudyContext.assunto)}${legalNote}${advanceNote}`;
            box.classList.add('visible');
        }

        function clearActiveStudyContext() {
            activeStudyContext = null;
            renderActiveStudyContext();
        }

        function getStudySessions() {
            const metadata = getConcursosMetadata();
            const sessions = metadata[currentConcurso]?.studySessions;
            return Array.isArray(sessions) ? sessions : [];
        }

        function getStudyTopicKey(materia, assunto) {
            return `${String(materia || '').trim()} - ${String(assunto || '').trim()}`.trim();
        }

        function getStudySessionTopicKey(session) {
            return getStudyTopicKey(session?.materia, session?.assunto);
        }

        // V9.57 — Retention Engine Core
        // Núcleo inspirado na curva de esquecimento, executando em modo sombra:
        // calcula retenção/estabilidade por assunto sem substituir ainda o cronograma
        // ou as revisões tradicionais. A V9.58 poderá usar estes dados para reagendamento.
        const RETENTION_ENGINE_SCHEMA_VERSION = 5;
        const RETENTION_TARGET_DEFAULT = 0.82;
        const RETENTION_MIN_STABILITY_DAYS = 0.75;
        const RETENTION_MAX_STABILITY_DAYS = 3650;
        let pendingAdaptiveReviewFeedback = null;
        let pendingQuestionPerformance = null;

        function getRetentionEngine(contestMeta, create = false) {
            if (!contestMeta) return null;
            if (!contestMeta.retentionEngine && create) {
                contestMeta.retentionEngine = {
                    schemaVersion: RETENTION_ENGINE_SCHEMA_VERSION,
                    mode: 'shadow',
                    targetRetention: RETENTION_TARGET_DEFAULT,
                    topics: {},
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
            }
            const engine = contestMeta.retentionEngine || null;
            if (engine && create) {
                if (!engine.topics || typeof engine.topics !== 'object') engine.topics = {};
                if (!Number.isFinite(Number(engine.targetRetention))) engine.targetRetention = RETENTION_TARGET_DEFAULT;
                engine.schemaVersion = RETENTION_ENGINE_SCHEMA_VERSION;
                engine.mode = engine.mode || 'shadow';
            }
            return engine;
        }

        function getRetentionTopicState(contestMeta, materia, assunto, create = false) {
            const engine = getRetentionEngine(contestMeta, create);
            if (!engine) return null;
            const key = getStudyTopicKey(materia, assunto);
            if (!key) return null;
            if (!engine.topics[key] && create) {
                engine.topics[key] = {
                    key,
                    materia: String(materia || '').trim(),
                    assunto: String(assunto || '').trim(),
                    lastStudyAt: null,
                    lastReviewAt: null,
                    nextReviewAt: null,
                    stability: RETENTION_MIN_STABILITY_DAYS,
                    difficulty: 5,
                    retention: 100,
                    reviewCount: 0,
                    lapseCount: 0,
                    lastRating: null,
                    ratingCounts: { forgot:0, hard:0, good:0, easy:0 },
                    totalMinutes: 0,
                    sessionCount: 0,
                    lastActivityType: null,
                    activityCounts: { teoria:0, questoes:0, lei_seca:0, revisao_ativa:0 },
                    questionStats: { attempts:0, total:0, correct:0, errors:0, lastAccuracy:null, averageAccuracy:null, confidence:0, lastAt:null },
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
            }
            return engine.topics[key] || null;
        }

        function getRetentionEventDate(session) {
            const raw = session?.createdAt || (session?.dateKey ? `${session.dateKey}T12:00:00` : null);
            const date = raw ? new Date(raw) : new Date();
            return Number.isFinite(date.getTime()) ? date : new Date();
        }

        function calculateRetentionFromState(state, at = new Date()) {
            if (!state?.lastStudyAt) return 0;
            const last = new Date(state.lastStudyAt);
            const now = at instanceof Date ? at : new Date(at);
            if (!Number.isFinite(last.getTime()) || !Number.isFinite(now.getTime())) return 0;
            const elapsedDays = Math.max(0, (now.getTime() - last.getTime()) / 86400000);
            const stability = Math.max(RETENTION_MIN_STABILITY_DAYS, Number(state.stability) || RETENTION_MIN_STABILITY_DAYS);
            return Math.max(0, Math.min(100, Math.round(Math.exp(-elapsedDays / stability) * 1000) / 10));
        }

        function estimateInitialRetentionStability(session) {
            const minutes = Math.max(1, Number(session?.minutes) || 1);
            const activity = session?.activityType || 'teoria';
            const activityFactor = ['revisao_ativa','revisao_curta'].includes(session?.recoveryMethod) ? 1.16 : (activity === 'questoes' ? 1.18 : (activity === 'lei_seca' ? 0.92 : 1));
            const durationFactor = Math.max(0.72, Math.min(1.45, Math.sqrt(minutes / 40)));
            return Math.max(RETENTION_MIN_STABILITY_DAYS, Math.min(14, 5.1 * activityFactor * durationFactor));
        }

        function estimateNextRetentionReviewAt(state, eventDate, targetRetention = RETENTION_TARGET_DEFAULT) {
            const stability = Math.max(RETENTION_MIN_STABILITY_DAYS, Number(state?.stability) || RETENTION_MIN_STABILITY_DAYS);
            const target = Math.max(0.55, Math.min(0.95, Number(targetRetention) || RETENTION_TARGET_DEFAULT));
            const intervalDays = Math.max(1, -stability * Math.log(target));
            const next = new Date(eventDate.getTime() + intervalDays * 86400000);
            return next.toISOString();
        }

        function normalizeRetentionRating(rating) {
            return ['forgot','hard','good','easy'].includes(String(rating || '')) ? String(rating) : null;
        }

        function getRetentionRatingLabel(rating) {
            return ({ forgot:'Esqueci', hard:'Difícil', good:'Bom', easy:'Fácil' })[rating] || rating;
        }

        function applyRetentionRatingToState(state, rating, eventDate, engine) {
            const normalized = normalizeRetentionRating(rating);
            if (!state || !normalized) return state;
            const currentStability = Math.max(RETENTION_MIN_STABILITY_DAYS, Number(state.stability) || RETENTION_MIN_STABILITY_DAYS);
            let stabilityFactor = 1;
            let difficultyDelta = 0;
            if (normalized === 'forgot') { stabilityFactor = 0.42; difficultyDelta = 1.35; }
            if (normalized === 'hard') { stabilityFactor = 1.18; difficultyDelta = 0.45; }
            if (normalized === 'good') { stabilityFactor = 1.95; difficultyDelta = -0.35; }
            if (normalized === 'easy') { stabilityFactor = 2.70; difficultyDelta = -0.75; }

            state.stability = Math.max(RETENTION_MIN_STABILITY_DAYS, Math.min(RETENTION_MAX_STABILITY_DAYS, currentStability * stabilityFactor));
            state.difficulty = Math.max(1, Math.min(10, (Number(state.difficulty) || 5) + difficultyDelta));
            if (!state.ratingCounts || typeof state.ratingCounts !== 'object') state.ratingCounts = { forgot:0, hard:0, good:0, easy:0 };
            state.ratingCounts[normalized] = Math.max(0, Number(state.ratingCounts[normalized]) || 0) + 1;
            state.lastRating = normalized;
            if (normalized === 'forgot') state.lapseCount = Math.max(0, Number(state.lapseCount) || 0) + 1;
            state.retention = 100;
            state.lastReviewAt = eventDate.toISOString();
            if (normalized === 'forgot') {
                const next = new Date(eventDate.getTime() + 86400000);
                state.nextReviewAt = next.toISOString();
            } else {
                state.nextReviewAt = estimateNextRetentionReviewAt(state, eventDate, engine?.targetRetention);
            }
            state.updatedAt = new Date().toISOString();
            return state;
        }

        function normalizeQuestionPerformance(total, correct) {
            const qTotal = Math.max(1, Math.min(500, Math.round(Number(total) || 0)));
            const qCorrect = Math.max(0, Math.min(qTotal, Math.round(Number(correct) || 0)));
            const errors = qTotal - qCorrect;
            const accuracy = Math.round((qCorrect / qTotal) * 1000) / 10;
            const confidence = Math.max(0.08, Math.min(1, 1 - Math.exp(-qTotal / 12)));
            let rating = 'good';
            if (accuracy < 45) rating = 'forgot';
            else if (accuracy < 70) rating = 'hard';
            else if (accuracy < 90) rating = 'good';
            else rating = 'easy';
            return { total:qTotal, correct:qCorrect, errors, accuracy, confidence, rating };
        }

        function getQuestionPerformanceBand(performance) {
            const accuracy = Number(performance?.accuracy) || 0;
            if (accuracy >= 90) return { label:'Domínio alto', recommendation:'A próxima revisão pode ser mais espaçada.' };
            if (accuracy >= 75) return { label:'Bom domínio', recommendation:'Mantenha a revisão no intervalo calculado.' };
            if (accuracy >= 60) return { label:'Retenção intermediária', recommendation:'Vale revisar novamente em prazo menor.' };
            if (accuracy >= 40) return { label:'Retenção baixa', recommendation:'Priorize nova recuperação ativa e revisão próxima.' };
            return { label:'Desempenho crítico', recommendation:'Reestude os pontos frágeis antes de uma nova bateria.' };
        }

        function applyQuestionPerformanceToState(state, performance, eventDate, engine) {
            if (!state || !performance) return state;
            const p = normalizeQuestionPerformance(performance.total, performance.correct);
            const currentStability = Math.max(RETENTION_MIN_STABILITY_DAYS, Number(state.stability) || RETENTION_MIN_STABILITY_DAYS);
            let baseFactor = 1;
            let difficultyDelta = 0;
            if (p.accuracy < 40) { baseFactor = 0.48; difficultyDelta = 1.15; }
            else if (p.accuracy < 60) { baseFactor = 0.78; difficultyDelta = 0.65; }
            else if (p.accuracy < 75) { baseFactor = 1.08; difficultyDelta = 0.12; }
            else if (p.accuracy < 90) { baseFactor = 1.48; difficultyDelta = -0.32; }
            else { baseFactor = 2.05; difficultyDelta = -0.68; }

            // Amostras pequenas influenciam menos. Ex.: 2/2 não equivale a 45/50.
            const blendedFactor = 1 + (baseFactor - 1) * p.confidence;
            state.stability = Math.max(RETENTION_MIN_STABILITY_DAYS, Math.min(RETENTION_MAX_STABILITY_DAYS, currentStability * blendedFactor));
            state.difficulty = Math.max(1, Math.min(10, (Number(state.difficulty) || 5) + difficultyDelta * p.confidence));
            if (!state.questionStats || typeof state.questionStats !== 'object') {
                state.questionStats = { attempts:0, total:0, correct:0, errors:0, lastAccuracy:null, averageAccuracy:null, confidence:0, lastAt:null };
            }
            const qs = state.questionStats;
            qs.attempts = Math.max(0, Number(qs.attempts) || 0) + 1;
            qs.total = Math.max(0, Number(qs.total) || 0) + p.total;
            qs.correct = Math.max(0, Number(qs.correct) || 0) + p.correct;
            qs.errors = Math.max(0, Number(qs.errors) || 0) + p.errors;
            qs.lastAccuracy = p.accuracy;
            qs.averageAccuracy = qs.total > 0 ? Math.round((qs.correct / qs.total) * 1000) / 10 : null;
            qs.confidence = p.confidence;
            qs.lastAt = eventDate.toISOString();
            state.lastRating = p.rating;
            if (p.accuracy < 45) state.lapseCount = Math.max(0, Number(state.lapseCount) || 0) + 1;
            state.retention = Math.max(20, Math.min(100, p.accuracy + (100 - p.accuracy) * (1 - p.confidence) * 0.25));
            state.lastReviewAt = eventDate.toISOString();
            if (p.accuracy < 40) state.nextReviewAt = new Date(eventDate.getTime() + 86400000).toISOString();
            else if (p.accuracy < 60) state.nextReviewAt = new Date(eventDate.getTime() + 2 * 86400000).toISOString();
            else state.nextReviewAt = estimateNextRetentionReviewAt(state, eventDate, engine?.targetRetention);
            state.updatedAt = new Date().toISOString();
            return state;
        }

        function openQuestionPerformanceModal(options = {}) {
            const materia = String(options.materia || '').trim();
            const assunto = String(options.assunto || '').trim();
            if (!materia || !assunto) return;
            pendingQuestionPerformance = {
                sessionId: options.sessionId || null,
                materia,
                assunto,
                itemId: options.itemId || null,
                dateKey: options.dateKey || getLocalDateKey(),
                isRevision: !!options.isRevision,
                source: options.source || 'manual'
            };
            const topic = document.getElementById('questionPerformanceTopic');
            const meta = document.getElementById('questionPerformanceMeta');
            const total = document.getElementById('questionPerformanceTotal');
            const correct = document.getElementById('questionPerformanceCorrect');
            if (topic) topic.textContent = `${materia} — ${assunto}`;
            if (meta) meta.textContent = options.sessionId
                ? 'A sessão foi contabilizada. Informe apenas quantas questões resolveu e quantas acertou.'
                : 'Informe o resultado da bateria de questões, mesmo que tenha sido resolvida fora do Painel.';
            if (total) total.value = '';
            if (correct) correct.value = '';
            updateQuestionPerformancePreview();
            const modal = document.getElementById('modalQuestionPerformance');
            if (modal) modal.style.display = 'flex';
            setTimeout(() => total?.focus(), 120);
        }

        function closeQuestionPerformanceModal() {
            const pending = pendingQuestionPerformance;
            pendingQuestionPerformance = null;
            const modal = document.getElementById('modalQuestionPerformance');
            if (modal) modal.style.display = 'none';
            // Se era uma revisão adaptativa e o usuário deixou o resultado para depois,
            // ainda permitimos a avaliação subjetiva para não quebrar a curva.
            if (pending?.isRevision && pending?.sessionId) {
                const contest = getConcursosMetadata()[currentConcurso] || {};
                const session = (contest.studySessions || []).find(s => s?.id === pending.sessionId);
                if (session && !session.questionPerformance && isAdaptiveRetentionStrategy(contest)) {
                    openAdaptiveReviewFeedback(session, { materia:pending.materia, assunto:pending.assunto, isRevision:true, activityType:'questoes' });
                }
            }
        }

        function updateQuestionPerformancePreview() {
            const preview = document.getElementById('questionPerformancePreview');
            const totalRaw = Number(document.getElementById('questionPerformanceTotal')?.value);
            const correctRaw = Number(document.getElementById('questionPerformanceCorrect')?.value);
            if (!preview) return;
            if (!Number.isFinite(totalRaw) || totalRaw < 1 || !Number.isFinite(correctRaw) || correctRaw < 0) {
                preview.textContent = 'Informe os dois valores para calcular o aproveitamento.';
                return;
            }
            if (correctRaw > totalRaw) {
                preview.innerHTML = '<strong>Confira os valores:</strong> os acertos não podem ser maiores que o total de questões.';
                return;
            }
            const p = normalizeQuestionPerformance(totalRaw, correctRaw);
            const band = getQuestionPerformanceBand(p);
            preview.innerHTML = `<strong>${p.correct}/${p.total} corretas · ${p.errors} erros · ${p.accuracy}% de aproveitamento</strong><br>${band.label}. ${band.recommendation}`;
        }

        async function submitQuestionPerformance() {
            const pending = pendingQuestionPerformance;
            if (!pending) return;
            const totalRaw = Number(document.getElementById('questionPerformanceTotal')?.value);
            const correctRaw = Number(document.getElementById('questionPerformanceCorrect')?.value);
            if (!Number.isFinite(totalRaw) || totalRaw < 1) return appNotice('Informe quantas questões foram resolvidas.', { title:'Questões' });
            if (!Number.isFinite(correctRaw) || correctRaw < 0 || correctRaw > totalRaw) return appNotice('Informe uma quantidade válida de acertos.', { title:'Questões' });
            const performance = normalizeQuestionPerformance(totalRaw, correctRaw);
            const metadata = getConcursosMetadata();
            const contest = metadata[currentConcurso];
            if (!contest) return;
            if (!Array.isArray(contest.studySessions)) contest.studySessions = [];
            let session = pending.sessionId ? contest.studySessions.find(s => s?.id === pending.sessionId) : null;
            if (!session) {
                session = {
                    id:`questions_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
                    dateKey:pending.dateKey || getLocalDateKey(),
                    scheduledDateKey:pending.dateKey || getLocalDateKey(),
                    plannedDateKey:pending.dateKey || getLocalDateKey(),
                    materia:pending.materia,
                    assunto:pending.assunto,
                    activityType:'questoes',
                    isRevision:!!pending.isRevision,
                    minutes:0,
                    source:'questions_manual',
                    performanceOnly:true,
                    createdAt:new Date().toISOString()
                };
                contest.studySessions.push(session);
            }
            session.questionPerformance = performance;
            session.questionTotal = performance.total;
            session.questionCorrect = performance.correct;
            session.questionErrors = performance.errors;
            session.questionAccuracy = performance.accuracy;
            rebuildRetentionEngineForContest(contest);
            const state = getRetentionTopicState(contest, pending.materia, pending.assunto, false);
            const item = allEditalItems.find(i => (i.concurso || 'Concurso Geral') === currentConcurso && getStudyTopicKey(i.materia,i.assunto) === getStudyTopicKey(pending.materia,pending.assunto));
            if (item && !item.questoes) {
                item.questoes = true;
                saveEditalToLocalStorage();
                queueEditalUpsert(item);
            }
            let nextDateKey = null;
            if (isAdaptiveRetentionStrategy(contest) && state) {
                const topicKey = getStudyTopicKey(pending.materia,pending.assunto);
                if (pending.isRevision) {
                    markAdaptiveRetentionReviewCompleted(contest, pending.dateKey || getLocalDateKey(), topicKey, performance.rating, session.id);
                    clearAdaptiveReviewsForTopicThrough(contest, pending.materia, pending.assunto, pending.dateKey || getLocalDateKey());
                }
                nextDateKey = scheduleNextAdaptiveRetentionReview(contest, state, pending.dateKey || getLocalDateKey());
            }
            await saveConcursosMetadata(metadata);
            pendingQuestionPerformance = null;
            const modal = document.getElementById('modalQuestionPerformance');
            if (modal) modal.style.display = 'none';
            filterDataByConcurso();
            renderMonthCalendar();
            renderDayTopicsList();
            updateModernOverview();
            renderSubjectStudyHours();
            const band = getQuestionPerformanceBand(performance);
            const nextText = nextDateKey ? ` Próxima revisão: ${formatDateKeyShort(nextDateKey)}.` : '';
            const layerEscalation = session?.reviewLayer && performance.accuracy < 70
                ? ` Próxima camada sugerida: ${Number(session.reviewLayer) >= 3 ? 'Reestudo de teoria' : 'Questões'}.`
                : '';
            await appNotice(`${performance.accuracy}% de aproveitamento (${performance.correct}/${performance.total}). ${band.label}.${layerEscalation}${nextText}`, { title:'Desempenho registrado' });
        }

        function openManualQuestionPerformanceForScheduledTopic(idx) {
            if (!activeSelectedDateKey) return;
            const contest = getConcursosMetadata()[currentConcurso] || {};
            const raw = contest?.dateSchedule?.[activeSelectedDateKey]?.[idx];
            if (!raw) return;
            const clean = normalizeScheduledTopicForStudy(raw);
            const matched = editalItems.find(i => `${i.materia} - ${i.assunto}` === clean);
            if (!matched) return appNotice('Este item não está vinculado ao edital verticalizado.', { title:'Questões' });
            openQuestionPerformanceModal({ materia:matched.materia, assunto:matched.assunto, itemId:matched.id, dateKey:getLocalDateKey(), isRevision:isRevisionScheduleText(raw), source:'scheduled_manual' });
        }

        function isAdaptiveRetentionStrategy(contestMeta = null) {
            const contest = contestMeta || getConcursosMetadata()[currentConcurso] || {};
            return contest?.scheduleConfig?.revisionStrategy === 'retencao_adaptativa' || contest?.retentionEngine?.mode === 'adaptive';
        }

        function isAdaptiveRetentionReviewText(text) {
            return /^🔄 Rev \(Adaptativa\):/.test(String(text || ''));
        }

        function dateKeyFromDate(date) {
            const d = date instanceof Date ? date : new Date(date);
            if (!Number.isFinite(d.getTime())) return getLocalDateKey();
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        }

        function isRetentionStudyDayAllowed(date, contestMeta) {
            const cfg = contestMeta?.scheduleConfig || {};
            const day = date.getDay();
            if (cfg.method === 3) return (cfg.flexibleDayModes?.[day] || 'full') !== 'rest';
            if (cfg.method === 2 && Array.isArray(cfg.weekdays) && cfg.weekdays.length) return cfg.weekdays.includes(day);
            if (cfg.method === 1) {
                if (day === 6 && cfg.includeSaturday === false) return false;
                if (day === 0 && cfg.includeSunday === false) return false;
            }
            return true;
        }

        function resolveAdaptiveReviewDate(nextReviewAt, contestMeta) {
            let date = new Date(nextReviewAt || Date.now() + 86400000);
            if (!Number.isFinite(date.getTime())) date = new Date(Date.now() + 86400000);
            date.setHours(12,0,0,0);
            const today = new Date(); today.setHours(12,0,0,0);
            if (date <= today) date = new Date(today.getTime() + 86400000);
            for (let i=0; i<21 && !isRetentionStudyDayAllowed(date, contestMeta); i++) date.setDate(date.getDate()+1);
            return date;
        }

        function removeFutureAdaptiveRetentionReviews(dateSchedule, topicText, preserveThroughKey = getLocalDateKey()) {
            Object.keys(dateSchedule || {}).forEach(dateKey => {
                if (dateKey <= preserveThroughKey || !Array.isArray(dateSchedule[dateKey])) return;
                dateSchedule[dateKey] = dateSchedule[dateKey].filter(raw => !(isAdaptiveRetentionReviewText(raw) && normalizeScheduledTopicForStudy(raw) === topicText));
                if (!dateSchedule[dateKey].length) delete dateSchedule[dateKey];
            });
        }

        function scheduleNextAdaptiveRetentionReview(contestMeta, state, preserveThroughKey = getLocalDateKey()) {
            if (!contestMeta || !state || !state.nextReviewAt) return null;
            if (!contestMeta.dateSchedule || typeof contestMeta.dateSchedule !== 'object') contestMeta.dateSchedule = {};
            const topicText = getStudyTopicKey(state.materia, state.assunto);
            removeFutureAdaptiveRetentionReviews(contestMeta.dateSchedule, topicText, preserveThroughKey);
            const targetDate = resolveAdaptiveReviewDate(state.nextReviewAt, contestMeta);
            const dateKey = dateKeyFromDate(targetDate);
            if (!contestMeta.dateSchedule[dateKey]) contestMeta.dateSchedule[dateKey] = [];
            const reviewText = `🔄 Rev (Adaptativa): ${topicText}`;
            if (!contestMeta.dateSchedule[dateKey].includes(reviewText)) contestMeta.dateSchedule[dateKey].push(reviewText);
            state.nextReviewAt = new Date(`${dateKey}T12:00:00`).toISOString();
            return dateKey;
        }

        function markAdaptiveRetentionReviewCompleted(contestMeta, dateKey, topicKey, rating, sessionId) {
            if (!contestMeta.adaptiveRetentionReviewProgress) contestMeta.adaptiveRetentionReviewProgress = {};
            if (!contestMeta.adaptiveRetentionReviewProgress[dateKey]) contestMeta.adaptiveRetentionReviewProgress[dateKey] = {};
            contestMeta.adaptiveRetentionReviewProgress[dateKey][topicKey] = {
                completed:true, rating, sessionId:sessionId || null, completedAt:new Date().toISOString()
            };
        }

        function getAdaptiveRetentionReviewCompletion(contestMeta, dateKey, topicKey) {
            return !!contestMeta?.adaptiveRetentionReviewProgress?.[dateKey]?.[topicKey]?.completed;
        }

        function openAdaptiveReviewFeedback(session, context) {
            pendingAdaptiveReviewFeedback = { sessionId:session?.id || null, dateKey:session?.dateKey || getLocalDateKey(), materia:session?.materia, assunto:session?.assunto, context:{...(context||{})} };
            const topic = document.getElementById('adaptiveReviewFeedbackTopic');
            const meta = document.getElementById('adaptiveReviewFeedbackMeta');
            if (topic) topic.textContent = `${session?.materia || ''} — ${session?.assunto || ''}`;
            if (meta) {
                const before = Number(session?.retentionBefore);
                meta.textContent = Number.isFinite(before)
                    ? `Retenção estimada antes da revisão: ${Math.round(before)}%. Como foi recuperar esse conteúdo?`
                    : 'Como foi recuperar esse conteúdo?';
            }
            const modal = document.getElementById('modalAdaptiveReviewFeedback');
            if (modal) modal.style.display = 'flex';
        }

        async function submitAdaptiveReviewFeedback(rating) {
            const normalized = normalizeRetentionRating(rating);
            const pending = pendingAdaptiveReviewFeedback;
            if (!normalized || !pending) return;
            const metadata = getConcursosMetadata();
            const contest = metadata[currentConcurso];
            if (!contest) return;
            const session = (contest.studySessions || []).find(item => item?.id === pending.sessionId);
            if (!session) return appNotice('A sessão desta revisão não foi encontrada.', { title:'Revisão adaptativa' });
            session.retentionRating = normalized;
            rebuildRetentionEngineForContest(contest);
            const state = getRetentionTopicState(contest, pending.materia, pending.assunto, false);
            const topicKey = getStudyTopicKey(pending.materia, pending.assunto);
            markAdaptiveRetentionReviewCompleted(contest, pending.dateKey, topicKey, normalized, pending.sessionId);
            clearAdaptiveReviewsForTopicThrough(contest, pending.materia, pending.assunto, pending.dateKey);
            const nextDateKey = state ? scheduleNextAdaptiveRetentionReview(contest, state, pending.dateKey) : null;
            await saveConcursosMetadata(metadata);
            pendingAdaptiveReviewFeedback = null;
            const modal = document.getElementById('modalAdaptiveReviewFeedback');
            if (modal) modal.style.display = 'none';
            renderMonthCalendar();
            renderDayTopicsList();
            updateModernOverview();
            const nextText = nextDateKey ? ` Próxima revisão: ${formatDateKeyShort(nextDateKey)}.` : '';
            const currentLayer = Number(session?.reviewLayer) || 0;
            const nextLayerLabel = currentLayer === 1 ? 'Revisão curta' : (currentLayer === 2 ? 'Questões' : (currentLayer === 3 ? 'Reestudo de teoria' : ''));
            const layerEscalation = nextLayerLabel && ['forgot','hard'].includes(normalized) ? ` Próxima camada sugerida: ${nextLayerLabel}.` : '';
            await appNotice(`${getRetentionRatingLabel(normalized)} registrado.${layerEscalation}${nextText}`, { title:'Memória recalibrada' });
        }

        function applyRetentionSessionToState(state, session, engine) {
            if (!state || !session) return state;
            const eventDate = getRetentionEventDate(session);
            const previousStudyAt = state.lastStudyAt ? new Date(state.lastStudyAt) : null;
            const previousRetention = previousStudyAt && Number.isFinite(previousStudyAt.getTime())
                ? calculateRetentionFromState(state, eventDate)
                : 100;
            const activity = ['revisao_ativa','revisao_curta'].includes(session.recoveryMethod) ? 'revisao_ativa' : (session.activityType === 'questoes' ? 'questoes' : (session.activityType === 'lei_seca' ? 'lei_seca' : 'teoria'));
            const minutes = Math.max(0, Number(session.minutes) || 0);
            const priorSessions = Math.max(0, Number(state.sessionCount) || 0);

            if (priorSessions === 0) {
                state.stability = estimateInitialRetentionStability(session);
            } else {
                const elapsedDays = Math.max(0, (eventDate.getTime() - previousStudyAt.getTime()) / 86400000);
                const activityBoost = activity === 'questoes' ? 0.10 : (activity === 'revisao_ativa' ? 0.13 : (activity === 'lei_seca' ? 0.03 : 0.06));
                const spacingBoost = Math.min(0.22, elapsedDays * 0.018);
                const retrievalBoost = Math.max(0, Math.min(0.18, (100 - previousRetention) / 250));
                const sameDayFactor = elapsedDays < 0.5 ? 1.035 : 1;
                const growth = sameDayFactor * (1.12 + activityBoost + spacingBoost + retrievalBoost);
                state.stability = Math.max(
                    RETENTION_MIN_STABILITY_DAYS,
                    Math.min(RETENTION_MAX_STABILITY_DAYS, (Number(state.stability) || RETENTION_MIN_STABILITY_DAYS) * growth)
                );
                if (session.isRevision || elapsedDays >= 0.75) {
                    state.reviewCount = Math.max(0, Number(state.reviewCount) || 0) + 1;
                    state.lastReviewAt = eventDate.toISOString();
                }
            }

            state.sessionCount = priorSessions + 1;
            state.totalMinutes = Math.max(0, Number(state.totalMinutes) || 0) + minutes;
            if (!state.activityCounts || typeof state.activityCounts !== 'object') state.activityCounts = { teoria:0, questoes:0, lei_seca:0, revisao_ativa:0 };
            state.activityCounts[activity] = Math.max(0, Number(state.activityCounts[activity]) || 0) + 1;
            state.lastActivityType = activity;
            state.lastStudyAt = eventDate.toISOString();
            state.retention = 100;
            state.nextReviewAt = estimateNextRetentionReviewAt(state, eventDate, engine?.targetRetention);
            if (session.questionPerformance) applyQuestionPerformanceToState(state, session.questionPerformance, eventDate, engine);
            else if (session.retentionRating) applyRetentionRatingToState(state, session.retentionRating, eventDate, engine);
            state.updatedAt = new Date().toISOString();
            return state;
        }

        function rebuildRetentionEngineForContest(contestMeta) {
            if (!contestMeta) return false;
            const sessions = Array.isArray(contestMeta.studySessions) ? contestMeta.studySessions.slice() : [];
            const oldEngine = contestMeta.retentionEngine;
            const engine = {
                schemaVersion: RETENTION_ENGINE_SCHEMA_VERSION,
                mode: oldEngine?.mode || 'shadow',
                targetRetention: Math.max(0.55, Math.min(0.95, Number(oldEngine?.targetRetention) || RETENTION_TARGET_DEFAULT)),
                topics: {},
                createdAt: oldEngine?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                rebuiltFromHistoryAt: new Date().toISOString()
            };
            sessions.sort((a,b) => getRetentionEventDate(a) - getRetentionEventDate(b));
            sessions.forEach(session => {
                const key = getStudySessionTopicKey(session);
                if (!key) return;
                const state = engine.topics[key] || {
                    key,
                    materia: String(session?.materia || '').trim(),
                    assunto: String(session?.assunto || '').trim(),
                    lastStudyAt:null, lastReviewAt:null, nextReviewAt:null,
                    stability:RETENTION_MIN_STABILITY_DAYS, difficulty:5, retention:100,
                    reviewCount:0, lapseCount:0, lastRating:null, ratingCounts:{ forgot:0, hard:0, good:0, easy:0 }, totalMinutes:0, sessionCount:0,
                    lastActivityType:null, activityCounts:{ teoria:0, questoes:0, lei_seca:0, revisao_ativa:0 },
                    questionStats:{ attempts:0, total:0, correct:0, errors:0, lastAccuracy:null, averageAccuracy:null, confidence:0, lastAt:null },
                    createdAt:getRetentionEventDate(session).toISOString(), updatedAt:new Date().toISOString()
                };
                engine.topics[key] = state;
                applyRetentionSessionToState(state, session, engine);
            });
            contestMeta.retentionEngine = engine;
            return true;
        }

        function ensureRetentionEngineForAllContests(metadata, options = {}) {
            let changed = false;
            Object.values(metadata || {}).forEach(contest => {
                if (!contest || typeof contest !== 'object') return;
                const sessions = Array.isArray(contest.studySessions) ? contest.studySessions : [];
                const engine = contest.retentionEngine;
                const needsRebuild = options.force || !engine || Number(engine.schemaVersion) !== RETENTION_ENGINE_SCHEMA_VERSION;
                if (needsRebuild && sessions.length) {
                    rebuildRetentionEngineForContest(contest);
                    changed = true;
                } else if (needsRebuild && engine) {
                    engine.schemaVersion = RETENTION_ENGINE_SCHEMA_VERSION;
                    if (!engine.topics || typeof engine.topics !== 'object') engine.topics = {};
                    engine.updatedAt = new Date().toISOString();
                    changed = true;
                } else if (!engine && options.createEmpty) {
                    getRetentionEngine(contest, true);
                    changed = true;
                }
            });
            return changed;
        }

        function registerRetentionStudyEvent(contestMeta, session) {
            if (!contestMeta || !session) return null;
            const engine = getRetentionEngine(contestMeta, true);
            const state = getRetentionTopicState(contestMeta, session.materia, session.assunto, true);
            if (session.retentionBefore == null && state?.lastStudyAt) session.retentionBefore = calculateRetentionFromState(state, getRetentionEventDate(session));
            applyRetentionSessionToState(state, session, engine);
            engine.updatedAt = new Date().toISOString();
            return state;
        }

        function getTopicRetentionState(materia, assunto, contestMeta = null) {
            const contest = contestMeta || getConcursosMetadata()[currentConcurso] || {};
            const state = getRetentionTopicState(contest, materia, assunto, false);
            if (!state) return null;
            return { ...state, retention: calculateRetentionFromState(state, new Date()) };
        }

        function getScheduledStudyTopicKey(rawText) {
            return normalizeScheduledTopicForStudy(rawText);
        }

        function removeLegacyPomodoroKeysForMonth(monthPrefix) {
            const uid = currentUser ? currentUser.id : 'guest';
            const keysToRemove = [];
            for (let index = 0; index < localStorage.length; index++) {
                const key = localStorage.key(index);
                if (!key) continue;
                if (key.startsWith(`pomodoro_daily_minutes_${uid}_${monthPrefix}`)) {
                    keysToRemove.push(key);
                    continue;
                }
                if (key.startsWith(`${getPomodoroExtraStoragePrefix()}${monthPrefix}`)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
        }

        function migrateStudySessionProgressV9663(metadata = getConcursosMetadata()) {
            const contest = metadata?.[currentConcurso];
            if (!contest || typeof contest !== 'object') return { changed:false, metadataChanged:false };
            if (!contest.migrations || typeof contest.migrations !== 'object') contest.migrations = {};
            if (contest.migrations.studySessionProgressV9663) return { changed:false, metadataChanged:false };

            const sessionState = new Map();
            const sessions = Array.isArray(contest.studySessions) ? contest.studySessions : [];
            sessions.forEach(session => {
                const minutes = Math.max(0, Number(session?.minutes) || 0);
                if (!minutes) return;
                if (session?.isRevision && ['revisao_ativa','revisao_curta','reestudo'].includes(session?.recoveryMethod)) return;
                const key = getStudySessionTopicKey(session);
                if (!key) return;
                if (!sessionState.has(key)) sessionState.set(key, { teoria:false, questoes:false });
                const state = sessionState.get(key);
                if (session?.activityType === 'questoes') state.questoes = true;
                else if ((session?.activityType || 'teoria') === 'teoria') state.teoria = true;
            });

            let changed = false;
            allEditalItems.forEach(item => {
                if ((item.concurso || 'Concurso Geral') !== currentConcurso) return;
                const state = sessionState.get(getStudyTopicKey(item.materia, item.assunto));
                if (!state) return;

                let shouldMarkTheory = !!state.teoria;
                if (shouldMarkTheory) {
                    const planProgress = getTopicStudyPlanProgress(item, contest);
                    if (planProgress) shouldMarkTheory = !!planProgress.complete;
                }
                if (shouldMarkTheory && !item.teoria) {
                    item.teoria = true;
                    queueEditalUpsert(item);
                    changed = true;
                }
                if (state.questoes && !item.questoes) {
                    item.questoes = true;
                    queueEditalUpsert(item);
                    changed = true;
                }
            });

            contest.migrations.studySessionProgressV9663 = new Date().toISOString();
            if (changed) {
                saveEditalToLocalStorage();
                if (navigator.onLine && currentUser) scheduleEditalSync(250);
            }
            metadataCache = metadata;
            localStorage.setItem(getConcursosMetadataStorageKey(), JSON.stringify(metadata));
            setMetadataDirty(true);
            scheduleMetadataSync(300);
            return { changed, metadataChanged:true };
        }

        function reconcileEditalStudyFlagsFromSessions(topicKeys) {
            const affected = topicKeys instanceof Set ? topicKeys : new Set(topicKeys || []);
            if (!affected.size) return 0;

            const sessionState = new Map();
            getStudySessions().forEach(session => {
                const key = getStudySessionTopicKey(session);
                if (!affected.has(key)) return;
                if (!sessionState.has(key)) sessionState.set(key, { teoria:false, questoes:false });
                const state = sessionState.get(key);
                if (session?.isRevision && ['revisao_ativa','revisao_curta','reestudo'].includes(session?.recoveryMethod)) return;
                if (session?.activityType === 'questoes') state.questoes = true;
                else if (session?.activityType === 'teoria') state.teoria = true;
            });

            let changed = 0;
            allEditalItems.forEach(item => {
                if ((item.concurso || 'Concurso Geral') !== currentConcurso) return;
                const key = getStudyTopicKey(item.materia, item.assunto);
                if (!affected.has(key)) return;
                const state = sessionState.get(key) || { teoria:false, questoes:false };
                const nextTeoria = !!state.teoria;
                const nextQuestoes = !!state.questoes;
                if (!!item.teoria !== nextTeoria || !!item.questoes !== nextQuestoes) {
                    item.teoria = nextTeoria;
                    item.questoes = nextQuestoes;
                    queueEditalUpsert(item);
                    changed++;
                }
            });

            if (changed) saveEditalToLocalStorage();
            return changed;
        }

        function markEditalProgressFromStudyContext(context) {
            if (!context || context.concurso !== currentConcurso || context.activityType === 'lei_seca') return false;
            if (context.isRevision && ['revisao_ativa','revisao_curta','reestudo'].includes(context.recoveryMethod)) return false;
            const item = allEditalItems.find(candidate => {
                if ((candidate.concurso || 'Concurso Geral') !== currentConcurso) return false;
                if (context.itemId && String(candidate.id) === String(context.itemId)) return true;
                return getStudyTopicKey(candidate.materia, candidate.assunto) === getStudyTopicKey(context.materia, context.assunto);
            });
            if (!item) return false;

            const field = context.activityType === 'questoes' ? 'questoes' : 'teoria';
            if (field === 'teoria') {
                const contest = getConcursosMetadata()[currentConcurso] || {};
                const planProgress = getTopicStudyPlanProgress(item, contest);
                if (planProgress && !planProgress.complete) return false;
            }
            if (item[field]) return false;
            item[field] = true;
            saveEditalToLocalStorage();
            queueEditalUpsert(item);
            if (navigator.onLine && currentUser) scheduleEditalSync(250);
            return true;
        }

        function getSubjectStudyTotals() {
            const totals = new Map();
            getStudySessions().forEach(session => {
                const materia = String(session?.materia || '').trim();
                const minutes = Math.max(0, Number(session?.minutes || 0));
                if (!materia || !minutes) return;
                if (!totals.has(materia)) totals.set(materia, { materia, minutes:0, teoria:0, questoes:0, leiSeca:0 });
                const row = totals.get(materia);
                row.minutes += minutes;
                if (session?.activityType === 'questoes') row.questoes += minutes;
                else if (session?.activityType === 'lei_seca') row.leiSeca += minutes;
                else row.teoria += minutes;
            });
            return [...totals.values()].sort((a,b) => b.minutes - a.minutes);
        }

        function getTotalRecordedStudyMinutes() {
            // Fonte canônica do total por matéria: soma todas as sessões de estudo
            // registradas no concurso atual (Teoria + Questões + Lei Seca), sem incluir pausas/intervalos.
            return getSubjectStudyTotals().reduce((total, row) => total + Math.max(0, Number(row.minutes) || 0), 0);
        }

        function renderSubjectStudyHours() {
            const list = document.getElementById('subjectStudyHoursList');
            if (!list) return;
            const totals = getSubjectStudyTotals();
            const distribution = document.getElementById('studyActivityDistribution');
            if (!totals.length) {
                list.innerHTML = '<div class="subject-hours-empty">Inicie uma matéria pelo cronograma para contabilizar o tempo por disciplina.</div>';
                if (distribution) distribution.textContent = '';
                return;
            }
            const max = Math.max(...totals.map(x => x.minutes), 1);
            const visible = totals.slice(0, 8);
            const overall = totals.reduce((acc,row) => { acc.teoria += row.teoria || 0; acc.questoes += row.questoes || 0; acc.leiSeca += row.leiSeca || 0; return acc; }, {teoria:0,questoes:0,leiSeca:0});
            const overallMinutes = overall.teoria + overall.questoes + overall.leiSeca;
            if (distribution && overallMinutes > 0) {
                const part = value => Math.round((value / overallMinutes) * 100);
                distribution.innerHTML = `<strong>Distribuição das horas:</strong> Teoria ${part(overall.teoria)}% · Questões ${part(overall.questoes)}%${overall.leiSeca ? ` · Lei Seca ${part(overall.leiSeca)}%` : ''}`;
            }
            list.innerHTML = visible.map(row => {
                const pct = Math.max(5, Math.round((row.minutes / max) * 100));
                return `<div class="subject-hours-row">
                    <div class="subject-hours-main">
                        <div class="subject-hours-name"><span title="${escapeHtml(row.materia)}">${escapeHtml(row.materia)}</span></div>
                        <div class="subject-hours-detail">Teoria ${formatStudyMinutes(row.teoria)} · Questões ${formatStudyMinutes(row.questoes)}${row.leiSeca ? ` · Lei Seca ${formatStudyMinutes(row.leiSeca)}` : ''}</div>
                        <div class="subject-hours-track"><div class="subject-hours-fill" style="width:${pct}%"></div></div>
                    </div>
                    <div class="subject-hours-time">${formatStudyMinutes(row.minutes)}</div>
                </div>`;
            }).join('');
        }

        async function recordStudyMinutesForContext(minutes, context = activeStudyContext) {
            const amount = Math.max(0, Math.round(Number(minutes) || 0));
            if (!amount || !context || context.concurso !== currentConcurso) return null;
            const metadata = getConcursosMetadata();
            if (!metadata[currentConcurso]) metadata[currentConcurso] = { dataProva:null, dateSchedule:{} };
            if (!Array.isArray(metadata[currentConcurso].studySessions)) metadata[currentConcurso].studySessions = [];

            const actualDateKey = getLocalDateKey();
            const plannedDateKey = context.plannedDateKey || context.dateKey || actualDateKey;
            let adaptiveResult = null;
            if (context.adaptiveAdvance && plannedDateKey > actualDateKey) {
                adaptiveResult = await applyAdaptiveScheduleAdvance(metadata, { ...context, plannedDateKey });
            }

            const recordedSession = {
                id: `study_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
                dateKey: actualDateKey,
                scheduledDateKey: adaptiveResult ? actualDateKey : (context.dateKey || null),
                plannedDateKey,
                materia: context.materia,
                assunto: context.assunto,
                activityType: context.activityType === 'questoes' ? 'questoes' : (context.activityType === 'lei_seca' ? 'lei_seca' : 'teoria'),
                isRevision: !!context.isRevision,
                recoveryMethod: context.recoveryMethod || null,
                reviewLayer: context.layer || null,
                legalBlockId: context.legalBlockId || null,
                norma: context.norma || null,
                articleStart: context.articleStart || null,
                articleEnd: context.articleEnd || null,
                minutes: amount,
                source: adaptiveResult ? 'pomodoro_advanced' : 'pomodoro',
                advanced: !!adaptiveResult,
                createdAt: new Date().toISOString()
            };
            metadata[currentConcurso].studySessions.push(recordedSession);
            const retentionState = registerRetentionStudyEvent(metadata[currentConcurso], recordedSession);
            const topicPlanResult = reconcileTopicStudyPlanAfterSession(metadata, context);
            let adaptiveReviewDateKey = null;
            if (isAdaptiveRetentionStrategy(metadata[currentConcurso]) && !context.isRevision && retentionState) {
                // Assuntos longos só iniciam a curva de revisão quando a Teoria planejada
                // estiver completa. Enquanto houver blocos/aulas pendentes, a prioridade é continuidade.
                if (!topicPlanResult || topicPlanResult.complete) {
                    adaptiveReviewDateKey = scheduleNextAdaptiveRetentionReview(metadata[currentConcurso], retentionState, actualDateKey);
                } else {
                    removeTopicRevisionsFromSchedule(metadata[currentConcurso].dateSchedule || {}, getStudyTopicKey(context.materia, context.assunto));
                }
            }
            await saveConcursosMetadata(metadata);

            // Atualiza o progresso do edital somente depois que studySessions foi persistido localmente.
            // Para planos por sessões/minutos, isso permite que a sessão recém-gravada conclua o plano.
            const progressChanged = markEditalProgressFromStudyContext(context);

            if (adaptiveResult) {
                activeStudyContext = { ...context, dateKey: actualDateKey, plannedDateKey, adaptiveAdvance:false };
            }

            // Atualização síncrona da interface: não depende de requestIdleCallback para refletir
            // minutos, checkboxes e gráfico ao término do Pomodoro.
            editalItems = allEditalItems.filter(i => (i.concurso || 'Concurso Geral') === currentConcurso);
            renderTable();
            renderChartNow();
            renderSubjectStudyHours();
            renderPomodoroDailyCounter();
            updateModernOverview();
            renderMonthCalendar();
            if (activeSelectedDateKey) renderDayTopicsList();
            renderActiveStudyContext();

            window.__studyDiagnostics = {
                lastSessionId: recordedSession.id,
                lastSessionMinutes: recordedSession.minutes,
                lastSessionActivity: recordedSession.activityType,
                lastSessionMateria: recordedSession.materia,
                lastSessionAssunto: recordedSession.assunto,
                progressChanged,
                sessionCount: getStudySessions().length,
                recordedAt: recordedSession.createdAt
            };

            const linkedItem = allEditalItems.find(candidate => String(candidate.id) === String(context.itemId || ''));
            const linkedPlan = linkedItem ? getTopicStudyPlan(linkedItem, metadata[currentConcurso] || {}) : null;
            if (context.activityType === 'teoria' && linkedPlan?.mode === 'lessons' && !progressChanged) {
                window.__studyDiagnostics.lessonPlanAwaitingManualCompletion = true;
            }

            if (context.activityType === 'questoes') {
                openQuestionPerformanceModal({
                    sessionId:recordedSession.id, materia:recordedSession.materia, assunto:recordedSession.assunto, itemId:context.itemId,
                    dateKey:recordedSession.dateKey, isRevision:!!context.isRevision, source:'pomodoro'
                });
            } else if (isAdaptiveRetentionStrategy(metadata[currentConcurso]) && context.isRevision) {
                openAdaptiveReviewFeedback(recordedSession, context);
            }

            return recordedSession;
        }

        async function removeStudySessionsForDate(dateKey = getLocalDateKey()) {
            const metadata = getConcursosMetadata();
            const contest = metadata[currentConcurso];
            if (!contest || !Array.isArray(contest.studySessions)) return;
            contest.studySessions = contest.studySessions.filter(s => s?.dateKey !== dateKey);
            rebuildRetentionEngineForContest(contest);
            await saveConcursosMetadata(metadata);
            renderSubjectStudyHours();
            updateModernOverview();
        }

        function startScheduledTopicStudy(idx, activityType = 'teoria', forceAdaptiveAdvance = false) {
            if (!activeSelectedDateKey) return;
            const metadata = getConcursosMetadata();
            const raw = metadata[currentConcurso]?.dateSchedule?.[activeSelectedDateKey]?.[idx];
            if (!raw) return;
            const clean = normalizeScheduledTopicForStudy(raw);
            const matched = editalItems.find(i => `${i.materia} - ${i.assunto}` === clean);
            if (!matched) {
                alert('Este item não está vinculado a uma matéria do edital verticalizado. Edite o item antes de iniciar.');
                return;
            }
            const minutesInput = document.getElementById(`studyMinutes_${idx}`);
            const requestedMinutes = Math.max(1, Math.min(240, parseInt(minutesInput?.value || document.getElementById('focoMin')?.value || '40') || 40));
            const focusInput = document.getElementById('focoMin');
            if (focusInput) focusInput.value = requestedMinutes;

            const todayKey = getLocalDateKey();
            const plannedDateKey = activeSelectedDateKey;
            const isFutureStudy = plannedDateKey > todayKey && !isRevisionScheduleText(raw);
            let adaptiveAdvance = !!forceAdaptiveAdvance;
            if (isFutureStudy && !forceAdaptiveAdvance) {
                adaptiveAdvance = confirm(
                    `Este tópico está planejado para ${formatDateKeyShort(plannedDateKey)}.\n\n` +
                    'OK: antecipar para hoje e reorganizar apenas a fila futura.\n' +
                    'Cancelar: estudar agora sem alterar o cronograma.'
                );
            }

            activeStudyContext = {
                concurso: currentConcurso,
                materia: matched.materia,
                assunto: matched.assunto,
                itemId: matched.id,
                dateKey: adaptiveAdvance ? todayKey : activeSelectedDateKey,
                plannedDateKey,
                adaptiveAdvance: isFutureStudy && adaptiveAdvance,
                isRevision: isRevisionScheduleText(raw),
                activityType: activityType === 'questoes' ? 'questoes' : (activityType === 'lei_seca' ? 'lei_seca' : 'teoria')
            };
            renderActiveStudyContext();
            closeModalDayContent();

            const editalTabButton = [...document.querySelectorAll('.tab-btn')]
                .find(btn => /edital verticalizado/i.test(btn.textContent || ''));
            if (editalTabButton) switchTab('tab-edital', editalTabButton);

            clearInterval(timerInterval);
            timerInterval = null;
            timerMode = 'focus';
            timerHasStarted = false;
            isTimerPaused = false;
            currentFocusCycleMinutes = 0;
            focusSessionCommitted = false;
            timeLeft = requestedMinutes * 60;
            currentTimerTotalSeconds = timeLeft;
            updateDisplay();
            updatePauseButton();

            requestAnimationFrame(() => {
                const pomodoro = document.querySelector('.pomodoro-card');
                if (pomodoro) pomodoro.scrollIntoView({ behavior:'smooth', block:'center' });
                startTimer();
            });
        }

        function getLocalDateKey(date = new Date()) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function getDailyPomodoroStorageKey() {
            const uid = currentUser ? currentUser.id : 'guest';
            return `pomodoro_daily_minutes_${uid}_${getLocalDateKey()}`;
        }

        function getPomodoroExtraStoragePrefix() {
            const uid = currentUser ? currentUser.id : 'guest';
            return `pomodoro_extra_minutes_${uid}_${encodeURIComponent(currentConcurso)}_`;
        }

        function getDailyPomodoroExtraStorageKey(dateKey = getLocalDateKey()) {
            return `${getPomodoroExtraStoragePrefix()}${dateKey}`;
        }

        function getDailyPomodoroExtraMinutes(dateKey = getLocalDateKey()) {
            const value = parseInt(localStorage.getItem(getDailyPomodoroExtraStorageKey(dateKey)) || '0');
            return Number.isFinite(value) && value > 0 ? value : 0;
        }

        function addDailyPomodoroExtraMinutes(minutes, dateKey = getLocalDateKey()) {
            const increment = Math.max(0, Math.round(Number(minutes) || 0));
            if (!increment) return;
            const key = getDailyPomodoroExtraStorageKey(dateKey);
            localStorage.setItem(key, String(getDailyPomodoroExtraMinutes(dateKey) + increment));
        }

        function getTotalPomodoroExtraMinutes() {
            const prefix = getPomodoroExtraStoragePrefix();
            let total = 0;
            for (let index = 0; index < localStorage.length; index++) {
                const key = localStorage.key(index);
                if (!key || !key.startsWith(prefix)) continue;
                const value = parseInt(localStorage.getItem(key) || '0');
                if (Number.isFinite(value) && value > 0) total += value;
            }
            return total;
        }

        function getPlannedPomodoroMinutes() {
            const metadata = getConcursosMetadata();
            const concursoData = metadata[currentConcurso] || {};
            const targetHours = Number(concursoData.pomodoroDailyTargetHours || 0);
            const dateSchedule = concursoData.dateSchedule || {};
            if (!Number.isFinite(targetHours) || targetHours <= 0) return 0;

            const studyDays = Object.values(dateSchedule).filter(items =>
                Array.isArray(items) && items.some(item => !String(item).startsWith('🔄 Rev'))
            ).length;

            return Math.round(studyDays * targetHours * 60);
        }

        function getGeneralPomodoroMinutes() {
            // "Horas Gerais" usa a mesma fonte canônica do card "Horas Estudadas":
            // soma real de todas as sessões de foco (Teoria + Questões + Lei Seca) do concurso atual.
            return getTotalRecordedStudyMinutes();
        }

        function getDailyPomodoroMinutes(dateKey = getLocalDateKey()) {
            // Fonte canônica do "Estudado Hoje": sessões efetivamente vinculadas
            // ao concurso/cronograma atual. Isso mantém o contador sincronizado
            // com Horas Estudadas e evita horas órfãs após limpar o cronograma.
            return getStudySessions().reduce((total, session) => {
                if (session?.dateKey !== dateKey) return total;
                const minutes = Math.max(0, Number(session?.minutes || 0));
                return total + minutes;
            }, 0);
        }

        function getTotalEffectivePomodoroMinutes() {
            // Somente minutos de FOCO efetivamente concluídos. Intervalos/pausas nunca são gravados
            // nas chaves pomodoro_daily_minutes_, portanto ficam naturalmente excluídos.
            const uid = currentUser ? currentUser.id : 'guest';
            const prefix = `pomodoro_daily_minutes_${uid}_`;
            let total = 0;
            for (let index = 0; index < localStorage.length; index++) {
                const key = localStorage.key(index);
                if (!key || !key.startsWith(prefix)) continue;
                const value = parseInt(localStorage.getItem(key) || '0', 10);
                if (Number.isFinite(value) && value > 0) total += value;
            }
            return total;
        }

        function setDailyPomodoroMinutes(minutes) {
            const normalized = Math.max(0, Math.round(Number(minutes) || 0));
            localStorage.setItem(getDailyPomodoroStorageKey(), String(normalized));
            renderPomodoroDailyCounter();
        }

        function addDailyPomodoroMinutes(minutes) {
            const increment = Math.max(0, Math.round(Number(minutes) || 0));
            if (!increment) return;
            setDailyPomodoroMinutes(getDailyPomodoroMinutes() + increment);
        }

        function hasActiveStudySchedule(concursoData = null) {
            const metadata = getConcursosMetadata();
            const data = concursoData || metadata[currentConcurso] || {};
            const dateSchedule = data.dateSchedule || {};
            return Object.values(dateSchedule).some(items =>
                Array.isArray(items) && items.some(item => !String(item).startsWith('🔄 Rev'))
            );
        }

        function getPomodoroDailyTargetHours(dateKey = getLocalDateKey()) {
            const metadata = getConcursosMetadata();
            const concursoData = metadata[currentConcurso] || {};
            if (!hasActiveStudySchedule(concursoData)) return 0;
            const cfg = concursoData.scheduleConfig || {};
            if (cfg.method === 2 && cfg.customDailyHoursByWeekday) {
                const [y,m,d] = String(dateKey).split('-').map(Number);
                const dayIdx = new Date(y, m - 1, d).getDay();
                const custom = Number(cfg.customDailyHoursByWeekday[dayIdx]);
                const items = concursoData.dateSchedule?.[dateKey] || [];
                const hasNormalStudy = Array.isArray(items) && items.some(item => !String(item).startsWith('🔄 Rev'));
                if (!hasNormalStudy) return 0;
                return Number.isFinite(custom) && custom > 0 ? custom : 0;
            }
            const target = Number(concursoData.pomodoroDailyTargetHours || 0);
            return Number.isFinite(target) && target > 0 ? target : 0;
        }

        function formatStudyMinutes(totalMinutes) {
            const safeMinutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
            const hours = Math.floor(safeMinutes / 60);
            const minutes = safeMinutes % 60;
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }

        function renderPomodoroDailyCounter() {
            const generalEl = document.getElementById('generalPomodoroTotal');
            const totalEl = document.getElementById('dailyPomodoroTotal');
            const targetEl = document.getElementById('dailyPomodoroTarget');
            const progressEl = document.getElementById('dailyPomodoroProgress');
            const statusEl = document.getElementById('dailyPomodoroStatus');
            if (!generalEl || !totalEl || !targetEl || !progressEl || !statusEl) return;
            renderActiveStudyContext();
            renderSubjectStudyHours();

            const studiedMinutes = getDailyPomodoroMinutes();
            const targetHours = getPomodoroDailyTargetHours();
            const targetMinutes = Math.round(targetHours * 60);

            generalEl.textContent = formatStudyMinutes(getGeneralPomodoroMinutes());
            totalEl.textContent = formatStudyMinutes(studiedMinutes);

            if (!targetMinutes) {
                targetEl.textContent = 'Sem meta';
                progressEl.style.width = '0%';
                const contest = getConcursosMetadata()[currentConcurso] || {};
                statusEl.textContent = isFlexibleOpportunityMode(contest)
                    ? 'Modo flexível ativo • estude quando surgir uma oportunidade. Use “Estudar agora”.'
                    : 'Gere um cronograma para definir a meta diária ou use o modo Estudo por Oportunidade.';
                return;
            }

            targetEl.textContent = `${targetHours}h`;
            const percent = (studiedMinutes / targetMinutes) * 100;
            progressEl.style.width = `${Math.min(100, Math.max(0, percent))}%`;

            if (studiedMinutes < targetMinutes) {
                const remaining = targetMinutes - studiedMinutes;
                statusEl.textContent = `${Math.round(percent)}% da meta concluída • Restam ${formatStudyMinutes(remaining)}.`;
            } else if (studiedMinutes === targetMinutes) {
                statusEl.textContent = 'Meta diária concluída.';
            } else {
                const extra = studiedMinutes - targetMinutes;
                statusEl.textContent = `Meta concluída • ${formatStudyMinutes(extra)} de estudo extra hoje.`;
            }
        }

        function resetDailyPomodoroHours() {
            if (!confirm('Deseja zerar todas as horas Pomodoro contabilizadas hoje?')) return;
            localStorage.removeItem(getDailyPomodoroStorageKey());
            localStorage.removeItem(getDailyPomodoroExtraStorageKey());
            removeStudySessionsForDate(getLocalDateKey());
            renderPomodoroDailyCounter();
        }

        function updatePauseButton() {
            const pauseBtn = document.getElementById('pauseTimerBtn');
            const completeBtn = document.getElementById('completeFocusBtn');
            if (pauseBtn) {
                pauseBtn.disabled = !timerHasStarted || timeLeft <= 0;
                pauseBtn.textContent = isTimerPaused ? 'Continuar' : 'Pausar';
            }
            if (completeBtn) {
                const elapsedSeconds = Math.max(0, (Number(currentTimerTotalSeconds) || 0) - (Number(timeLeft) || 0));
                completeBtn.disabled = timerMode !== 'focus' || !timerHasStarted || focusSessionCommitted || elapsedSeconds < 60 || !activeStudyContext;
                completeBtn.title = activeStudyContext ? 'Concluir e contabilizar os minutos completos já estudados' : 'Inicie uma atividade pelo cronograma para contabilizar a sessão';
            }
        }

        function updateTimerSettings() {
            if (!timerInterval && !isTimerPaused) {
                timeLeft = (parseInt(document.getElementById('focoMin').value) || 40) * 60;
                currentTimerTotalSeconds = timeLeft;
                updateDisplay();
            }
        }

        function getPomodoroRingProgress() {
            const total = Math.max(1, Number(currentTimerTotalSeconds) || 1);
            const safeLeft = Math.max(0, Number(timeLeft) || 0);
            const elapsedRatio = Math.min(1, Math.max(0, (total - safeLeft) / total));
            return elapsedRatio;
        }

        function updateDisplay() {
            const min = Math.floor(timeLeft / 60);
            const sec = timeLeft % 60;
            const timerEl = document.getElementById('timer');
            const ringEl = document.getElementById('pomodoroRing');
            const modeLabel = timerMode === 'focus' ? 'foco' : 'intervalo';
            if (timerEl) {
                timerEl.innerHTML = `
                    <span class="timer-display-number">${min.toString().padStart(2, '0')}</span>
                    <span class="timer-display-unit">min</span>
                    <span class="timer-display-meta">${sec.toString().padStart(2, '0')}s • ${modeLabel}</span>
                `;
            }
            if (ringEl) {
                ringEl.style.setProperty('--timer-progress', String(getPomodoroRingProgress()));
                ringEl.style.setProperty('--timer-accent', timerMode === 'focus' ? 'var(--modern-blue-2)' : 'var(--modern-warning)');
                ringEl.dataset.mode = timerMode;
                ringEl.setAttribute('aria-label', `${min} minutos e ${sec} segundos restantes — ${modeLabel}`);
            }
            updatePauseButton();
        }

        function startTimer() {
            if (timerInterval || timeLeft <= 0) return;
            preparePomodoroAudio();

            const isNewCycle = !timerHasStarted;
            if (isNewCycle && timerMode === 'focus') {
                focusSessionCommitted = false;
                currentFocusCycleMinutes = Math.max(1, parseInt(document.getElementById('focoMin').value) || 40);
                currentTimerTotalSeconds = currentFocusCycleMinutes * 60;
                playPomodoroStartBell();
            }
            if (isNewCycle && timerMode === 'interval') {
                currentTimerTotalSeconds = Math.max(1, parseInt(document.getElementById('pausaMin').value) || 5) * 60;
            }

            timerHasStarted = true;
            isTimerPaused = false;
            updatePauseButton();

            timerInterval = setInterval(async () => {
                if (timeLeft > 0) {
                    timeLeft--;
                    updateDisplay();
                }

                if (timeLeft <= 0) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                    timerHasStarted = false;
                    isTimerPaused = false;
                    if (timerMode === 'focus') {
                        if (focusSessionCommitted) { updatePauseButton(); return; }
                        focusSessionCommitted = true;
                        const sessionMinutes = Math.max(0, Number(currentFocusCycleMinutes) || 0);
                        const studiedBefore = getDailyPomodoroMinutes();
                        const targetMinutes = Math.round(getPomodoroDailyTargetHours() * 60);
                        const studiedAfter = studiedBefore + sessionMinutes;
                        if (targetMinutes > 0) {
                            const extraBefore = Math.max(0, studiedBefore - targetMinutes);
                            const extraAfter = Math.max(0, studiedAfter - targetMinutes);
                            const newExtraMinutes = Math.max(0, extraAfter - extraBefore);
                            if (newExtraMinutes > 0) addDailyPomodoroExtraMinutes(newExtraMinutes);
                        }
                        let finalContext = null;
                        if (activeStudyContext && activeStudyContext.concurso === currentConcurso && sessionMinutes > 0) {
                            finalContext = finalizeLegalArticleRangeForSession({ ...activeStudyContext });
                            try {
                                const committedSession = await recordStudyMinutesForContext(sessionMinutes, finalContext);
                                if (!committedSession) throw new Error('A sessão não pôde ser vinculada ao concurso atual.');
                                await updateLegalReadingBlockAfterSession(finalContext);
                            } catch (error) {
                                console.error('Falha ao registrar sessão concluída:', error);
                                await appNotice('A sessão terminou, mas houve uma falha ao registrar o tempo. Os dados locais foram preservados quando possível. Tente sincronizar novamente.', { title:'Falha ao contabilizar tempo' });
                            }
                        }
                        // Compatibilidade com o contador legado; a fonte canônica permanece studySessions.
                        setDailyPomodoroMinutes(getDailyPomodoroMinutes());
                        currentFocusCycleMinutes = 0;
                        updatePauseButton();
                        playPomodoroCompletionBell();
                        const needsPostSessionFeedback = finalContext?.activityType === 'questoes' || !!(finalContext?.isRevision && isAdaptiveRetentionStrategy());
                        if (!needsPostSessionFeedback) setTimeout(() => alert('Foco Finalizado!'), 2300);
                    } else {
                        currentFocusCycleMinutes = 0;
                        updatePauseButton();
                        playPomodoroCompletionBell();
                        setTimeout(() => alert('Intervalo Finalizado!'), 2300);
                    }
                }
            }, 1000);
        }

        function foldLegalStudyText(value) {
            return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        }

        function isLegalStudyMateria(materia) {
            const name = foldLegalStudyText(materia);
            if (!name) return false;
            const nonLegal = /(?:portugues|lingua portuguesa|rlm|raciocinio logico|matematica|redacao|informatica|estatistica|atualidades|ingles|espanhol|contabilidade|economia|administracao geral|gestao de pessoas)/;
            if (nonLegal.test(name)) return false;
            return /(?:\bdireito\b|constitucional|administrativ|penal|processual|civil|tributar|previdenciar|eleitoral|trabalh|legislacao|\blei\b|\bleis\b|estatuto|regimento|decreto|resolucao|codigo|constituicao|jurisprudencia|norma(?:s|tiv)|juridic|ministerio publico|defensoria|magistratura)/.test(name);
        }

        function getLegalReadingBlocks() {
            const metadata = getConcursosMetadata();
            const blocks = metadata[currentConcurso]?.legalReadingBlocks;
            return Array.isArray(blocks) ? blocks : [];
        }

        function createLegalBlockId() {
            return `legal_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
        }

        function renderLegalReadingBlockOptions(materia) {
            const select = document.getElementById('legalReadingBlockSelect');
            if (!select) return;
            const blocks = getLegalReadingBlocks().filter(block => block.materia === materia);
            select.innerHTML = '<option value="">Leitura livre / novo bloco</option>' + blocks.map(block =>
                `<option value="${escapeHtml(block.id)}">${escapeHtml(block.norma)}${block.articleStart ? ` — arts. ${escapeHtml(block.articleStart)}${block.articleEnd ? `–${escapeHtml(block.articleEnd)}` : ''}` : ''}</option>`
            ).join('');
        }

        function fillLegalReadingFromSelectedBlock() {
            const id = document.getElementById('legalReadingBlockSelect')?.value || '';
            if (!id) return;
            const block = getLegalReadingBlocks().find(item => String(item.id) === String(id));
            if (!block) return;
            document.getElementById('legalReadingNorm').value = block.norma || '';
            document.getElementById('legalReadingStartArticle').value = block.nextArticle || block.articleStart || '';
            document.getElementById('legalReadingEndArticle').value = block.articleEnd || '';
        }

        function closeLegalReadingModal() {
            const modal = document.getElementById('modalLegalReading');
            if (modal) modal.style.display = 'none';
            pendingLegalStudyContext = null;
        }

        function openLegalReadingForScheduledTopic(idx) {
            if (!activeSelectedDateKey) return;
            const metadata = getConcursosMetadata();
            const raw = metadata[currentConcurso]?.dateSchedule?.[activeSelectedDateKey]?.[idx];
            if (!raw || isRevisionScheduleText(raw)) return alert('Lei Seca deve ser iniciada a partir de um tópico normal de estudo.');
            const clean = normalizeScheduledTopicForStudy(raw);
            const matched = editalItems.find(i => `${i.materia} - ${i.assunto}` === clean);
            if (!matched) return alert('Este item não está vinculado ao edital.');
            if (!isLegalStudyMateria(matched.materia)) return alert('Lei Seca está disponível apenas para matérias jurídicas ou normativas.');

            const minutesInput = document.getElementById(`studyMinutes_${idx}`);
            const requestedMinutes = Math.max(1, Math.min(240, parseInt(minutesInput?.value || document.getElementById('focoMin')?.value || '40') || 40));
            const todayKey = getLocalDateKey();
            pendingLegalStudyContext = {
                concurso: currentConcurso,
                materia: matched.materia,
                assunto: matched.assunto,
                itemId: matched.id,
                dateKey: activeSelectedDateKey,
                plannedDateKey: activeSelectedDateKey,
                adaptiveAdvance: false,
                activityType: 'lei_seca',
                scheduleIndex: idx
            };
            document.getElementById('legalReadingContext').innerHTML = `<strong>${escapeHtml(matched.materia)}</strong> — ${escapeHtml(matched.assunto)}`;
            document.getElementById('legalReadingNorm').value = '';
            document.getElementById('legalReadingStartArticle').value = '';
            document.getElementById('legalReadingEndArticle').value = '';
            document.getElementById('legalReadingMinutes').value = requestedMinutes;
            document.getElementById('legalReadingSaveBlock').checked = true;
            renderLegalReadingBlockOptions(matched.materia);
            document.getElementById('modalLegalReading').style.display = 'flex';
        }

        async function upsertLegalReadingBlock(context) {
            if (!context?.norma || !context?.materia) return null;
            const metadata = getConcursosMetadata();
            if (!metadata[currentConcurso]) metadata[currentConcurso] = { dataProva:null, dateSchedule:{} };
            const contest = metadata[currentConcurso];
            if (!Array.isArray(contest.legalReadingBlocks)) contest.legalReadingBlocks = [];
            const selectedId = document.getElementById('legalReadingBlockSelect')?.value || context.legalBlockId || '';
            let block = contest.legalReadingBlocks.find(item => String(item.id) === String(selectedId));
            if (!block) {
                const signature = `${foldLegalStudyText(context.materia)}|${foldLegalStudyText(context.norma)}|${String(context.articleStart||'')}|${String(context.articleEnd||'')}`;
                block = contest.legalReadingBlocks.find(item => `${foldLegalStudyText(item.materia)}|${foldLegalStudyText(item.norma)}|${String(item.articleStart||'')}|${String(item.articleEnd||'')}` === signature);
            }
            if (!block) {
                block = { id:createLegalBlockId(), concursoId:currentConcurso, createdAt:new Date().toISOString() };
                contest.legalReadingBlocks.push(block);
            }
            Object.assign(block, {
                materia: context.materia,
                assunto: context.assunto,
                norma: context.norma,
                articleStart: context.articleStart || '',
                articleEnd: context.articleEnd || '',
                updatedAt: new Date().toISOString()
            });
            await saveConcursosMetadata(metadata);
            return block;
        }

        async function startLegalReadingStudy() {
            if (!pendingLegalStudyContext) return;
            const norma = String(document.getElementById('legalReadingNorm')?.value || '').trim();
            const articleStart = String(document.getElementById('legalReadingStartArticle')?.value || '').trim();
            const articleEnd = String(document.getElementById('legalReadingEndArticle')?.value || '').trim();
            const requestedMinutes = Math.max(1, Math.min(240, parseInt(document.getElementById('legalReadingMinutes')?.value || '40') || 40));
            if (!norma) return alert('Informe a norma ou diploma legal que será estudado.');
            if (!articleStart) return alert('Informe o artigo inicial da leitura.');

            const todayKey = getLocalDateKey();
            const plannedDateKey = pendingLegalStudyContext.plannedDateKey;
            let adaptiveAdvance = false;
            if (plannedDateKey > todayKey) {
                adaptiveAdvance = confirm(`Este tópico está planejado para ${formatDateKeyShort(plannedDateKey)}.\n\nOK: antecipar para hoje e reorganizar a fila futura.\nCancelar: estudar Lei Seca agora sem alterar o cronograma.`);
            }
            let context = { ...pendingLegalStudyContext, norma, articleStart, articleEnd, adaptiveAdvance, dateKey: adaptiveAdvance ? todayKey : plannedDateKey };
            if (document.getElementById('legalReadingSaveBlock')?.checked) {
                const block = await upsertLegalReadingBlock(context);
                if (block) context.legalBlockId = block.id;
            }
            activeStudyContext = context;
            pendingLegalStudyContext = null;
            document.getElementById('modalLegalReading').style.display = 'none';
            renderActiveStudyContext();
            closeModalDayContent();

            const focusInput = document.getElementById('focoMin');
            if (focusInput) focusInput.value = requestedMinutes;
            clearInterval(timerInterval);
            timerInterval = null;
            timerMode = 'focus';
            timerHasStarted = false;
            isTimerPaused = false;
            currentFocusCycleMinutes = 0;
            focusSessionCommitted = false;
            timeLeft = requestedMinutes * 60;
            currentTimerTotalSeconds = timeLeft;
            updateDisplay();
            updatePauseButton();
            requestAnimationFrame(() => {
                const pomodoro = document.querySelector('.pomodoro-card');
                if (pomodoro) pomodoro.scrollIntoView({ behavior:'smooth', block:'center' });
                startTimer();
            });
        }

        function finalizeLegalArticleRangeForSession(context) {
            if (!context || context.activityType !== 'lei_seca') return context;
            const plannedEnd = String(context.articleEnd || '').trim();
            const promptText = plannedEnd
                ? `Você planejou ler até o art. ${plannedEnd}.\n\nInforme o último artigo efetivamente lido:`
                : 'Informe o último artigo efetivamente lido:';
            const finalArticle = prompt(promptText, plannedEnd || context.articleStart || '');
            if (finalArticle !== null && String(finalArticle).trim()) context.articleEnd = String(finalArticle).trim();
            return context;
        }

        async function updateLegalReadingBlockAfterSession(context) {
            if (!context?.legalBlockId || context.activityType !== 'lei_seca') return;
            const metadata = getConcursosMetadata();
            const contest = metadata[currentConcurso];
            const block = contest?.legalReadingBlocks?.find(item => String(item.id) === String(context.legalBlockId));
            if (!block) return;
            block.lastStudiedAt = new Date().toISOString();
            block.lastArticleRead = context.articleEnd || context.articleStart || null;
            const n = parseInt(String(block.lastArticleRead || '').replace(/\D/g,''), 10);
            if (Number.isFinite(n)) block.nextArticle = String(n + 1);
            block.sessions = Math.max(0, Number(block.sessions || 0)) + 1;
            await saveConcursosMetadata(metadata);
        }

        async function completeFocusSessionNow() {
            if (timerMode !== 'focus' || !timerHasStarted || focusSessionCommitted) return;
            if (!activeStudyContext || activeStudyContext.concurso !== currentConcurso) {
                return alert('Inicie Teoria, Questões ou Lei Seca pelo cronograma antes de concluir uma sessão contabilizável.');
            }
            const elapsedSeconds = Math.max(0, (Number(currentTimerTotalSeconds) || 0) - (Number(timeLeft) || 0));
            const completedMinutes = Math.floor(elapsedSeconds / 60);
            if (completedMinutes < 1) return alert('Complete pelo menos 1 minuto de foco antes de contabilizar a sessão.');
            if (!confirm(`Concluir esta sessão agora e contabilizar ${completedMinutes} min de estudo?`)) return;

            clearInterval(timerInterval);
            timerInterval = null;
            isTimerPaused = false;
            focusSessionCommitted = true;
            const finalContext = finalizeLegalArticleRangeForSession({ ...activeStudyContext });
            const committedSession = await recordStudyMinutesForContext(completedMinutes, finalContext);
            if (!committedSession) {
                focusSessionCommitted = false;
                return appNotice('Não foi possível vincular esta sessão ao concurso atual. Reabra o tópico pelo cronograma e tente novamente.', { title:'Sessão não contabilizada' });
            }
            await updateLegalReadingBlockAfterSession(finalContext);

            currentFocusCycleMinutes = 0;
            timerHasStarted = false;
            timerMode = 'focus';
            timeLeft = (parseInt(document.getElementById('focoMin')?.value || '40') || 40) * 60;
            currentTimerTotalSeconds = timeLeft;
            updateDisplay();
            renderPomodoroDailyCounter();
            playPomodoroCompletionBell();
            const needsPostSessionFeedback = finalContext?.activityType === 'questoes' || !!(finalContext?.isRevision && isAdaptiveRetentionStrategy());
            if (!needsPostSessionFeedback) setTimeout(() => alert(`Sessão concluída: ${completedMinutes} min contabilizados.`), 500);
        }

        function startFocusTimer() {
            if (timerMode !== 'focus' || (!timerHasStarted && timeLeft <= 0)) {
                clearInterval(timerInterval);
                timerInterval = null;
                timerMode = 'focus';
                timerHasStarted = false;
                isTimerPaused = false;
                currentFocusCycleMinutes = 0;
                focusSessionCommitted = false;
                timeLeft = (parseInt(document.getElementById('focoMin').value) || 40) * 60;
                currentTimerTotalSeconds = timeLeft;
                updateDisplay();
            }
            startTimer();
        }

        function startIntervalTimer() {
            clearInterval(timerInterval);
            timerInterval = null;
            timerMode = 'interval';
            timerHasStarted = false;
            isTimerPaused = false;
            currentFocusCycleMinutes = 0;
            focusSessionCommitted = false;
            timeLeft = (parseInt(document.getElementById('pausaMin').value) || 5) * 60;
            currentTimerTotalSeconds = timeLeft;
            updateDisplay();
            playPomodoroPauseBell();
            startTimer();
        }

        function togglePauseTimer() {
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
                isTimerPaused = true;
                playPomodoroPauseBell();
                updatePauseButton();
                return;
            }

            if (isTimerPaused && timerHasStarted && timeLeft > 0) {
                startTimer();
            }
        }

        function resetTimer() {
            clearInterval(timerInterval);
            timerInterval = null;
            isTimerPaused = false;
            timerHasStarted = false;
            timerMode = 'focus';
            focusSessionCommitted = false;
            currentFocusCycleMinutes = 0;
            timeLeft = (parseInt(document.getElementById('focoMin').value) || 40) * 60;
            currentTimerTotalSeconds = timeLeft;
            updateDisplay();
            updatePauseButton();
        }


        // =========================================================
        // ANALISADOR DE EDITAL COM IA — ADAPTIVE UNIVERSAL PARSER / V8
        // Estratégia adaptativa: PDF -> estrutura -> bloco/cargo -> matéria -> assunto.
        // A IA não pode inventar a hierarquia; fallback é validado contra o texto-fonte.
        // =========================================================
        let currentAiEditalAnalysis = null;
        let pdfJsAiLoadPromise = null;
        let aiEditalPdfCache = null;

        function setAiEditalStatus(message, isError = false) {
            const box = document.getElementById('aiEditalStatus');
            if (!box) return;
            box.textContent = message || '';
            box.classList.toggle('visible', !!message);
            box.style.borderColor = isError ? 'rgba(239,68,68,0.55)' : 'rgba(59,130,246,0.28)';
            box.style.background = isError ? 'rgba(239,68,68,0.10)' : 'rgba(59,130,246,0.10)';
        }

        function foldEditalText(text) {
            return String(text || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[–—]/g, '-')
                .replace(/\s+/g, ' ')
                .trim();
        }

        const PDF_JS_URL = './vendor/pdf.min.js';
        const PDF_JS_WORKER_URL = './vendor/pdf.worker.min.js';

        function loadPdfJsForAI() {
            if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
            if (pdfJsAiLoadPromise) return pdfJsAiLoadPromise;
            pdfJsAiLoadPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = PDF_JS_URL;
                script.async = true;
                script.onload = () => {
                    if (!window.pdfjsLib) return reject(new Error('PDF.js não foi inicializado.'));
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL;
                    resolve(window.pdfjsLib);
                };
                script.onerror = () => {
                    script.remove();
                    reject(new Error('Não foi possível carregar o leitor PDF.js do pacote do aplicativo. Conecte-se uma vez para preparar o cache offline e tente novamente.'));
                };
                document.head.appendChild(script);
            });
            return pdfJsAiLoadPromise;
        }

        function normalizeEditalPageText(text) {
            return String(text || '')
                .replace(/\u0000/g, ' ')
                .replace(/[ \t]+/g, ' ')
                .replace(/\s*\n\s*/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }

        function extractPdfPageTextWithLayout(items) {
            const tokens = (Array.isArray(items) ? items : [])
                .map((item, order) => {
                    const str = String(item?.str || '').replace(/\u0000/g, ' ').trim();
                    const transform = Array.isArray(item?.transform) ? item.transform : [];
                    const a = Number(transform[0]) || 0;
                    const b = Number(transform[1]) || 0;
                    const fontSize = Math.max(1, Math.sqrt((a * a) + (b * b)) || Math.abs(Number(transform[3])) || 10);
                    return {
                        str,
                        x: Number.isFinite(Number(transform[4])) ? Number(transform[4]) : 0,
                        y: Number.isFinite(Number(transform[5])) ? Number(transform[5]) : 0,
                        width: Math.max(0, Number(item?.width) || 0),
                        fontSize,
                        fontName: String(item?.fontName || ''),
                        order
                    };
                })
                .filter(t => t.str);

            if (!tokens.length) return { text: '', lines: [] };

            const tolerance = 2.8;
            const rawLines = [];
            for (const token of tokens) {
                let line = rawLines.find(l => Math.abs(l.y - token.y) <= tolerance);
                if (!line) {
                    line = { y: token.y, tokens: [] };
                    rawLines.push(line);
                }
                line.tokens.push(token);
            }

            rawLines.sort((a, b) => b.y - a.y);
            const lines = rawLines.map(line => {
                line.tokens.sort((a, b) => (a.x - b.x) || (a.order - b.order));
                let text = '';
                for (let ti=0; ti<line.tokens.length; ti++) {
                    const token=line.tokens[ti];
                    if (!ti) { text=token.str; continue; }
                    const prev=line.tokens[ti-1];
                    const prevEnd=(prev.x||0)+(prev.width||0);
                    const gap=(token.x||0)-prevEnd;
                    const tinyGap = Number.isFinite(gap) && gap <= Math.max(1.35, Math.min(prev.fontSize||10, token.fontSize||10) * .16);
                    const wordFragments = /[A-Za-zÀ-ÿ]$/.test(prev.str) && /^[A-Za-zÀ-ÿ]/.test(token.str);
                    // Alguns PDFs dividem a mesma palavra em vários text-items ("M" + "edicina",
                    // "Conhecim" + "entos"). Só preserva espaço quando existe distância gráfica real.
                    text += (tinyGap && wordFragments ? '' : ' ') + token.str;
                }
                text = text
                    .replace(/\s+([,.;:!?])/g, '$1')
                    .replace(/\(\s+/g, '(')
                    .replace(/\s+\)/g, ')')
                    .replace(/[ \t]{2,}/g, ' ')
                    .trim();
                const fontSize = line.tokens.reduce((m,t)=>Math.max(m,t.fontSize||0),0) || 10;
                const x = line.tokens.length ? Math.min(...line.tokens.map(t=>t.x)) : 0;
                const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '');
                const uppers = text.replace(/[^A-ZÁÉÍÓÚÂÊÔÃÕÇ]/g, '');
                const uppercaseRatio = letters.length ? uppers.length / letters.length : 0;
                const boldRatio = line.tokens.length ? line.tokens.filter(t => /bold|black|heavy|semibold/i.test(t.fontName)).length / line.tokens.length : 0;
                return { text, y: line.y, x, fontSize, uppercaseRatio, boldRatio };
            }).filter(l => l.text);

            const text = normalizeEditalPageText(lines.map(l=>l.text).join('\n'));
            return { text, lines };
        }

        function isPdfNoiseLine(line) {
            const f = foldEditalText(line);
            return !f ||
                /^diario da justica eletronico administrativo/.test(f) ||
                /^edicao:\s*\d+/.test(f) ||
                /^pagina \d+ de \d+$/.test(f) ||
                /^edital \d+\/\d+/.test(f);
        }

        function flattenPdfLines(pages) {
            const out = [];
            pages.forEach(p => {
                const sourceLines = Array.isArray(p.lines) && p.lines.length
                    ? p.lines
                    : String(p.text || '').split(/\n+/).map(text => ({ text }));
                sourceLines.forEach((raw, lineInPage) => {
                    const text = String(raw?.text ?? raw ?? '').trim();
                    if (!text || isPdfNoiseLine(text)) return;
                    out.push({
                        text,
                        pageNumber: p.pageNumber,
                        lineInPage,
                        x: Number(raw?.x) || 0,
                        y: Number(raw?.y) || 0,
                        fontSize: Number(raw?.fontSize) || 10,
                        uppercaseRatio: Number(raw?.uppercaseRatio) || 0,
                        boldRatio: Number(raw?.boldRatio) || 0
                    });
                });
            });
            return out;
        }

        // =========================================================
        // UNIVERSAL PARSER V8 — ADAPTIVE STRUCTURE ENGINE
        // Baseado em padrões reais de FCC, FGV, IDECAN, Cebraspe,
        // Consulpam, Vunesp, AOCP e IBFC, sem regras exclusivas por banca.
        // A lista abaixo é somente pista lexical: headings desconhecidos
        // continuam sendo detectados por layout/estrutura.
        // =========================================================
        const AI_DISCIPLINE_NAMES = [
            'Língua Portuguesa','Português','Redação','Raciocínio Lógico-Matemático','Raciocínio Lógico','Raciocínio Lógico Quantitativo','Matemática','Matemática e Raciocínio Lógico',
            'Noções de Informática','Informática','Noções Básicas de Informática','Tecnologia da Informação','Tecnologia da Informação e Segurança Cibernética',
            'Atualidades','Conhecimentos Gerais','Conhecimentos Regionais','Conhecimentos sobre o Município','Realidade Étnica, Social, Histórica, Geográfica, Cultural, Política e Econômica',
            'Noções sobre Direitos das Pessoas com Deficiência','Direitos das Pessoas com Deficiência','Direitos Humanos','Noções de Direitos Humanos','Ética no Serviço Público',
            'Legislação','Legislação Geral','Legislação Institucional','Legislação Estadual e Institucional','Legislação Penal Especial','Legislação Penal e Processual Penal Extravagante',
            'Direito Constitucional','Direito Administrativo','Direito Administrativo e Gestão Pública','Direito Civil','Direito Processual Civil','Direito Penal','Direito Processual Penal',
            'Noções de Direito Constitucional','Noções de Direito Administrativo','Noções de Direito Civil','Noções de Direito Processual Civil','Noções de Direito Penal','Noções de Direito Processual Penal',
            'Direito do Trabalho','Direito Processual do Trabalho','Direito Tributário','Direito Financeiro','Direito Previdenciário','Direito Eleitoral','Direito Empresarial','Direito Ambiental',
            'Administração Pública','Noções de Administração Pública','Administração Geral','Noções de Administração','Noções de Administração/Situações Gerenciais','Gestão Pública','Gestão de Pessoas','Língua Portuguesa e Redação Oficial','Legislação Aplicada ao Sistema CFA/CRAs','Ética e Administração Pública','Saúde Pública','Inglês Técnico Marítimo',
            'Contabilidade Geral','Contabilidade Aplicada ao Setor Público','Contabilidade Tributária','Contabilidade','Auditoria','Noções de Auditoria Governamental','Administração Orçamentária e Financeira',
            'Arquivologia','Estatística','Economia','Organização Judiciária','Medicina Legal','Ciências Forenses','Conhecimentos Técnicos',
            'Promoção da Igualdade Racial e de Gênero','Segurança da Informação','Infraestrutura de TI e Redes','Computação em Nuvem','Administração de Sistemas e Plataformas',
            'Banco de Dados','Programação','Redes de Computadores','Sistemas Operacionais','DevOps e DevSecOps','Arquitetura de Sistemas','Desenvolvimento de Aplicações Web e Mobile','Gestão e Governança de Tecnologia da Informação'
        ];

        const GENERIC_SCOPE_WORDS = new Set([
            'conhecimentos gerais','conhecimentos basicos','conhecimentos básicos','conhecimentos comuns','conhecimentos especificos','conhecimentos específicos',
            'conteudo programatico','conteúdo programático','conteudos programaticos','conteúdos programáticos','programa das provas','programa de provas','objetos de avaliacao','objetos de avaliação'
        ]);

        function titleCaseLoose(value) {
            const raw = String(value || '').replace(/\s+/g,' ').trim();
            if (!raw) return raw;
            if (raw !== raw.toLocaleUpperCase('pt-BR')) return raw;
            const small = new Set(['de','da','do','das','dos','e','em','para','com']);
            return raw.toLocaleLowerCase('pt-BR').split(' ').map((w,i)=>{
                if (i && small.has(w)) return w;
                return w ? w[0].toLocaleUpperCase('pt-BR') + w.slice(1) : w;
            }).join(' ');
        }

        function stripSectionNumber(value) {
            return String(value || '').replace(/^\s*(?:\d+(?:\.\d+)*[.)-]?|[IVXLCDM]+[.)-])\s+/i,'').trim();
        }

        function findKnownDisciplineAtStart(line) {
            const raw = stripSectionNumber(String(line || '').trim());
            const folded = foldEditalText(raw);
            if (!folded) return null;
            let best = null;
            for (const name of AI_DISCIPLINE_NAMES) {
                const f = foldEditalText(name);
                if (folded === f || folded.startsWith(f + ':') || folded.startsWith(f + ' -') || folded.startsWith(f + ' (')) {
                    if (!best || f.length > best.folded.length) best = { name, folded:f };
                }
            }
            if (!best) return null;
            let remainder = raw.slice(best.folded.length).trim();
            if (remainder.startsWith('(')) {
                const colon = remainder.indexOf(':');
                remainder = colon >= 0 ? remainder.slice(colon + 1).trim() : '';
            } else remainder = remainder.replace(/^\s*[:\-–—]\s*/,'').trim();
            return { name: best.name, remainder };
        }

        function canonicalCargoLabel(code, rawLabel) {
            const label = titleCaseLoose(String(rawLabel || '').replace(/\s+/g,' ').trim().replace(/[–—-]+$/g,'').trim()) || 'Bloco específico';
            return code ? `${code} – ${label}` : label;
        }


        function cleanCargoDisplayName(cargo) {
            const code = String(cargo?.code || '').trim();
            let raw = String(cargo?.rawLabel || cargo?.label || '').replace(/\s+/g,' ').trim();
            if (!raw) return code || 'Cargo';

            // Remove código que já tenha sido incorporado ao label interno.
            if (code && code !== '__FULL__') {
                const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                raw = raw.replace(new RegExp('^' + escaped + '\s*[–—-]\s*', 'i'), '').trim();
            }

            // Remove numeração estrutural que pode anteceder o cargo (2.1, 20.2.4.2.10 etc.).
            raw = raw.replace(/^\s*[.·•-]*\s*\d+(?:\.\d+)*\s*[.)-]?\s*/,'').trim();

            // Formatos explícitos de especialidade: ex. ESPECIALIDADE: AGENTE SOCIAL (CARGO 200).
            const esp = raw.match(/\bESPECIALIDADE\s*:\s*(.+?)(?=\s*\(\s*CARGO\b|$)/i);
            if (esp?.[1]) raw = esp[1].trim();

            // Formatos com trilha + separador: "... (TDAS) – – Técnico Administrativo".
            const dashParts = raw.split(/\s+[–—]\s+/).map(v=>v.replace(/^[-–—\s]+|[-–—\s]+$/g,'').trim()).filter(Boolean);
            if (dashParts.length >= 2) {
                const last = dashParts[dashParts.length - 1];
                // Prefere o último segmento quando ele não é apenas nível/código/metadado.
                if (last && !/^(nível|nivel|cargo|código|codigo|conhecimentos?|programa|prova)\b/i.test(last)) raw = last;
            }

            // IADES/Fundatec e similares: ADMINISTRADOR – NÍVEL SUPERIOR (CÓDIGO 101).
            raw = raw
                .replace(/\s*[–—-]\s*N[IÍ]VEL\s+(?:SUPERIOR|M[EÉ]DIO|FUNDAMENTAL).*$/i,'')
                .replace(/\s*\(\s*C[ÓO]DIGO\s*\d+\s*\)\s*$/i,'')
                .replace(/\s*\(\s*CARGO\s*\d+\s*\)\s*$/i,'')
                .replace(/^\s*(?:CARGO|FUNÇÃO|FUNCAO)\s*\d*\s*[:–—-]\s*/i,'')
                .replace(/^\s*CARGOS?\s+[0-9\s,E\/A-]+\s*:\s*/i,'')
                .replace(/\s+/g,' ')
                .trim();

            if (!raw || isMetaRoleLabel(raw)) raw = String(cargo?.rawLabel || cargo?.label || 'Cargo').trim();
            return titleCaseLoose(raw);
        }

        function cargoSelectLabel(cargo) {
            const name = cleanCargoDisplayName(cargo);
            const internalCode = String(cargo?.code || '').trim();
            const publishedCode = String(cargo?.publishedCode || '').trim();
            const code = publishedCode || internalCode;
            if (!code || internalCode === '__FULL__' || /^BL\d+$/i.test(internalCode)) return name;
            return `${code} — ${name}`;
        }

        function hashEditalText(value) {
            let h = 2166136261;
            const text = String(value || '');
            for (let i=0;i<text.length;i++){ h ^= text.charCodeAt(i); h = Math.imul(h,16777619); }
            return h >>> 0;
        }

        function roleSignal(text) {
            return /(delegad[oa]|agente|escriv[aã]o|papiloscopista|analista|t[eé]cnico|auditor|assistente|oficial|soldado|pra[cç]a|capel[aã]o|especialista|professor|docente|m[eé]dico|enfermeir[oa]|engenheir[oa]|psic[oó]log[oa]|contador|advogad[oa]|procurador|perito|nutricionista|dentista|auxiliar|fiscal|inspetor|censit[aá]rio|administrador|administrativo|secret[aá]ri[oa]|motorista|operador|eletricista|mec[aâ]nico|cozinheir[oa]|taifeiro|mo[cç]o|condutor|pintor|rasteleiro|farmac[eê]utico|fisioterapeuta|veterin[aá]ri[oa]|pedagog[oa]|soci[oó]log[oa]|bi[oó]log[oa]|agrimensura|servi[cç]o social|comunica[cç][aã]o social|ci[eê]ncias cont[aá]beis|economia|estat[ií]stica)/i.test(String(text||''));
        }

        function normalizeEducationLevel(text) {
            const f = foldEditalText(text);
            if (/nivel fundamental|ensino fundamental/.test(f)) return 'fundamental';
            if (/nivel medio|ensino medio|ensino médio/.test(f)) return 'medio';
            if (/nivel superior|ensino superior|graduacao|graduação|bacharelado|licenciatura/.test(f)) return 'superior';
            return '';
        }

        function findProgramStartIndex(lines) {
            const aliases = [
                'conteudo programatico','conteudos programaticos','conteudo das provas','conteudos das provas','programa das provas','programa de provas','programa da prova',
                'dos conteudos programaticos','dos conteúdos programáticos','objetos de avaliacao','dos objetos de avaliacao','objetos de avaliação','dos objetos de avaliação','programas - prova base','programas - conhecimentos especificos','programas – prova base','programas – conhecimentos específicos','habilidades e conhecimentos','ementas','ementa'
            ];
            let best=-1,bestScore=-1;
            for (let i=0;i<lines.length;i++) {
                const raw=String(lines[i].text||'').trim();
                const f=foldEditalText(raw); let score=0;
                for (const a of aliases) {
                    const af=foldEditalText(a);
                    if (f===af) score=Math.max(score,18); // heading canônico
                    else if (f.startsWith(af) && f.length<110) score=Math.max(score,14);
                    else if (f.includes(af) && f.length<150) score=Math.max(score,8); // mera referência no corpo
                }
                // Referências como “conteúdo programático constante do Anexo B” não são início do conteúdo.
                if (/(constante|conforme|previsto|indicado)\s+(?:no|na|do|da)?\s*[“"']?anexo\b/.test(f) || /conteudo programatico constante/.test(f)) score -= 7;
                // Heading de ANEXO imediatamente antes/depois do marcador recebe forte bônus.
                const prev=foldEditalText(lines[i-1]?.text||''), next=foldEditalText(lines[i+1]?.text||'');
                if (/^anexo\s+[a-zivxlcdm\d]+\b/.test(prev) || /^anexo\s+[a-zivxlcdm\d]+\b/.test(f)) score += 8;
                if (/^anexo\s+[a-zivxlcdm\d]+\b/.test(next)) score += 3;
                if (/^\d+(?:\.\d+)*\s+dos objetos de avaliacao/.test(f)) score = Math.max(score,15);
                if ((lines[i].uppercaseRatio||0)>.7) score += 2;
                // Se logo após o marcador há headings de disciplina, trata-se quase certamente do bloco real.
                let disciplineLookahead=0;
                for (let j=i+1;j<Math.min(lines.length,i+12);j++) {
                    const t=String(lines[j]?.text||'').trim();
                    if (!t) continue;
                    if (findKnownDisciplineAtStart(stripSectionNumber(t))) disciplineLookahead++;
                    else {
                        const letters=t.replace(/[^A-Za-zÀ-ÿ]/g,''), uppers=t.replace(/[^A-ZÁÉÍÓÚÂÊÔÃÕÇ]/g,'');
                        const ratio=letters.length?uppers.length/letters.length:0;
                        if (ratio>.82 && t.split(/\s+/).length<=10 && !/[.;!?]$/.test(t)) disciplineLookahead++;
                    }
                }
                if (disciplineLookahead>=1) score += 5;
                if (disciplineLookahead>=2) score += 5;
                if (score>0) score += Math.min(2, i/Math.max(1,lines.length)*2);
                if (score>bestScore){bestScore=score;best=i;}
            }
            if (bestScore>=10) return best;
            for (let i=Math.floor(lines.length*.35);i<lines.length;i++) {
                const f=foldEditalText(lines[i].text);
                if (/^(conhecimentos|disciplinas|materias)\b/.test(f)) return Math.max(0,i-1);
            }
            return -1;
        }

        function sanitizeSingleRoleCandidate(value) {
            let raw=String(value||'').replace(/\s+/g,' ').trim();
            if (!raw) return '';

            // V9.13: o nome do cargo deve ser um sintagma nominal, nunca a frase administrativa
            // inteira onde ele apareceu. Essas regras são semânticas e independentes de banca.
            raw=raw
                .replace(/^\s*(?:cargo|emprego|fun[cç][aã]o)\s+(?:p[uú]blico\s+)?(?:inicial\s+)?(?:de\s+)?/i,'')
                .replace(/^\s*(?:inicial|efetivo|efetiva|de\s+provimento\s+efetivo)\s+de\s+/i,'')
                .replace(/\s*,?\s+(?:por\s+meio\s+de|mediante|atrav[eé]s\s+de)\s+(?:concurso|processo\s+seletivo)\b.*$/i,'')
                .replace(/\s+(?:do|da|de)\s+quadro\b.*$/i,'')
                .replace(/\s+(?:da|do)\s+carreira\b.*$/i,'')
                .replace(/\s+(?:é|e)\s+de\s+R\$.*$/i,'')
                .replace(/\s+(?:com|cuja|cujo)\s+(?:remunera[cç][aã]o|sal[aá]rio|vencimento|subs[ií]dio|jornada|carga\s+hor[aá]ria|lota[cç][aã]o|vagas?)\b.*$/i,'')
                .replace(/\s+(?:remunera[cç][aã]o|sal[aá]rio|vencimento|subs[ií]dio|jornada|carga\s+hor[aá]ria|lota[cç][aã]o)\s*[:=-].*$/i,'')
                .replace(/\s+(?:que|o qual|a qual)\s+(?:ser[aá]|ter[aá]|possui|receber[aá]|exercer[aá])\b.*$/i,'')
                .replace(/\s+e\s+estabelece\b.*$/i,'')
                .replace(/[,:;\-–—]+$/,'')
                .trim();

            // Normaliza hífen quebrado pelo PDF.js sem destruir travessões semânticos longos.
            raw=raw.replace(/([A-Za-zÀ-ÿ])\s+-\s+([A-Za-zÀ-ÿ])/g,'$1-$2');

            const f=foldEditalText(raw);
            if (isAdministrativeRoleFragment(raw)) return '';
            if (/R\$|\b(?:remunera[cç][aã]o|sal[aá]rio|vencimento|subs[ií]dio|carga\s+hor[aá]ria|jornada|lota[cç][aã]o)\b/i.test(raw)) return '';
            if (/\b(?:por meio de|mediante concurso|concurso publico de provas|processo seletivo|sera|serao|visando ao|destinado a)\b/.test(f)) return '';
            if ((raw.match(/\d/g)||[]).length>5) return '';
            if (raw.length<3 || raw.length>105 || raw.split(/\s+/).length>14) return '';
            return raw;
        }

        function inferSingleRoleFromPreamble(lines, programStart) {
            const limit=Math.min(programStart>0?programStart:lines.length, Math.max(320, Math.floor(lines.length*.30)));
            const candidates=[];

            const pushCandidate=(value,index,score,source)=>{
                const cleaned=sanitizeSingleRoleCandidate(value);
                if (!cleaned || isMetaRoleLabel(cleaned) || findKnownDisciplineAtStart(cleaned)) return;
                candidates.push({label:titleCaseLoose(cleaned),index,score,source});
            };

            // PDF costuma quebrar uma única frase em 2–4 linhas. Reconstruímos janelas curtas
            // antes de aplicar a gramática de cargo, mantendo a posição de origem para ranking.
            const windows=[];
            for(let i=0;i<limit;i++){
                let text='';
                for(let span=1;span<=4 && i+span<=limit;span++){
                    const part=String(lines[i+span-1]?.text||'').replace(/\s+/g,' ').trim();
                    if(!part) continue;
                    text=(text+' '+part).trim();
                    if(text.length>620) break;
                    windows.push({text,index:i,span});
                }
            }

            for (const w of windows) {
                const raw=w.text;
                if (!raw || raw.length>620) continue;
                const f=foldEditalText(raw);

                // Objeto/finalidade do certame: fonte mais confiável para um cargo único.
                // Ex.: "visando ao provimento de 2.000 (...) cargos de Aluno-Soldado PM do Quadro..."
                let m=raw.match(/\b(?:provimento|preenchimento)\b.{0,260}?\bcargos?\s+de\s+(.+?)(?=\s+(?:do|da)\s+(?:quadro|carreira)\b|\s*,?\s+(?:por\s+meio\s+de|mediante)\b|[.;]|$)/i);
                if (m) pushCandidate(m[1],w.index,14,'objeto-provimento');

                m=raw.match(/\b(?:concurso|processo\s+seletivo)\b.{0,220}?\b(?:destinad[oa]s?|visando|objetiva|para)\b.{0,220}?\bcargos?\s+de\s+(.+?)(?=\s+(?:do|da)\s+(?:quadro|carreira)\b|\s*,?\s+(?:por\s+meio\s+de|mediante)\b|[.;]|$)/i);
                if (m) pushCandidate(m[1],w.index,12,'objeto-certame');

                m=raw.match(/\b(?:vagas?|oportunidades?)\s+(?:destinad[oa]s?\s+)?(?:para|ao)\s+(?:o\s+)?(?:cargo|emprego|fun[cç][aã]o)\s+de\s+(.+?)(?=[,.;]|$)/i);
                if (m) pushCandidate(m[1],w.index,11,'vagas-para');

                m=raw.match(/\b(?:selecionar|sele[cç][aã]o\s+de)\s+candidatos.{0,180}?\b(?:cargo|cargos|fun[cç][aã]o|fun[cç][oõ]es)\s+(?:de\s+)?(.+?)(?=[.;]|$)/i);
                if (m) pushCandidate(m[1],w.index,10,'selecao-candidatos');

                // Cabeçalhos explícitos têm alta precisão mesmo fora do preâmbulo narrativo.
                m=raw.match(/^\s*(?:CARGO|FUN[CÇ][AÃ]O|EMPREGO)\s*(?:\d+)?\s*[:–—-]\s*(.+)$/i);
                if (m) pushCandidate(m[1],w.index,10,'heading');

                // Fallback: aceita "cargo inicial de X", mas a sanitização remove o modificador
                // "inicial de" e qualquer cauda administrativa. Baixa prioridade por desenho.
                if (!/(remunera[cç][aã]o|sal[aá]rio|vencimento|subs[ií]dio|jornada|carga horaria|lota[cç][aã]o|valor\s+de|R\$)/i.test(f)) {
                    m=raw.match(/\b(?:cargo|fun[cç][aã]o|emprego)\s+(.+?)(?=\s+(?:do|da)\s+(?:quadro|carreira)\b|[.;]|$)/i);
                    if (m) pushCandidate(m[1],w.index,4,'fallback-cargo');
                }
            }
            if (!candidates.length) return null;

            // Agrupa equivalentes e favorece o sintagma nominal mais curto quando uma versão
            // longa contém a curta (evita "Aluno-Soldado PM, por meio de...").
            const normalized=c=>foldEditalText(c.label).replace(/[^a-z0-9]+/g,' ').trim();
            const grouped=new Map();
            for (const c of candidates) {
                const k=normalized(c); if (!k) continue;
                const g=grouped.get(k)||{...c,count:0,totalScore:0,bestScore:0};
                g.count++; g.totalScore+=c.score; g.bestScore=Math.max(g.bestScore,c.score);
                if (c.score>g.score || (c.score===g.score && c.label.length<g.label.length)) Object.assign(g,{label:c.label,index:c.index,score:c.score,source:c.source});
                grouped.set(k,g);
            }
            let ranked=[...grouped.values()];
            for(const a of ranked){
                const ka=normalized(a);
                for(const b of ranked){
                    if(a===b) continue;
                    const kb=normalized(b);
                    if(kb.length>=5 && ka!==kb && ka.includes(kb) && b.bestScore>=a.bestScore-2){
                        b.totalScore+=Math.max(1,a.bestScore*.35); b.count+=1;
                    }
                }
            }
            ranked.sort((a,b)=>(b.bestScore-a.bestScore)||(b.totalScore-a.totalScore)||(b.count-a.count)||(a.label.length-b.label.length)||(a.index-b.index));
            const top=ranked[0];
            if (!top || top.bestScore<4) return null;
            const confidence=top.bestScore>=13?.995:top.bestScore>=10?.98:top.bestScore>=7?.94:top.count>1?.88:.80;
            return {code:`BL${hashEditalText(top.label)%10000}`,label:top.label,rawLabel:top.label,confidence,segments:[],educationLevel:'',synthetic:true,singleRole:true,sourceType:top.source};
        }

        function isProgramAnnexHeadingAt(lines, i) {
            const f=foldEditalText(lines[i]?.text||'');
            if(!/^anexo\s+[a-zivxlcdm\d]+\b/.test(f)) return false;
            const window=lines.slice(i,Math.min(lines.length,i+5)).map(x=>foldEditalText(x.text)).join(' ');
            return /(conteudo|programa|conhecimento|objeto de avaliacao|prova base)/.test(window);
        }

        function findProgramEndIndex(lines, start) {
            if (start<0) return lines.length;
            let startAnnex='';
            for (let i=Math.max(0,start-2);i<=start;i++) {
                const m=foldEditalText(lines[i]?.text).match(/^anexo\s+([a-zivxlcdm\d]+)/);
                if (m) startAnnex=m[1];
            }
            for (let i=start+8;i<lines.length;i++) {
                const f=foldEditalText(lines[i].text);
                const m=f.match(/^anexo\s+([a-zivxlcdm\d]+)\b/);
                if (m && (!startAnnex || m[1]!==startAnnex)) {
                    // Anexos consecutivos também podem compor o programa (ex.: prova-base + específicos).
                    if (isProgramAnnexHeadingAt(lines,i)) continue;
                    return i;
                }
                if (/^(cronograma|calendario|calendário)\b/.test(f) && i>start+30) return i;
            }
            return lines.length;
        }

        function isProgramBlockHeading(text) {
            const f=foldEditalText(stripSectionNumber(text));
            return /^(conhecimentos|conteudos)\s+(gerais|basicos|comuns|especificos)\b/.test(f) ||
                   /^prova de conhecimentos?\s+(gerais|especificos)/.test(f) ||
                   /^parte\s+(geral|especifica)/.test(f) ||
                   /^conhecimentos comuns para todos os cargos/.test(f) || /^conhecimentos para todos os cargos/.test(f) || /^conhecimentos especificos do cargo/.test(f) || /^conhecimentos especificos comuns as especialidades/.test(f);
        }

        function extractCargoFamilyKey(text) {
            const raw=String(text||'');
            let m=raw.match(/\((TDAS|EDAS|[A-Z]{2,8})\)/i);
            if(m) return m[1].toUpperCase();
            m=raw.match(/CARGO\s+(.+?)(?:\(|$)/i);
            return m ? foldEditalText(m[1]).slice(0,80) : '';
        }

        function classifyBlockHeading(text) {
            const raw=stripSectionNumber(String(text||'').replace(/\s+/g,' ').trim());
            const f=foldEditalText(raw);
            if (!isProgramBlockHeading(raw)) return null;
            const kind=/(especific|específic)/i.test(raw)?'specific':'common';
            const level=normalizeEducationLevel(raw);
            const all=/(todos os cargos|para todos os cargos|comuns para todos)/.test(f);
            const familyKey=(/especific/.test(f) && /(do cargo|especialidades do cargo)/.test(f)) ? extractCargoFamilyKey(raw) : '';
            const familyCommon=!!familyKey && /(comuns?\s+(?:a|as|às)\s+especialidades|especificos do cargo)/.test(f);
            return {kind,level,all,raw,familyKey,familyCommon};
        }

        function parseInlineCargoBlockHeading(item) {
            const raw=String(item?.text||'').replace(/\s+/g,' ').trim();
            // FCC: CONHECIMENTOS BÁSICOS/ESPECÍFICOS para o cargo A01 – ...
            let m=raw.match(/CONHECIMENTOS\s+(B[ÁA]SICOS|GERAIS|ESPEC[ÍI]FICOS).*?(?:PARA\s+O\s+CARGO|PARA)\s+([A-Z]{1,4}\d{1,4}|\d{2,4}[A-Z]?)\s*[–—-]\s*(.+)$/i);
            if (m) return { kind:/espec/i.test(m[1])?'specific':'common', code:m[2].toUpperCase(), publishedCode:m[2].toUpperCase(), label:m[3].trim(), confidence:.99 };

            // Selecon e similares: CONHECIMENTOS ESPECÍFICOS – AGENTE ...
            m=raw.match(/^CONHECIMENTOS\s+ESPEC[ÍI]FICOS\s*[–—:-]\s*(.+)$/i);
            if(m && !/^(DO CARGO|COMUNS? ÀS|POR ESPECIALIDADE)/i.test(m[1])) {
                const label=m[1].trim();
                return {kind:'specific',code:`BL${hashEditalText(label)%10000}`,label,confidence:.99};
            }

            // Cebraspe: específicos para os cargos de AGENTE ... E ESCRIVÃO ...
            m=raw.match(/CONHECIMENTOS\s+ESPEC[ÍI]FICOS\s+PARA\s+OS?\s+CARGOS?\s+DE\s+(.+)$/i);
            if (m) return {kind:'specific', code:`GR${hashEditalText(m[1])%10000}`, label:m[1].trim(), confidence:.96, group:true};

            // Fundatec: CARGOS 01 E 02: ADMINISTRAÇÃO / CARGO 06: ENGENHARIA...
            m=raw.match(/^CARGOS?\s+([0-9]{1,3}(?:\s*(?:,|E|\/|A)\s*[0-9]{1,3})*)\s*:\s*(.+)$/i);
            if(m){
                const nums=[...m[1].matchAll(/\d+/g)].map(x=>x[0].padStart(2,'0'));
                const code=nums.length?`C${nums.join('_')}`:`BL${hashEditalText(m[2])%10000}`;
                return {kind:'specific',code,publishedCode:nums.join('/'),label:m[2].trim(),confidence:.99,codes:nums};
            }

            // Quadrix: ... ESPECIALIDADE: AGENTE SOCIAL (CARGO 200): primeiro tópico...
            m=raw.match(/^(.*?)ESPECIALIDADE\s*:\s*(.+?)\s*\(CARGO\s*(\d+)\)\s*:\s*(.*)$/i);
            if(m){
                const prefix=m[1].replace(/^\d+(?:\.\d+)*\s*/,'').trim();
                const label=(prefix?`${prefix} – `:'')+m[2].trim();
                return {kind:'specific',code:`C${m[3]}`,publishedCode:m[3],label,confidence:.995,inlineRemainder:m[4].trim(),familyKey:extractCargoFamilyKey(prefix)};
            }

            // IADES e similares: ADMINISTRADOR – NÍVEL SUPERIOR (CÓDIGO 101)
            m=stripSectionNumber(raw).match(/^(.+?)\s*[–—-]\s*N[ÍI]VEL\s+(?:M[ÉE]DIO|SUPERIOR|FUNDAMENTAL)\s*\(C[ÓO]DIGO\s*(\d+)\)\s*:?(.*)$/i);
            if(m){
                return {kind:'specific',code:`C${m[2]}`,publishedCode:m[2],label:m[1].trim(),confidence:.995,inlineRemainder:m[3].trim()};
            }

            return null;
        }

        function isMetaRoleLabel(text) {
            const f=foldEditalText(String(text||'').replace(/[_–—-]+/g,' ').replace(/\s+/g,' ').trim());
            const compact=f.replace(/\s+/g,'');
            if (!f) return true;

            const forbiddenCompact = [
                'nivelsuperior','nivelsuperiorcompleto','nivelmedio','nivelmediocompleto',
                'nivelfundamental','ensinomedio','ensinosuperior','ensinofundamental',
                'conhecimentosespecificos','conhecimentosgerais','conhecimentosbasicos',
                'conhecimentoscomuns','conteudoprogramatico','conteudosprogramaticos',
                'programa','programas','provabase','provaobjetiva','disciplinas',
                'materias','todososcargos','cargostodos'
            ];
            if (forbiddenCompact.some(x=>compact===x || compact.startsWith(x))) return true;

            if (/^(nivel|ensino)\s+(superior|medio|fundamental)\b/.test(f)) return true;
            if (/^(conhecimentos?|conteudos?|programas?|prova|parte|anexo|capitulo|secao)\b/.test(f)) return true;
            if (/^(cargos?\s*:\s*todos|cargos?\s+todos|todos\s+os\s+cargos)\b/.test(f)) return true;
            if (/^(parte\s*\d+|parte\s+(geral|especifica))$/.test(f)) return true;
            return false;
        }

        function looksLikeRoleHeading(item, perCargoContext=false) {
            const source=String(item?.text||'').replace(/\s+/g,' ').trim();
            const raw=stripSectionNumber(source).replace(/:$/,'').trim();
            if (!raw || raw.length<3 || raw.length>105) return false;
            if (isMetaRoleLabel(raw)) return false;
            if (findKnownDisciplineAtStart(raw)) return false;
            const f=foldEditalText(raw);
            if (/^(cargo|cargos|funcao|area|especialidade)$/.test(f)) return false;
            if (/^[0-9]+(?:\.[0-9]+)+/.test(source)) return false;
            if (/[.;]\s+/.test(raw) || (raw.match(/:/g)||[]).length>0) return false;
            const words=raw.split(/\s+/).filter(Boolean);
            if (words.length>11) return false;
            const letters=raw.replace(/[^A-Za-zÀ-ÿ]/g,'');
            const uppers=raw.replace(/[^A-ZÁÉÍÓÚÂÊÔÃÕÇ]/g,'');
            const upperRatio=letters.length?uppers.length/letters.length:(item?.uppercaseRatio||0);
            const strongVisual = upperRatio>=.78 || (item?.uppercaseRatio||0)>=.78 || (item?.boldRatio||0)>=.58;
            const lexicalRole = roleSignal(raw);
            if (perCargoContext) return strongVisual;
            return lexicalRole && strongVisual;
        }

        function inferEducationLevelForRole(lines, roleLabel, programStart) {
            const candidates=String(roleLabel||'').replace(/\([^)]*\)/g,'').split(/\s+E\s+|\s*\/\s*/i).map(v=>foldEditalText(v)).filter(v=>v.length>4);
            let best='';
            for (let i=0;i<programStart;i++) {
                const f=foldEditalText(lines[i].text);
                if (!candidates.some(c=>f.includes(c) || c.includes(f))) continue;
                const win=lines.slice(Math.max(0,i-8),Math.min(programStart,i+14)).map(x=>x.text).join(' ');
                const level=normalizeEducationLevel(win);
                if (level) return level;
                if (/diploma|gradua[cç][aã]o|bacharel|licenciatura/i.test(win)) best='superior';
            }
            return best;
        }

        function parseCargoAudienceDirective(text) {
            const raw=String(text||'').replace(/\s+/g,' ').trim();
            const m=raw.match(/^CARGOS?\s*:\s*(.+)$/i);
            if(!m) return null;
            const names=m[1].split(/\s*\/\s*|\s*;\s*/).map(v=>v.trim()).filter(Boolean);
            return names.length ? names : null;
        }

        function cargoMatchesAudience(cargo, audience) {
            if(!audience || !audience.length) return true;
            const labels=[cargo?.rawLabel,cargo?.label].filter(Boolean).map(foldEditalText);
            return audience.some(a=>{
                const fa=foldEditalText(a);
                return labels.some(l=>l.includes(fa)||fa.includes(l.replace(/^c\d+\s*-\s*/,'')));
            });
        }

        function filterLinesByCargoAudience(lines,cargo) {
            let audience=null;
            const out=[];
            for(const item of lines){
                const dir=parseCargoAudienceDirective(item.text);
                if(dir){ audience=dir; continue; }
                if(cargoMatchesAudience(cargo,audience)) out.push(item);
            }
            return out;
        }

        function isAdministrativeRoleFragment(text) {
            const raw=String(text||'').replace(/\s+/g,' ').trim();
            const f=foldEditalText(raw);
            if(!raw) return true;
            if(/R\$|\b\d{1,3}\s*h\/s\b|\b\d+\s*\+?\s*CR\b/i.test(raw)) return true;
            if(/\b(?:constantes?|previstos?|descritos?|discriminados?)\s+(?:do|no)\s+item\b/.test(f)) return true;
            if(/\b(?:deste|do presente)\s+edital\b/.test(f) && /\b(?:compreendera|compreenderao|etapas?|cargos?)\b/.test(f)) return true;
            if(/\b(?:compreendera|compreenderao|consistira|consistirao|serao submetidos|será submetido|sera submetido)\b/.test(f)) return true;
            if(/^(?:cargo|cargos|escolaridade|requisitos?|jornada|remuneracao|vagas?|total de vagas|cadastro de reserva)\b/.test(f)) return true;
            if(/\b(?:prova objetiva|provas objetivas|prova pratica|provas praticas|carater eliminatorio|carater classificatorio)\b/.test(f)) return true;
            return false;
        }

        function isLikelyRoleNameFragment(text) {
            const raw=String(text||'').replace(/\s+/g,' ').trim().replace(/[:;,.]+$/,'');
            if(!raw || raw.length<3 || raw.length>90) return false;
            if(isAdministrativeRoleFragment(raw) || isMetaRoleLabel(raw) || findKnownDisciplineAtStart(raw)) return false;
            const f=foldEditalText(raw);
            if(/^(?:ensino|nivel|experiencia|comprovacao|registro|curso|formacao|cn[h]?|pagina|realizacao|edital|concurso publico|ampla concorrencia|pessoas com deficiencia)\b/.test(f)) return false;
            if(/[.!?]/.test(raw)) return false;
            if((raw.match(/\d/g)||[]).length>2) return false;
            if(raw.split(/\s+/).length>12) return false;
            // Frases narrativas normalmente possuem verbos; nomes de cargo, em regra, não.
            if(/\b(?:sera|serao|devera|deverao|compreende|compreendera|consiste|destina|destina-se|realiza|realizado|possui|exige|atuara|executa|auxilia|dirige|maneja|opera)\b/i.test(f)) return false;
            return true;
        }

        function findRoleTableRanges(lines, programStart) {
            const ranges=[];
            let start=-1;
            for(let i=0;i<programStart;i++){
                const f=foldEditalText(lines[i]?.text||'');
                const marker = /(dos cargos.*(?:escolaridade|pre-requisitos|requisitos|quadro de vagas)|quadro de cargos|quadro de vagas|cargo\s+escolaridade|cargos,?\s+escolaridade)/.test(f);
                if(marker && start<0){ start=i; continue; }
                if(start>=0 && i>start+3){
                    // novo capítulo numerado encerra a tabela, salvo cabeçalhos internos da própria tabela.
                    if(/^\d+(?:\.\d+)?\s*[.)-]?\s+(?:dos|das|da|de)\s+/.test(f) && !/(cargos|vagas|escolaridade|requisitos)/.test(f)){
                        ranges.push({start,end:i}); start=-1;
                    }
                }
            }
            if(start>=0) ranges.push({start,end:programStart});
            return ranges;
        }

        function detectRoleTableGeometry(lines, range) {
            const roles=[];
            const pages=[...new Set(lines.slice(range.start,range.end).map(x=>x.pageNumber).filter(Boolean))];

            const cleanCellText=(parts)=>String((parts||[]).join(' '))
                .replace(/\s+/g,' ')
                .replace(/\s+([,.;:])/g,'$1')
                .trim()
                .replace(/[:;,.-]+$/,'')
                .trim();

            const isRequirementAnchor=(item)=>{
                const raw=String(item?.text||'').replace(/\s+/g,' ').trim();
                const f=foldEditalText(raw);
                if(!raw) return false;
                if(/^(?:escolaridade|requisitos?|jornada|remuneracao|vagas?)\b/.test(f)) return false;
                return /^(?:ensino|nivel|formacao|graduacao|curso\b|diploma\b|registro\b)/.test(f) ||
                       /^(?:fundamental|medio|superior)\b/.test(f);
            };

            const isMoneyAnchor=(item)=>/R\$\s*[\d.]+,\d{2}/i.test(String(item?.text||''));

            for(const pageNumber of pages){
                const pageIndexes=[];
                for(let i=range.start;i<range.end;i++) if(lines[i]?.pageNumber===pageNumber) pageIndexes.push(i);
                if(!pageIndexes.length) continue;

                // Localiza a geometria da tabela a partir dos próprios cabeçalhos de coluna.
                let cargoHeader=-1, reqHeader=-1;
                for(const idx of pageIndexes){
                    const f=foldEditalText(lines[idx]?.text||'');
                    if(cargoHeader<0 && /^cargo\b/.test(f)) cargoHeader=idx;
                    if(reqHeader<0 && /^(?:escolaridade|requisitos?)\b/.test(f)) reqHeader=idx;
                }
                if(cargoHeader<0) continue;

                const cargoX=Number(lines[cargoHeader]?.x)||0;
                let reqX=reqHeader>=0 ? Number(lines[reqHeader]?.x)||0 : 0;
                if(!(reqX>cargoX+18)){
                    // Cabeçalhos quebrados podem esconder ESCOLARIDADE. Procura a primeira coluna
                    // textual consistente à direita do CARGO.
                    const xs=pageIndexes
                        .map(i=>Number(lines[i]?.x)||0)
                        .filter(x=>x>cargoX+45)
                        .sort((a,b)=>a-b);
                    reqX=xs.length?xs[0]:0;
                }
                if(!(reqX>cargoX+18)) continue;

                const cargoRight=cargoX + (reqX-cargoX)*0.50;
                const headerY=Number(lines[cargoHeader]?.y)||0;
                const pageItems=pageIndexes.map(i=>({i,item:lines[i]}));

                // Âncoras de linha: preferimos a primeira informação da coluna de requisitos;
                // se o edital não tiver escolaridade, remuneração serve como segunda opção.
                let anchors=pageItems.filter(({i,item})=>{
                    if(i===reqHeader) return false;
                    const x=Number(item?.x)||0;
                    if(x<cargoRight) return false;
                    return isRequirementAnchor(item);
                });
                if(anchors.length<2){
                    anchors=pageItems.filter(({item})=>{
                        const x=Number(item?.x)||0;
                        return x>cargoRight && isMoneyAnchor(item);
                    });
                }
                if(!anchors.length) continue;

                // Remove âncoras duplicadas muito próximas na mesma linha/célula.
                anchors.sort((a,b)=>(Number(b.item.y)||0)-(Number(a.item.y)||0));
                const dedup=[];
                for(const a of anchors){
                    if(dedup.some(d=>Math.abs((Number(d.item.y)||0)-(Number(a.item.y)||0))<7)) continue;
                    dedup.push(a);
                }
                anchors=dedup;
                if(!anchors.length) continue;

                const cargoCandidates=pageItems.filter(({i,item})=>{
                    if(i===cargoHeader) return false;
                    const x=Number(item?.x)||0;
                    const raw=String(item?.text||'').replace(/\s+/g,' ').trim();
                    const f=foldEditalText(raw);
                    if(!raw || x>cargoRight) return false;
                    if(/^(?:cargo|total de vagas|ac\s*=|nota explicativa|concurso publico|edital|realizacao|pagina)\b/.test(f)) return false;
                    if(isAdministrativeRoleFragment(raw) || isMetaRoleLabel(raw)) return false;
                    return true;
                });

                // Cada âncora representa uma linha da tabela. Usamos os pontos médios entre
                // âncoras para criar bandas Y e recolher APENAS texto da coluna CARGO.
                for(let ai=0;ai<anchors.length;ai++){
                    const ay=Number(anchors[ai].item.y)||0;
                    const prevY=ai===0 ? headerY : Number(anchors[ai-1].item.y)||0;
                    let nextY;
                    if(ai+1<anchors.length) nextY=Number(anchors[ai+1].item.y)||0;
                    else {
                        const ys=cargoCandidates.map(c=>Number(c.item.y)||0).filter(y=>y<ay);
                        nextY=ys.length ? Math.min(...ys)-24 : ay-70;
                    }
                    const upper=(prevY+ay)/2;
                    const lower=(ay+nextY)/2;
                    const hi=Math.max(upper,lower), lo=Math.min(upper,lower);
                    const row=cargoCandidates
                        .filter(c=>{ const y=Number(c.item.y)||0; return y<=hi+4 && y>=lo-4; })
                        .sort((a,b)=>(Number(b.item.y)||0)-(Number(a.item.y)||0) || (Number(a.item.x)||0)-(Number(b.item.x)||0));
                    const label=cleanCellText(row.map(c=>c.item.text));
                    if(!label || !isLikelyRoleNameFragment(label)) continue;
                    roles.push({label:titleCaseLoose(label),index:row[0]?.i??anchors[ai].i,confidence:.995,pageNumber,sourceType:'role-table-geometry'});
                }
            }
            return roles;
        }

        function detectRoleCatalogBeforeProgram(lines, programStart) {
            const found=new Map();
            const addRole=(label, idx, confidence=.9, educationLevel='', sourceType='role-table')=>{
                let clean=String(label||'').replace(/\s+/g,' ').trim().replace(/[:;,.-]+$/,'').trim();
                if(!isLikelyRoleNameFragment(clean)) return;
                clean=titleCaseLoose(clean);
                const key=foldEditalText(clean.replace(/\([^)]*\)/g,'')).replace(/[^a-z0-9]+/g,' ').trim();
                if(!key || key.length<3) return;
                const current=found.get(key);
                const obj={code:`BL${hashEditalText(clean)%10000}`,label:clean,rawLabel:clean,confidence,segments:[],educationLevel:educationLevel||inferEducationLevelForRole(lines,clean,programStart),synthetic:false,catalogOnly:true,sourceType};
                if(!current || confidence>current.confidence) found.set(key,obj);
            };

            const ranges=findRoleTableRanges(lines,programStart);

            // 1) Fonte primária: geometria real das tabelas. Isso impede que texto das colunas
            // ESCOLARIDADE/JORNADA/REMUNERAÇÃO seja confundido com nomes de cargo.
            let geometryHits=0;
            for(const range of ranges){
                const geometric=detectRoleTableGeometry(lines,range);
                for(const r of geometric){ addRole(r.label,r.index,r.confidence,'',r.sourceType); geometryHits++; }
            }

            // 2) Fallback textual conservador SOMENTE quando não houve geometria utilizável.
            // Aceita formatos lineares como "101 - ADMINISTRADOR", mas não tenta reconstruir
            // células de tabela a partir de fragmentos vizinhos.
            if(geometryHits===0){
                for(const range of ranges){
                    for(let i=range.start+1;i<range.end;i++){
                        const raw=String(lines[i]?.text||'').replace(/\s+/g,' ').trim();
                        const f=foldEditalText(raw);
                        if(!raw || isAdministrativeRoleFragment(raw)) continue;
                        let m=raw.match(/^([A-Z]{0,3}\d{1,4}|\d{1,4})\s*[-–—]\s*(.{3,75})$/i);
                        if(m && isLikelyRoleNameFragment(m[2])){
                            const code=/^[A-Z]/i.test(m[1])?m[1].toUpperCase():`C${m[1]}`;
                            const label=titleCaseLoose(m[2]);
                            const key=foldEditalText(label).replace(/[^a-z0-9]+/g,' ').trim();
                            found.set(key,{code,label,rawLabel:label,confidence:.97,segments:[],educationLevel:inferEducationLevelForRole(lines,label,programStart),synthetic:false,catalogOnly:true,sourceType:'role-table-code'});
                            continue;
                        }
                        // Só aceita linha autônoma quando há evidência visual forte e um sinal lexical de cargo.
                        if(roleSignal(raw) && looksLikeRoleHeading(lines[i],false) && isLikelyRoleNameFragment(raw)) addRole(raw,i,.78,'','role-table-heading');
                    }
                }
            }

            // 3) Evidência independente: headings do anexo de atribuições podem validar e
            // complementar catálogos quando o quadro inicial é difícil de extrair.
            if(found.size<2){
                let inDuties=false;
                for(let i=0;i<programStart;i++){
                    const raw=String(lines[i]?.text||'').replace(/\s+/g,' ').trim();
                    const f=foldEditalText(raw);
                    if(/^anexo\s+[a-zivxlcdm\d]+.*atribui[cç][oõ]es.*cargos?/.test(f)){ inDuties=true; continue; }
                    if(inDuties && /^anexo\s+[a-zivxlcdm\d]+/.test(f)) break;
                    if(!inDuties || !raw || raw.length>80) continue;
                    const strong=(lines[i]?.boldRatio||0)>=.45 || (lines[i]?.uppercaseRatio||0)>=.65;
                    if(strong && isLikelyRoleNameFragment(raw)) addRole(raw,i,.84,'','duties-heading');
                }
            }
            return [...found.values()];
        }

        function buildScopeModel(lines, programStart, programEnd) {
            const events=[];
            let inPerCargoSpecific=false;

            const hasExplicitRoleMarkers = lines.slice(programStart+1, programEnd).some((item)=>{
                const raw=String(item?.text||'').replace(/\s+/g,' ').trim();
                if (!raw) return false;
                if (parseInlineCargoBlockHeading(item)) return true;
                return /^(?:CARGO|FUNÇÃO|FUNCAO)\s*(?:\d+)?\s*[:\-–—]/i.test(raw) ||
                       /^CARGOS?\s+[0-9]{1,3}(?:\s*(?:,|E|\/|A)\s*[0-9]{1,3})*\s*:/i.test(raw);
            });

            for (let i=programStart+1;i<programEnd;i++) {
                const item=lines[i], raw=String(item.text||'').trim(), f=foldEditalText(raw);
                if (!raw) continue;
                const inline=parseInlineCargoBlockHeading(item);
                if (inline){ events.push({type:'cargo-block',index:i,...inline}); continue; }
                const block=classifyBlockHeading(raw);
                if (block) {
                    if (/para cada cargos?|para cada cargo/.test(f)) inPerCargoSpecific=true;
                    events.push({type:'block',index:i,...block});
                    continue;
                }
                if (/^cargo\s*[:\-–—]\s*/i.test(raw)) {
                    const label=raw.replace(/^cargo\s*[:\-–—]\s*/i,'').trim();
                    events.push({type:'role',index:i,code:`BL${hashEditalText(label)%10000}`,label,confidence:.98});
                    inPerCargoSpecific=true;
                    continue;
                }
                // CARGO 1: ... / FUNÇÃO 1: ...
                let m=raw.match(/^(?:CARGO|FUNÇÃO|FUNCAO)\s*(\d+)?\s*[:\-–—]\s*(.+)$/i);
                if (m) {
                    events.push({type:'role',index:i,code:m[1]?`C${m[1]}`:`BL${hashEditalText(m[2])%10000}`,publishedCode:m[1]||'',label:m[2].trim(),confidence:.98});
                    inPerCargoSpecific=true;
                    continue;
                }
                // Headings autônomos só são necessários quando o edital NÃO traz marcadores explícitos
                // CARGO/CARGOS/CÓDIGO no próprio programa.
                if (!hasExplicitRoleMarkers && looksLikeRoleHeading(item, inPerCargoSpecific)) {
                    events.push({type:'role',index:i,code:`BL${hashEditalText(raw)%10000}`,label:raw.replace(/:$/,'').trim(),confidence:inPerCargoSpecific?.92:.82});
                }
            }

            events.sort((a,b)=>a.index-b.index);
            const shared=[];
            const firstSpecificEvent=events.find(e=>e.type==='role'||e.type==='cargo-block');
            if(firstSpecificEvent && firstSpecificEvent.index>programStart+1){
                shared.push({start:programStart+1,end:firstSpecificEvent.index,kind:'common',level:'',event:{type:'implicit-common',index:programStart}});
            }
            const scopeMap=new Map();
            const ensure=(code,label,confidence=.8,publishedCode='')=>{
                const key=code||`BL${hashEditalText(label)%10000}`;
                if(!scopeMap.has(key)) scopeMap.set(key,{code:key,publishedCode:String(publishedCode||'').trim(),label:canonicalCargoLabel(code&&/^([A-Z]{1,4}\d+)/.test(code)?code:'',label),rawLabel:label,confidence,segments:[],educationLevel:'',synthetic:false});
                else if (publishedCode && !scopeMap.get(key).publishedCode) scopeMap.get(key).publishedCode=String(publishedCode).trim();
                return scopeMap.get(key);
            };

            for (let ei=0;ei<events.length;ei++) {
                const ev=events[ei], end=ei+1<events.length?events[ei+1].index:programEnd;
                const range={start:ev.index+1,end,kind:ev.kind||'specific',level:ev.level||'',familyKey:ev.familyKey||'',familyCommon:!!ev.familyCommon,event:ev};
                if (ev.type==='cargo-block') {
                    const sc=ensure(ev.code,ev.label,ev.confidence,ev.publishedCode||''); sc.segments.push(range); if(!sc.educationLevel) sc.educationLevel=inferEducationLevelForRole(lines,ev.label,programStart);
                } else if (ev.type==='role') {
                    const sc=ensure(ev.code,ev.label,ev.confidence,ev.publishedCode||''); sc.segments.push({...range,kind:'specific'}); if(!sc.educationLevel) sc.educationLevel=inferEducationLevelForRole(lines,ev.label,programStart);
                } else if (ev.type==='block') {
                    // bloco comum geral/por nível é compartilhado; bloco específico sem cargo fica compartilhado até surgir cargo.
                    shared.push(range);
                }
            }

            // Se não há cargo dentro do programa, usa catálogo do quadro de cargos quando disponível.
            if (!scopeMap.size) {
                const catalog=detectRoleCatalogBeforeProgram(lines,programStart);
                if(catalog.length>1){
                    for(const sc of catalog){
                        sc.segments=[{start:programStart+1,end:programEnd,kind:'specific',level:''}];
                        scopeMap.set(sc.code,sc);
                    }
                } else {
                    const preambleFold=foldEditalText(lines.slice(0,programStart).map(x=>x.text).join(' '));
                    const clearlyPlural=/\b(?:cargos constantes|dos cargos|quadro de cargos|cargos,? escolaridade|cargos previstos|cada cargo|todos os cargos)\b/.test(preambleFold);
                    const single=clearlyPlural ? null : (inferSingleRoleFromPreamble(lines,programStart) || catalog[0]);
                    if (single && Number(single.confidence||0)>=.88) {
                        single.segments=[{start:programStart+1,end:programEnd,kind:'specific',level:''}];
                        scopeMap.set(single.code,single);
                    } else {
                        scopeMap.set('__FULL__',{code:'__FULL__',label:clearlyPlural?'Todos os cargos — conteúdo comum':'Conteúdo programático (bloco único)',rawLabel:clearlyPlural?'Todos os cargos':'Conteúdo programático',confidence:clearlyPlural?.86:.94,segments:[{start:programStart+1,end:programEnd,kind:'specific',level:''}],educationLevel:'',synthetic:true,multiRoleUnresolved:clearlyPlural});
                    }
                }
            }

            // Remove falsos cargos que são headings evidentemente de disciplinas.
            for (const [k,sc] of [...scopeMap]) {
                if (findKnownDisciplineAtStart(sc.rawLabel) || GENERIC_SCOPE_WORDS.has(foldEditalText(sc.rawLabel))) scopeMap.delete(k);
            }
            if (!scopeMap.size) scopeMap.set('__FULL__',{code:'__FULL__',label:'Conteúdo programático (bloco único)',rawLabel:'Conteúdo programático',confidence:.9,segments:[{start:programStart+1,end:programEnd,kind:'specific',level:''}],educationLevel:'',synthetic:true});
            return {scopes:[...scopeMap.values()],shared,events};
        }

        function isGenericProgramBoundary(line) {
            const f=foldEditalText(stripSectionNumber(line));
            return /^(conhecimentos|conteudos)\s+(gerais|basicos|comuns|especificos)\b/.test(f) ||
                /^prova de conhecimentos?\s+(gerais|especificos)/.test(f) ||
                /^anexo\s+[ivxlcdm\d]+\b/.test(f) || /^cronograma\b/.test(f) || /^cargo\s*[:\-]/.test(f);
        }

        function editalHeadingScore(head, meta={}, hasColon=false) {
            const raw=String(head||'').trim(), f=foldEditalText(raw);
            if(!raw||raw.length<3||raw.length>145) return 0;
            if(GENERIC_SCOPE_WORDS.has(f)) return 0;
            if(/^(observacao|anexo|conteudo|conhecimentos|cargo|area|especialidade|edital|capitulo|secao|prova|cronograma)$/i.test(f)) return 0;
            if(roleSignal(raw) && looksLikeRoleHeading({...meta,text:raw})) return 0;
            let score=0;
            const letters=raw.replace(/[^A-Za-zÀ-ÿ]/g,''), uppers=raw.replace(/[^A-ZÁÉÍÓÚÂÊÔÃÕÇ]/g,'');
            const upperRatio=letters.length?uppers.length/letters.length:(meta.uppercaseRatio||0);
            if(hasColon) score+=3;
            if(upperRatio>.78&&letters.length>=4) score+=4; else if(upperRatio>.52) score+=2;
            if((meta.boldRatio||0)>.35) score+=2;
            if((meta.fontSize||10)>=11.5) score+=1;
            if(/^(no[cç][oõ]es|direito|lingua|língua|raciocinio|raciocínio|matematica|matemática|contabilidade|administracao|administração|informatica|informática|tecnologia|engenharia|psicologia|servico social|estatistica|economia|auditoria|arquivologia|legislacao|medicina|ciencias|ciências|atualidades|etica|ética|promo[cç][aã]o)/i.test(raw)) score+=2;
            if(raw.split(/\s+/).length<=12) score+=1;
            return score;
        }

        function detectGenericDisciplineHeader(item) {
            const line=String(item?.text??item??'').replace(/\s+/g,' ').trim();
            if(!line) return null;
            const numbered=line.match(/^\s*(\d+(?:\.\d+)*)[.)]?\s+/);
            const sectionDepth=numbered ? numbered[1].split('.').length : 0;
            const stripped=stripSectionNumber(line);
            const known=findKnownDisciplineAtStart(stripped);
            if(known) return {name:known.name,remainder:known.remainder,confidence:.99,method:'lexical-hint',sectionDepth,hasSectionNumber:sectionDepth>0};
            if(isGenericProgramBoundary(line)) return null;
            const colon=stripped.indexOf(':');
            if(colon>=3&&colon<=145){
                const head=stripped.slice(0,colon).trim(); const score=editalHeadingScore(head,item,true);
                if(score>=5) return {name:titleCaseLoose(head),remainder:stripped.slice(colon+1).trim(),confidence:Math.min(.98,.58+score*.05),method:'colon-heading',sectionDepth,hasSectionNumber:sectionDepth>0};
            }
            const fullScore=editalHeadingScore(stripped,item,false);
            if(stripped.length<=120&&fullScore>=7&&!/[.;!?]$/.test(stripped)) return {name:titleCaseLoose(stripped),remainder:'',confidence:Math.min(.95,.55+fullScore*.05),method:'visual-heading',sectionDepth,hasSectionNumber:sectionDepth>0};
            // Numerado + título em caixa alta, muito comum Vunesp/FGV: 1. HISTÓRIA GERAL
            if(/^\d+(?:\.\d+)*[.)]?\s+/.test(line)) {
                const t=stripSectionNumber(line); const score=editalHeadingScore(t,item,false);
                if(score>=6 && t.length<100 && !/[.;!?]$/.test(t)) return {name:titleCaseLoose(t),remainder:'',confidence:.9,method:'numbered-heading',sectionDepth,hasSectionNumber:true};
            }
            return null;
        }

        function splitProgramTopics(body) {
            let text=String(body||'').replace(/\u00ad/g,'').replace(/\s+/g,' ').trim();
            if(!text) return [];
            // hierarquia 1 / 1.1 / 1.1.1 — preserva o texto de cada nó como assunto.
            text=text.replace(/(^|\s)(\d+(?:\.\d+)*)(?:\.|\))?\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/g,'$1§TOPIC§ ');
            // bullets e alíneas
            text=text.replace(/\s+[•▪●]\s+/g,'§TOPIC§ ').replace(/\s+([a-z])\)\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g,'§TOPIC§ ');
            // ponto final é fallback, sem quebrar abreviações simples/números.
            text=text.replace(/([!?]|\.(?!\d))\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g,'$1§TOPIC§ ');
            const raw=text.split('§TOPIC§').map(v=>v.trim().replace(/^[;:,\-–—\s]+/,'').replace(/[.\s]+$/,'').trim()).filter(v=>v.length>=3);
            const topics=[],seen=new Set();
            for(let topic of raw){
                if(topic.length>900&&topic.includes(';')){
                    const pieces=topic.split(/\s*;\s*/).map(v=>v.trim()).filter(v=>v.length>=3);
                    if(pieces.length>1){ for(const piece of pieces){const k=foldEditalText(piece);if(!seen.has(k)){seen.add(k);topics.push(piece)}} continue; }
                }
                const k=foldEditalText(topic); if(!seen.has(k)){seen.add(k);topics.push(topic)}
            }
            return topics;
        }

        function isBareStructuralSectionNumber(text) {
            // Numeração de capítulo/subcapítulo extraída sozinha pelo PDF.js, por exemplo
            // "20.2.2" ou "20.2.4.1.3". Isso é metadado estrutural, nunca assunto.
            return /^\s*\d+(?:\.\d+){1,7}\.?\s*$/.test(String(text||''));
        }

        function stripAudiencePrefixFromProgramLine(text) {
            const raw=String(text||'').replace(/\s+/g,' ').trim();
            // Quadrix/Selecon/Fundatec e similares podem quebrar o heading e jogar
            // "(PARA TODOS OS CARGOS):" na linha seguinte. O escopo não é assunto.
            return raw.replace(/^\(\s*(?:PARA\s+)?TODOS\s+OS\s+CARGOS(?:\/OCUPA[CÇ][OÕ]ES)?\s*\)\s*:\s*/i,'').trim();
        }

        function normalizeDisciplineIdentity(text) {
            return foldEditalText(stripSectionNumber(String(text||'')))
                .replace(/\([^)]*\)/g,' ')
                .replace(/\b(?:disciplina|materia|prova de|questoes?|peso)\b/g,' ')
                .replace(/[^a-z0-9]+/g,' ')
                .replace(/\s+/g,' ').trim();
        }

        function disciplineIdentityMatches(a,b) {
            const A=normalizeDisciplineIdentity(a), B=normalizeDisciplineIdentity(b);
            if(!A||!B) return false;
            if(A===B) return true;
            if(A.length>=6 && B.length>=6 && (A.includes(B)||B.includes(A))) return true;
            const stop=new Set(['de','da','do','das','dos','e','em','para','no','na','nos','nas','com','nocao','nocoes']);
            const ta=new Set(A.split(' ').filter(x=>x.length>2&&!stop.has(x)));
            const tb=new Set(B.split(' ').filter(x=>x.length>2&&!stop.has(x)));
            if(!ta.size||!tb.size) return false;
            let inter=0; for(const x of ta) if(tb.has(x)) inter++;
            const min=Math.min(ta.size,tb.size), union=new Set([...ta,...tb]).size;
            return inter/min>=.67 || inter/union>=.58;
        }

        function detectExamDisciplineRegistry(lines, programStart) {
            const found=[];
            const seen=new Set();
            const add=(name,confidence=.9,source='exam-composition')=>{
                let raw=String(name||'').replace(/\s+/g,' ').replace(/[;,:.\-–—]+$/,'').trim();
                raw=stripSectionNumber(raw).trim();
                if(!raw||raw.length<3||raw.length>130||isMetaRoleLabel(raw)||roleSignal(raw)||isGenericProgramBoundary(raw)) return;
                const f=normalizeDisciplineIdentity(raw); if(!f||seen.has(f)) return;
                // Cabeçalhos administrativos/etapas não são disciplinas.
                if(/^(prova objetiva|prova discursiva|prova dissertativa|redacao|total|etapa|fase|conteudo programatico|conhecimentos)$/.test(f)) return;
                seen.add(f); found.push({name:titleCaseLoose(raw),key:f,confidence,source});
            };
            const before=lines.slice(0,Math.max(0,programStart));
            for(let i=0;i<before.length;i++){
                const raw=String(before[i]?.text||'').replace(/\s+/g,' ').trim();
                if(!raw||raw.length>240) continue;
                const ctx=foldEditalText(before.slice(Math.max(0,i-7),Math.min(before.length,i+8)).map(x=>x.text).join(' '));
                if(!/(prova objetiva|numero de questoes|número de questões|questoes de multipla escolha|disciplinas|conteudo programatico|composicao da prova)/.test(ctx)) continue;

                // Lista declarativa: "1.1.1. Língua Portuguesa ... - 20 (vinte);"
                let stripped=stripSectionNumber(raw);
                let m=stripped.match(/^(.{3,125}?)\s*[-–—]\s*\d{1,3}\s*(?:\([^)]*\))?\s*[;.]?$/i);
                if(m) { add(m[1],.99,'exam-list'); continue; }

                // Tabelas: nome da disciplina seguido de colunas numéricas (qtd/peso/pontos).
                // Alguns PDFs acrescentam na mesma linha células vizinhas como "Todos Objetiva"
                // antes da disciplina e "classificatório" depois dos números.
                m=stripped.match(/^(.{3,135}?)\s+(\d{1,3})(?:\s+[0-9]+(?:[.,][0-9]+)?){1,4}(?:\s+(?:eliminat[oó]rio|classificat[oó]rio|e))*\s*$/i);
                if(m) {
                    let tableName=m[1]
                        .replace(/^(?:todos(?:\s+os\s+cargos)?|n[ií]vel\s+(?:m[eé]dio|superior))\s+/i,'')
                        .replace(/^(?:objetiva|discursiva|reda[cç][aã]o)\s+/i,'')
                        .trim();
                    add(tableName,.97,'exam-table'); continue;
                }

                // Variante "Disciplina: 20 questões".
                m=stripped.match(/^(.{3,110}?)\s*[:–—-]\s*\d{1,3}\s+quest(?:ão|ões|oes)\b/i);
                if(m) { add(m[1],.97,'exam-count'); continue; }
            }
            // Só bloqueia a hierarquia se houver evidência de uma composição real com 2+ disciplinas.
            return found.length>=2 && found.length<=40 ? found : [];
        }

        function matchRegistryDiscipline(name, registry) {
            if(!Array.isArray(registry)||!registry.length) return null;
            let best=null,score=0;
            for(const r of registry){
                if(!disciplineIdentityMatches(name,r.name)) continue;
                const A=normalizeDisciplineIdentity(name),B=normalizeDisciplineIdentity(r.name);
                let s=A===B?1:(A.includes(B)||B.includes(A))?.92:.78;
                if(s>score){score=s;best=r;}
            }
            return best ? {...best,matchScore:score} : null;
        }

        function parseDisciplineSections(lines, fallbackMateria, weight=1, priority=2, registry=[]) {
            const sections=[]; let current=null;
            const registryLocked=Array.isArray(registry)&&registry.length>=2;
            const flush=()=>{
                if(!current)return;
                const body=current.lines.map(x=>x.text||x).join(' ').trim();
                const assuntos=splitProgramTopics(body);
                if(assuntos.length) sections.push({materia:current.name,prioridade:priority,peso:weight,assuntos,confidence:current.confidence||.55,detectionMethod:current.method||'fallback',sourcePages:[...new Set(current.lines.map(x=>x.pageNumber).filter(Boolean))]});
                current=null;
            };
            for(let i=0;i<lines.length;i++){
                const item=lines[i];
                let line=String(item?.text??item??'').trim();
                if(!line||isPdfNoiseLine(line)) continue;
                if(isBareStructuralSectionNumber(line)) continue;

                const scopeStripped=stripAudiencePrefixFromProgramLine(line);
                if(scopeStripped!==line){
                    if(!scopeStripped) continue;
                    line=scopeStripped;
                }

                let heading=detectGenericDisciplineHeader(typeof item==='object'?{...item,text:line}:line);
                let registryMatch=heading ? matchRegistryDiscipline(heading.name,registry) : null;
                if(heading && registryLocked && registryMatch){
                    heading={...heading,name:registryMatch.name,confidence:Math.max(heading.confidence||.7,registryMatch.confidence||.9),method:`registry-${registryMatch.source}`};
                }

                if(heading && current && heading.hasSectionNumber && Number(heading.sectionDepth||0) > Number(current.sectionDepth||0) && !registryMatch){
                    heading=null;
                }

                if(heading){
                    flush();
                    current={name:heading.name,lines:[],confidence:heading.confidence,method:heading.method,sectionDepth:Number(heading.sectionDepth||0)};
                    if(heading.remainder) current.lines.push({text:heading.remainder,pageNumber:item?.pageNumber});
                    continue;
                }

                if(isGenericProgramBoundary(line)) continue;
                if(looksLikeRoleHeading({...item,text:line}) && !findKnownDisciplineAtStart(line)) continue;
                if(!current) current={name:fallbackMateria,lines:[],confidence:.48,method:'fallback-block',sectionDepth:0};
                current.lines.push(typeof item==='object'?{...item,text:line}:{text:line});
            }
            flush();
            return sections;
        }

        function auditVerticalizedExtraction(materias, selectedLines, registry=[]) {
            const warnings=[];
            const names=(materias||[]).map(m=>normalizeDisciplineIdentity(m.materia));
            const explicit=[];
            for(const item of (selectedLines||[])){
                const line=String(item?.text??item??'').trim();
                if(!line||isPdfNoiseLine(line)) continue;
                const h=detectGenericDisciplineHeader(typeof item==='object'?item:line);
                if(!h) continue;
                const key=normalizeDisciplineIdentity(h.name);
                if(key && !explicit.some(x=>x.key===key)) explicit.push({key,name:h.name});
            }
            for(const h of explicit){
                if(!names.some(n=>disciplineIdentityMatches(n,h.key))) warnings.push(`Disciplina explícita não verticalizada: ${h.name}`);
            }
            if(Array.isArray(registry)&&registry.length>=2){
                for(const r of registry){
                    if(!names.some(n=>disciplineIdentityMatches(n,r.name))) warnings.push(`Disciplina do quadro da prova não localizada no programa: ${r.name}`);
                }
            }
            return [...new Set(warnings)].slice(0,12);
        }

        function mergeMaterias(materias) {
            const map=new Map();
            for(const mat of materias){
                const name=String(mat.materia||'').trim(); if(!name)continue; const key=foldEditalText(name);
                if(!map.has(key)) map.set(key,{materia:name,prioridade:mat.prioridade||2,peso:Number(mat.peso)||1,assuntos:[],confidence:Number(mat.confidence)||.5,detectionMethod:mat.detectionMethod||'',sourcePages:[]});
                const t=map.get(key); t.prioridade=Math.min(t.prioridade,mat.prioridade||2); t.peso=Math.max(t.peso,Number(mat.peso)||1); t.confidence=Math.max(t.confidence,Number(mat.confidence)||.5); t.sourcePages=[...new Set([...(t.sourcePages||[]),...((mat.sourcePages||[]).filter(Boolean))])].sort((a,b)=>a-b);
                const seen=new Set(t.assuntos.map(foldEditalText)); for(const ass of(mat.assuntos||[])){const a=String(ass||'').trim(),k=foldEditalText(a);if(a&&!seen.has(k)){seen.add(k);t.assuntos.push(a)}}
            }
            return [...map.values()].filter(m=>m.assuntos.length);
        }

        function detectExamWeights(lines,cargoCode,programStart) {
            const before=lines.slice(0,Math.max(0,programStart)); let idx=-1;
            if(cargoCode && cargoCode!=='__FULL__') for(let i=0;i<before.length;i++) if(foldEditalText(before[i].text).includes(foldEditalText(cargoCode))) idx=i;
            const pool=idx>=0?before.slice(Math.max(0,idx-8),Math.min(before.length,idx+34)):before.slice(Math.max(0,before.length-450));
            const f=foldEditalText(pool.map(x=>x.text).join(' '));
            let m=f.match(/conhecimentos (?:gerais|basicos)\s+conhecimentos especificos\s+(\d+)\s+(\d+)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)/);
            if(m) return {generalQuestions:Number(m[1]),specificQuestions:Number(m[2]),generalWeight:Number(m[3].replace(',','.'))||1,specificWeight:Number(m[4].replace(',','.'))||1};
            // Consulpam e outros: valor da questão comum; mantém peso relativo neutro quando não há peso explícito.
            return {generalWeight:1,specificWeight:1,generalQuestions:null,specificQuestions:null};
        }

        async function loadAiPdfStructure(blob,fileKey='') {
            const cacheKey=`${fileKey}|${blob?.size||0}|${blob?.lastModified||0}`;
            if(aiEditalPdfCache?.key===cacheKey) return aiEditalPdfCache;
            const pdfjs=await loadPdfJsForAI(); const bytes=new Uint8Array(await blob.arrayBuffer()); const pdf=await pdfjs.getDocument({data:bytes}).promise; const pages=[];
            for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
                setAiEditalStatus(`Lendo PDF e construindo o mapa estrutural: página ${pageNumber} de ${pdf.numPages}...`);
                const page=await pdf.getPage(pageNumber),content=await page.getTextContent(),layout=extractPdfPageTextWithLayout(content.items);
                pages.push({pageNumber,text:layout.text,lines:layout.lines.map(l=>({...l,pageNumber}))});
            }
            const chars=pages.reduce((sum,p)=>sum+p.text.length,0); if(chars<800) throw new Error('O PDF parece ser digitalizado como imagem ou não possui texto pesquisável.');
            const lines=flattenPdfLines(pages),programStart=findProgramStartIndex(lines); if(programStart<0) throw new Error('Não foi localizada uma seção de conteúdo programático/objetos de avaliação no PDF.');
            const programEnd=findProgramEndIndex(lines,programStart),model=buildScopeModel(lines,programStart,programEnd);
            aiEditalPdfCache={key:cacheKey,pages,lines,programStart,programEnd,totalPages:pdf.numPages,cargos:model.scopes,sharedSegments:model.shared,events:model.events};
            return aiEditalPdfCache;
        }

        function segmentLines(structure,seg){
            const rows=structure.lines.slice(Math.max(structure.programStart+1,seg.start),Math.min(structure.programEnd,seg.end));
            const rem=String(seg?.event?.inlineRemainder||'').trim();
            if(rem) rows.unshift({text:rem,pageNumber:structure.lines[seg.event.index]?.pageNumber||0,fontSize:10,uppercaseRatio:0,boldRatio:0,x:0,y:0,synthetic:true});
            return rows;
        }

        function sharedSegmentsForScope(structure,scope) {
            const common=(structure.sharedSegments||[]).filter(seg=>{
                if(seg.kind!=='common' && !seg.familyCommon) return false;
                if(seg.level && scope.educationLevel && seg.level!==scope.educationLevel) return false;
                if(seg.familyKey){
                    const target=foldEditalText(`${scope.rawLabel||''} ${scope.label||''}`);
                    if(!target.includes(foldEditalText(seg.familyKey))) return false;
                }
                return true;
            });
            return common;
        }

        function buildSelectedCargoExtraction(structure,cargoCode) {
            const cargo=structure.cargos.find(c=>c.code===cargoCode); if(!cargo) throw new Error('Selecione um bloco/cargo válido antes de analisar.');
            const weights=detectExamWeights(structure.lines,cargo.code,structure.programStart);
            const commonSegs=sharedSegmentsForScope(structure,cargo);
            const ownCommon=(cargo.segments||[]).filter(s=>s.kind==='common');
            const ownSpecific=(cargo.segments||[]).filter(s=>s.kind!=='common');
            let generalLines=[...commonSegs,...ownCommon].flatMap(seg=>segmentLines(structure,seg));
            let specificLines=ownSpecific.flatMap(seg=>segmentLines(structure,seg));
            generalLines=filterLinesByCargoAudience(generalLines,cargo);
            specificLines=filterLinesByCargoAudience(specificLines,cargo);

            // Bloco único: não duplica conteúdo como geral/específico.
            if(cargo.synthetic){ generalLines=[]; specificLines=(cargo.segments||[]).flatMap(seg=>segmentLines(structure,seg)); }
            // Se um cargo foi detectado mas seu bloco específico ficou vazio, usa somente o intervalo do próprio cargo.
            if(!specificLines.length && !cargo.synthetic) specificLines=(cargo.segments||[]).flatMap(seg=>segmentLines(structure,seg));

            const disciplineRegistry=detectExamDisciplineRegistry(structure.lines,structure.programStart);
            let generalMaterias=parseDisciplineSections(generalLines,'Conhecimentos Gerais',weights.generalWeight||1,2,disciplineRegistry);
            const fallbackSpecific=cargo.synthetic?'Conhecimentos do Edital':`Conhecimentos Específicos — ${titleCaseLoose(cargo.rawLabel||cargo.label)}`;
            // Em editais multicargo, o quadro da prova costuma listar apenas o bucket
            // "Conhecimentos Específicos", e não os títulos internos de cada cargo.
            // Portanto, o registro canônico bloqueia o conteúdo comum, mas o bloco específico
            // do cargo continua sendo verticalizado por sua própria estrutura. Em edital de
            // bloco único (ex.: Vunesp), o registro continua valendo para todo o programa.
            const specificRegistry=cargo.synthetic ? disciplineRegistry : [];
            let specificMaterias=parseDisciplineSections(specificLines,fallbackSpecific,weights.specificWeight||1,(weights.specificWeight>weights.generalWeight)?1:2,specificRegistry);
            // Se o quadro da prova foi encontrado mas não casou com este recorte (edital excepcional),
            // recua com segurança para a análise estrutural original em vez de retornar vazio.
            if(disciplineRegistry.length>=2 && !generalMaterias.length && !specificMaterias.length){
                generalMaterias=parseDisciplineSections(generalLines,'Conhecimentos Gerais',weights.generalWeight||1,2,[]);
                specificMaterias=parseDisciplineSections(specificLines,fallbackSpecific,weights.specificWeight||1,(weights.specificWeight>weights.generalWeight)?1:2,[]);
            }
            let materias=mergeMaterias([...generalMaterias,...specificMaterias]);

            // Remove artefatos de escopo que eventualmente tenham sido interpretados como disciplina.
            materias=materias.filter(m=>{
                const f=foldEditalText(m.materia);
                return !GENERIC_SCOPE_WORDS.has(f) && !/^prova de conhecimentos/.test(f) && !roleSignal(m.materia);
            });
            if(!materias.length) throw new Error('Nenhuma matéria com assuntos foi identificada no bloco selecionado.');

            const selectedPages=[...new Set([...generalLines,...specificLines].map(x=>x.pageNumber).filter(Boolean))].sort((a,b)=>a-b);
            const text=[`BLOCO/CARGO SELECIONADO: ${cargo.label}`,cargo.educationLevel?`NÍVEL INFERIDO: ${cargo.educationLevel}`:'',`PESO GERAL: ${weights.generalWeight||1}`,`PESO ESPECÍFICO: ${weights.specificWeight||1}`,'','===== CONTEÚDO COMUM/GERAL =====',generalLines.map(x=>x.text).join('\n'),'','===== CONTEÚDO ESPECÍFICO =====',specificLines.map(x=>x.text).join('\n')].filter(Boolean).join('\n').slice(0,98000);
            return {cargo,materias,text,totalPages:structure.totalPages,selectedPages,selectedChars:text.length,selectionMode:'adaptive-universal-parser-v9.14.1',disciplineRegistry,auditWarnings,confidence:materias.reduce((s,m)=>s+(Number(m.confidence)||.5),0)/materias.length,weights};
        }

        async function prepareAiCargoSelector(fileObj) {
            const select=document.getElementById('selectAiCargo'),hint=document.getElementById('aiCargoHint'),analyzeBtn=document.getElementById('btnExecutarAnaliseIA');
            if(!select||!fileObj?.blob)return; select.disabled=true; analyzeBtn.disabled=true; select.innerHTML='<option value="">Detectando cargos/áreas...</option>';
            try{
                const structure=await loadAiPdfStructure(fileObj.blob,fileObj.name||'');
                select.innerHTML='<option value="">Selecione o cargo/área/especialidade...</option>'+structure.cargos.map(c=>`<option value="${escapeHtml(c.code)}">${escapeHtml(cargoSelectLabel(c))}</option>`).join('');
                select.disabled=false; if(structure.cargos.length===1)select.value=structure.cargos[0].code; analyzeBtn.disabled=false;
                if(hint)hint.textContent=structure.cargos[0]?.synthetic?'Edital com cargo/bloco único: matérias e assuntos serão identificados automaticamente a partir do conteúdo programático.':`${structure.cargos.length} cargo(s)/área(s)/especialidade(s) localizado(s). O V9.13 combinará internamente conteúdo comum, nível/escolaridade e bloco específico quando existirem.`;
                setAiEditalStatus('');
            }catch(error){console.error('Falha ao detectar estrutura:',error);select.innerHTML='<option value="">Não foi possível detectar blocos</option>';if(hint)hint.textContent=error.message||'Falha na leitura.';setAiEditalStatus(error.message||'Não foi possível detectar a estrutura.',true);}
        }

        async function openModalAnaliseEditalIA() {
            currentAiEditalAnalysis=null; const preview=document.getElementById('aiEditalPreview'),importBtn=document.getElementById('btnImportarAnaliseIA'),analyzeBtn=document.getElementById('btnExecutarAnaliseIA'),select=document.getElementById('selectAiCargo');
            if(preview){preview.innerHTML='';preview.classList.remove('visible')} if(importBtn)importBtn.disabled=true; if(analyzeBtn)analyzeBtn.disabled=true; if(select){select.disabled=true;select.innerHTML='<option value="">Detectando a estrutura do edital...</option>'} setAiEditalStatus(''); const aiModal=document.getElementById('modalAnaliseEditalIA'); aiModal.querySelector('.modal')?.classList.remove('ai-result-ready'); aiModal.style.display='flex';
            const info=document.getElementById('aiEditalFileInfo');
            try{
                const fileObj=await getEditalFileRecord(); if(!fileObj){info.innerHTML='Nenhum edital está anexado ao concurso atual. Use <strong>Ver / Anexar Edital PDF</strong> antes de iniciar a análise.';return}
                const sizeMB=fileObj.blob?.size?(fileObj.blob.size/(1024*1024)).toFixed(2):'—'; info.innerHTML=`Arquivo: <strong>${escapeHtml(fileObj.name||'Edital')}</strong> · ${escapeHtml(sizeMB)} MB · concurso atual: <strong>${escapeHtml(currentConcurso)}</strong>`;
                if(!(fileObj.type||'').includes('pdf')&&!String(fileObj.name||'').toLowerCase().endsWith('.pdf')){info.innerHTML+='<br><span style="color:#fbbf24;">A análise automática aceita PDF com texto pesquisável.</span>';return}
                await prepareAiCargoSelector(fileObj);
            }catch(error){info.textContent='Não foi possível ler o edital anexado.';setAiEditalStatus(error.message||'Não foi possível ler o edital.',true)}
        }

        function closeModalAnaliseEditalIA(){ document.getElementById('modalAnaliseEditalIA').style.display='none'; }

        function normalizeAiAnalysis(data) {
            const root = data && data.analysis ? data.analysis : data;
            if (!root || typeof root !== 'object') throw new Error('A análise retornou um formato inválido.');

            const materias = Array.isArray(root.materias) ? root.materias : [];
            const cleanMaterias = materias.map((mat, idx) => {
                const materia = String(mat.materia || mat.nome || `Matéria ${idx + 1}`).trim();
                const prioridade = Math.min(4, Math.max(1, parseInt(mat.prioridade) || 2));
                const pesoNum = Number(mat.peso);
                const peso = Number.isFinite(pesoNum) && pesoNum >= 0 ? pesoNum : 1.0;
                const assuntos = (Array.isArray(mat.assuntos) ? mat.assuntos : [])
                    .map(ass => String(typeof ass === 'string' ? ass : (ass?.assunto || ass?.nome || '')).trim())
                    .filter(Boolean);
                return { materia, prioridade, peso, assuntos };
            }).filter(m => m.materia && m.assuntos.length);

            if (!cleanMaterias.length) throw new Error('Não foram identificadas matérias e assuntos válidos para o cargo selecionado.');
            return { concurso: String(root.concurso || currentConcurso || '').trim(), materias: cleanMaterias };
        }

        function renderAiEditalPreview(analysis, extractionMeta) {
            const preview = document.getElementById('aiEditalPreview');
            const totalTopics = analysis.materias.reduce((sum, m) => sum + m.assuntos.length, 0);
            const pagesLabel = extractionMeta?.selectedPages?.length
                ? `${extractionMeta.selectedPages.length}/${extractionMeta.totalPages}`
                : '—';

            let html = `
                <div class="ai-source-note" style="margin-bottom:0.8rem; padding:0.65rem 0.75rem; border:1px solid rgba(139,92,246,.35); border-radius:9px;">
                    <strong>Cargo analisado:</strong> ${escapeHtml(cargoSelectLabel(extractionMeta?.cargo) || '—')}<br>
                    <strong>Modo:</strong> Universal Parser V9.20 · confiança estrutural: <strong>${Math.round((extractionMeta?.confidence || 0) * 100)}%</strong>. A IA não altera a relação matéria → assuntos.
                </div>
                <div class="ai-preview-header">
                    <div class="ai-preview-stat"><strong>${analysis.materias.length}</strong><span>matérias</span></div>
                    <div class="ai-preview-stat"><strong>${totalTopics}</strong><span>assuntos</span></div>
                    <div class="ai-preview-stat"><strong>${escapeHtml(pagesLabel)}</strong><span>páginas utilizadas</span></div>
                </div>`;

            analysis.materias.forEach(mat => {
                html += `<div class="ai-preview-materia">
                    <div class="ai-preview-materia-title">
                        <span>${escapeHtml(mat.materia)} <small style="opacity:.65;">(${mat.assuntos.length} assuntos · peso ${escapeHtml(String(mat.peso))}${mat.confidence ? ` · confiança ${Math.round(mat.confidence*100)}%` : ''})</small></span>
                        <span class="ai-priority-badge ai-priority-${mat.prioridade}" title="Prioridade da matéria">P${mat.prioridade}</span>
                    </div>
                    <div class="ai-preview-topics">`;

                mat.assuntos.forEach((ass, idx) => {
                    html += `<div class="ai-preview-topic"><span>${idx + 1}. ${escapeHtml(ass)}</span></div>`;
                });
                html += `</div></div>`;
            });

            preview.innerHTML = html;
            preview.classList.add('visible');
            const aiModalBox = document.querySelector('#modalAnaliseEditalIA .modal');
            aiModalBox?.classList.add('ai-result-ready');
            if (window.matchMedia('(max-width: 900px), (max-height: 720px)').matches) {
                requestAnimationFrame(() => preview.scrollIntoView({ behavior: 'smooth', block: 'start' }));
            }
        }

        async function executarAnaliseEditalIA() {
            const analyzeBtn = document.getElementById('btnExecutarAnaliseIA');
            const importBtn = document.getElementById('btnImportarAnaliseIA');
            analyzeBtn.disabled = true;
            importBtn.disabled = true;
            currentAiEditalAnalysis = null;

            try {
                if (!navigator.onLine) throw new Error('A análise por IA exige conexão com a internet.');
                const fileObj = await getEditalFileRecord();
                if (!fileObj) throw new Error('Anexe primeiro um edital PDF ao concurso atual.');

                const cargoCode = document.getElementById('selectAiCargo')?.value || '';
                if (!cargoCode) throw new Error('Selecione o bloco/cargo/área antes de analisar.');

                setAiEditalStatus('Aplicando parsers estruturais adaptativos e separando matérias/assuntos...');
                const structure = await loadAiPdfStructure(fileObj.blob, fileObj.name || '');
                const extraction = buildSelectedCargoExtraction(structure, cargoCode);

                setAiEditalStatus(`Estrutura detectada: ${extraction.materias.length} matérias e ${extraction.materias.reduce((s,m)=>s+m.assuntos.length,0)} assuntos. Consultando Workers AI apenas para priorização...`);

                const { data: { session } } = await supabaseClient.auth.getSession();
                if (!session?.access_token) throw new Error('Sua sessão expirou. Entre novamente para utilizar a IA.');

                const response = await fetch('/api/ai/analisar-edital', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({
                        concurso: currentConcurso,
                        banca: document.getElementById('inputAiBanca')?.value?.trim() || '',
                        fileName: fileObj.name || 'Edital.pdf',
                        cargo: extraction.cargo,
                        text: extraction.text,
                        lockedMaterias: extraction.materias,
                        selectedPages: extraction.selectedPages,
                        totalPages: extraction.totalPages
                    })
                });

                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload.error || `Erro ${response.status} ao consultar a IA.`);

                const analysis = normalizeAiAnalysis(payload);
                // Reanexa metadados de proveniência/confiança do parser determinístico.
                const sourceMeta = new Map(extraction.materias.map(m => [foldEditalText(m.materia), m]));
                analysis.materias = analysis.materias.map(m => ({ ...m, ...(sourceMeta.get(foldEditalText(m.materia)) ? {
                    confidence: sourceMeta.get(foldEditalText(m.materia)).confidence,
                    sourcePages: sourceMeta.get(foldEditalText(m.materia)).sourcePages,
                    detectionMethod: sourceMeta.get(foldEditalText(m.materia)).detectionMethod
                } : {}) }));
                currentAiEditalAnalysis = { analysis, extraction, model: payload.model || '' };
                renderAiEditalPreview(analysis, extraction);

                const modelInfo = payload.aiUsed === false ? 'extração determinística (IA indisponível para prioridade)' : (payload.model || 'Workers AI');
                const auditNote=(extraction.auditWarnings||[]).length ? ` Verificação estrutural: ${extraction.auditWarnings.length} alerta(s). Revise o preview antes de importar.` : '';
                setAiEditalStatus(`Análise concluída para ${cargoSelectLabel(extraction.cargo)}. Matérias e assuntos foram bloqueados pelo Universal Parser V9.20; modelo: ${modelInfo}.${auditNote}`);
                importBtn.disabled = false;
            } catch (error) {
                console.error('Erro na análise de edital com IA:', error);
                setAiEditalStatus(error.message || 'Não foi possível analisar o edital.', true);
            } finally {
                analyzeBtn.disabled = false;
            }
        }

        async function importarAnaliseEditalIA() {
            if (!currentAiEditalAnalysis?.analysis) return alert('Execute a análise antes de importar.');
            const analysis = currentAiEditalAnalysis.analysis;
            const existingKeys = new Set(
                allEditalItems
                    .filter(i => (i.concurso || 'Concurso Geral') === currentConcurso)
                    .map(i => `${String(i.materia || '').trim().toLowerCase()}|||${String(i.assunto || '').trim().toLowerCase()}`)
            );
            const novos = [];

            analysis.materias.forEach(mat => {
                mat.assuntos.forEach((ass, idxAss) => {
                    const assunto = String(ass || '').trim();
                    const key = `${mat.materia.trim().toLowerCase()}|||${assunto.toLowerCase()}`;
                    if (!assunto || existingKeys.has(key)) return;
                    existingKeys.add(key);
                    novos.push({
                        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
                        materia: mat.materia,
                        assunto: assunto,
                        prioridade: mat.prioridade,
                        assunto_prioridade: mat.prioridade,
                        peso: Number(mat.peso) || 1,
                        concurso: currentConcurso,
                        user_id: currentUser ? currentUser.id : null,
                        teoria: false,
                        questoes: false,
                        rev_24h: false,
                        rev_7d: false,
                        rev_30d: false
                    });
                    openMaterias[mat.materia] = false;
                });
            });

            if (!novos.length) return alert('Todos os tópicos identificados pela IA já existem neste concurso. Nenhum item foi duplicado.');
            const ok = confirm(`Importar ${novos.length} novos tópicos para "${currentConcurso}"?\n\nTópicos já existentes serão preservados e não serão duplicados.`);
            if (!ok) return;

            const metadata = getConcursosMetadata();
            if (!metadata[currentConcurso]) metadata[currentConcurso] = {};
            if (!metadata[currentConcurso].materiaWeights) metadata[currentConcurso].materiaWeights = {};
            analysis.materias.forEach(mat => {
                const weight = Number(mat.peso);
                if (Number.isFinite(weight) && weight > 0) metadata[currentConcurso].materiaWeights[mat.materia] = weight;
            });
            await saveConcursosMetadata(metadata);

            novos.forEach(item => {
                allEditalItems.push(item);
                queueEditalUpsert(item);
            });
            saveEditalToLocalStorage();

            if (navigator.onLine && currentUser) {
                try { await flushPendingEdital(); }
                catch (error) { console.warn('Itens da IA mantidos na fila de sincronização:', error); }
            }
            filterDataByConcurso();
            closeModalAnaliseEditalIA();
            alert(`${novos.length} tópicos importados com sucesso. As matérias permanecem recolhidas por padrão.`);
        }

        function openModalViewEdital() {
            document.getElementById('editalModalTitle').innerText = `Documento do Edital (${currentConcurso})`;
            renderEditalFileViewer();
            document.getElementById('modalViewEdital').style.display = 'flex';
            // Biblioteca pesada carregada somente quando o recurso de edital é realmente aberto.
            scheduleBackgroundTask(() => loadPdfJsOnce().catch(error => console.warn(error.message)), 1000);
        }

        function closeModalViewEdital() {
            if (activeObjectUrl) { URL.revokeObjectURL(activeObjectUrl); activeObjectUrl = null; }
            document.getElementById('modalViewEdital').style.display = 'none';
        }

        function getEditalFileStorageKey(concursoName = currentConcurso) {
            const uid = currentUser ? currentUser.id : 'guest';
            return `edital_file_${uid}_${concursoName}`;
        }

        function openEditalFilesDatabase() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('painel-estudos-files', 1);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains('editalFiles')) db.createObjectStore('editalFiles', { keyPath: 'key' });
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error('Não foi possível abrir o armazenamento de arquivos.'));
            });
        }

        async function putEditalFileRecord(record) {
            const db = await openEditalFilesDatabase();
            return new Promise((resolve, reject) => {
                const request = db.transaction('editalFiles', 'readwrite').objectStore('editalFiles').put(record);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error || new Error('Não foi possível salvar o arquivo.'));
            });
        }

        async function getEditalFileRecord(key = getEditalFileStorageKey()) {
            const db = await openEditalFilesDatabase();
            const storedRecord = await new Promise((resolve, reject) => {
                const request = db.transaction('editalFiles', 'readonly').objectStore('editalFiles').get(key);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error || new Error('Não foi possível ler o arquivo.'));
            });
            if (storedRecord) return storedRecord;

            const legacyData = localStorage.getItem(key);
            if (!legacyData) return null;
            try {
                const legacyFile = JSON.parse(legacyData);
                const migratedRecord = {
                    key,
                    name: legacyFile.name || 'Edital.pdf',
                    type: legacyFile.type || 'application/pdf',
                    blob: dataURLtoBlob(legacyFile.data),
                    updatedAt: new Date().toISOString()
                };
                await putEditalFileRecord(migratedRecord);
                localStorage.removeItem(key);
                return migratedRecord;
            } catch (error) {
                console.warn('Não foi possível migrar o anexo antigo:', error);
                return null;
            }
        }

        async function deleteEditalFileRecord(key = getEditalFileStorageKey()) {
            const db = await openEditalFilesDatabase();
            await new Promise((resolve, reject) => {
                const request = db.transaction('editalFiles', 'readwrite').objectStore('editalFiles').delete(key);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error || new Error('Não foi possível apagar o arquivo.'));
            });
            localStorage.removeItem(key);
        }

        async function moveEditalFileRecord(oldKey, newKey) {
            const record = await getEditalFileRecord(oldKey);
            if (!record) return;
            await putEditalFileRecord({ ...record, key: newKey });
            await deleteEditalFileRecord(oldKey);
        }

        function dataURLtoBlob(dataurl) {
            const arr = dataurl.split(',');
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) { u8arr[n] = bstr.charCodeAt(n); }
            return new Blob([u8arr], { type: mime });
        }

        async function renderEditalFileViewer() {
            const container = document.getElementById('editalViewerContainer');
            const btnDownload = document.getElementById('btnDownloadEdital');
            const btnRemove = document.getElementById('btnRemoveEdital');

            if (activeObjectUrl) { URL.revokeObjectURL(activeObjectUrl); activeObjectUrl = null; }

            try {
                const fileObj = await getEditalFileRecord();
                if (!fileObj) {
                    container.innerHTML = `<p style="opacity: 0.85; margin-bottom: 12px;">Nenhum documento anexado para o concurso <strong>${escapeHtml(currentConcurso)}</strong>.</p>`;
                    btnDownload.style.display = 'none';
                    btnRemove.style.display = 'none';
                    return;
                }
                btnDownload.style.display = 'inline-flex';
                btnRemove.style.display = 'inline-flex';
                activeObjectUrl = URL.createObjectURL(fileObj.blob);
                if (fileObj.type.includes('pdf')) {
                    container.innerHTML = `<embed src="${activeObjectUrl}#toolbar=1" type="application/pdf" style="width:100%; height:100%; min-height:500px; border:none; border-radius:6px;"></embed>`;
                } else if (fileObj.type.includes('image')) {
                    container.innerHTML = `<img src="${activeObjectUrl}" alt="Pré-visualização do edital" style="max-width:100%; max-height:480px; border-radius:6px; object-fit:contain;">`;
                } else {
                    container.innerHTML = `<p style="font-size:1.1rem; font-weight:700; color:var(--primary-blue);">${escapeHtml(fileObj.name)}</p>`;
                }
            } catch (e) {
                container.innerHTML = `<p style="color:#ef4444;">Erro ao carregar arquivo do edital.</p>`;
            }
        }

        async function uploadEditalFile(event) {
            const file = event.target.files[0];
            if (!file) return;
            try {
                await putEditalFileRecord({
                    key: getEditalFileStorageKey(),
                    name: file.name,
                    type: file.type || 'application/octet-stream',
                    blob: file,
                    updatedAt: new Date().toISOString()
                });
                await renderEditalFileViewer();
                alert('Arquivo anexado com sucesso!');
            } catch (error) {
                alert('Não foi possível armazenar o arquivo neste navegador. Verifique o espaço disponível.');
            }
            event.target.value = '';
        }

        async function downloadEditalFile() {
            const fileObj = await getEditalFileRecord();
            if (!fileObj) return;
            const downloadUrl = URL.createObjectURL(fileObj.blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = fileObj.name || 'Edital.pdf';
            a.click();
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
        }

        async function removerEditalFile() {
            if (confirm(`Remover o edital do concurso "${currentConcurso}"?`)) {
                await deleteEditalFileRecord();
                await renderEditalFileViewer();
            }
        }

        function openModalPromptIA() { document.getElementById('modalPromptIA').style.display = 'flex'; }
        function closeModalPromptIA() { document.getElementById('modalPromptIA').style.display = 'none'; }
        function copyPromptToClipboard() {
            navigator.clipboard.writeText(document.getElementById('promptTextToCopy').innerText);
            alert('Prompt copiado!');
        }

        async function checkAuthAndSync() {
            try {
                const { data, error } = await supabaseClient.auth.getSession();
                if (error) throw error;
                const session = data?.session || null;
                if (session?.user) {
                    currentUser = session.user;
                    prepareAuthenticatedUserContext(currentUser);
                    checkSuperUserStatus();
                    showDashboard();
                } else {
                    showCleanAuthScreen();
                }
            } catch (error) {
                console.warn('Falha ao recuperar sessão inicial:', error);
                showCleanAuthScreen('Não foi possível restaurar a sessão. Entre novamente.');
            }
        }

        async function handleLogin() {
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value.trim();
            if (!email || !password) return alert('Preencha e-mail e senha.');
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) alert('Erro ao entrar: ' + error.message);
            else { currentUser = data.user; prepareAuthenticatedUserContext(currentUser); checkSuperUserStatus(); showDashboard(); }
        }

        async function handleSignUp() {
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value.trim();
            if (!email || !password) return alert('Preencha e-mail e senha.');
            const { data, error } = await supabaseClient.auth.signUp({ email, password });
            if (error) return alert('Erro ao cadastrar: ' + error.message);

            // Se a confirmação de e-mail estiver desativada no Supabase, o cadastro
            // já retorna uma sessão válida. Nesse caso, inicia imediatamente um
            // contexto limpo para o novo user_id. Com confirmação ativa, session é null.
            if (data?.session?.user) {
                currentUser = data.session.user;
                prepareAuthenticatedUserContext(currentUser);
                checkSuperUserStatus();
                showDashboard();
                return appNotice('Conta criada e conectada com sucesso.', { title:'Bem-vindo' });
            }

            return appNotice('Cadastro realizado. Verifique seu e-mail para confirmar a conta e depois entre no Painel.', { title:'Confirme seu e-mail' });
        }

        function openAccountModal() {
            if (!currentUser) return appNotice('Você precisa estar conectado para acessar a conta.', { title:'Conta indisponível' });
            const email = document.getElementById('accountUserEmail');
            if (email) email.textContent = currentUser.email || 'E-mail não disponível';
            ['accountCurrentPassword','accountNewPassword','accountConfirmPassword','accountDeletePassword','accountDeleteConfirmation','accountPermanentDeletePassword','accountPermanentDeleteConfirmation'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const modal = document.getElementById('modalAccount');
            if (modal) modal.style.display = 'flex';
        }

        function closeAccountModal() {
            const modal = document.getElementById('modalAccount');
            if (modal) modal.style.display = 'none';
            ['accountCurrentPassword','accountNewPassword','accountConfirmPassword','accountDeletePassword','accountDeleteConfirmation','accountPermanentDeletePassword','accountPermanentDeleteConfirmation'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
        }

        function openBackupFromAccount() {
            closeAccountModal();
            openBackupManager();
        }

        async function verifyCurrentAccountPassword(password) {
            if (!currentUser?.email) throw new Error('A sessão atual não possui um e-mail disponível.');
            const result = await supabaseClient.auth.signInWithPassword({ email:currentUser.email, password });
            if (result.error) throw new Error('Senha atual inválida.');
            if (!result.data?.user || result.data.user.id !== currentUser.id) throw new Error('Não foi possível confirmar a identidade desta conta.');
            currentUser = result.data.user;
            prepareAuthenticatedUserContext(currentUser);
            return true;
        }

        async function changeAccountPassword() {
            if (!currentUser) return;
            const currentPassword = document.getElementById('accountCurrentPassword')?.value || '';
            const newPassword = document.getElementById('accountNewPassword')?.value || '';
            const confirmPassword = document.getElementById('accountConfirmPassword')?.value || '';
            if (!currentPassword || !newPassword || !confirmPassword) {
                return appNotice('Preencha a senha atual, a nova senha e a confirmação.', { title:'Alterar senha' });
            }
            if (newPassword.length < 8) return appNotice('A nova senha deve ter pelo menos 8 caracteres.', { title:'Senha muito curta' });
            if (newPassword !== confirmPassword) return appNotice('A confirmação da nova senha não corresponde.', { title:'Senhas diferentes' });
            if (newPassword === currentPassword) return appNotice('Escolha uma nova senha diferente da senha atual.', { title:'Senha sem alteração' });

            const ok = await appConfirm('Alterar a senha desta conta agora?', { title:'Confirmar alteração de senha', confirmText:'Alterar senha' });
            if (!ok) return;
            try {
                await verifyCurrentAccountPassword(currentPassword);
                const { data, error } = await supabaseClient.auth.updateUser({ password:newPassword });
                if (error) throw error;
                if (data?.user) currentUser = data.user;
                ['accountCurrentPassword','accountNewPassword','accountConfirmPassword'].forEach(id => {
                    const el = document.getElementById(id); if (el) el.value = '';
                });
                await appNotice('Senha alterada com sucesso.', { title:'Segurança da conta' });
            } catch (error) {
                await appNotice(`Não foi possível alterar a senha: ${error.message}`, { title:'Falha ao alterar senha' });
            }
        }

        async function deleteIndexedDbRecordsForUser(uid) {
            // PDFs/anexos do edital.
            try {
                const db = await openEditalFilesDatabase();
                await new Promise((resolve, reject) => {
                    const tx = db.transaction('editalFiles', 'readwrite');
                    const store = tx.objectStore('editalFiles');
                    const req = store.openCursor();
                    req.onsuccess = () => {
                        const cursor = req.result;
                        if (!cursor) return;
                        const key = String(cursor.key || cursor.value?.key || '');
                        if (key.startsWith(`edital_file_${uid}_`) || String(cursor.value?.userId || '') === uid) cursor.delete();
                        cursor.continue();
                    };
                    req.onerror = () => reject(req.error || new Error('Falha ao limpar PDFs locais.'));
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error || new Error('Falha ao limpar PDFs locais.'));
                    tx.onabort = () => reject(tx.error || new Error('Limpeza de PDFs cancelada.'));
                });
                db.close();
            } catch (error) {
                console.warn('Limpeza do IndexedDB de arquivos:', error);
                throw error;
            }

            // Backups Atual/Anterior deste usuário.
            try {
                const db = await openLocalBackupDatabase();
                await new Promise((resolve, reject) => {
                    const tx = db.transaction(LOCAL_BACKUP_STORE, 'readwrite');
                    const store = tx.objectStore(LOCAL_BACKUP_STORE);
                    const req = store.openCursor();
                    req.onsuccess = () => {
                        const cursor = req.result;
                        if (!cursor) return;
                        const key = String(cursor.key || cursor.value?.key || '');
                        if (key.startsWith(`${uid}:`) || String(cursor.value?.userId || '') === uid) cursor.delete();
                        cursor.continue();
                    };
                    req.onerror = () => reject(req.error || new Error('Falha ao limpar backups locais.'));
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error || new Error('Falha ao limpar backups locais.'));
                    tx.onabort = () => reject(tx.error || new Error('Limpeza de backups cancelada.'));
                });
                db.close();
            } catch (error) {
                console.warn('Limpeza do IndexedDB de backups:', error);
                throw error;
            }
        }

        async function clearLocalStudyDataForUser(uid, options = {}) {
            clearTimeout(localBackupTimer);
            backupRestoreInProgress = true;
            const exactKeys = new Set([
                `concursos_metadata_${uid}`,
                `edital_offline_data_${uid}`,
                `pending_sync_${uid}`,
                `last_studied_concurso_${uid}`,
                `last_successful_sync_${uid}`,
                `flashcard_shuffle_history_${uid}`
            ]);
            const prefixes = [
                `pomodoro_daily_minutes_${uid}_`,
                `pomodoro_extra_minutes_${uid}_`,
                `edital_file_${uid}_`
            ];
            const remove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (exactKeys.has(key) || prefixes.some(prefix => key.startsWith(prefix)))) remove.push(key);
            }
            remove.forEach(key => localStorage.removeItem(key));
            if (options.includeLegacy) {
                [
                    'last_studied_concurso',
                    'concursos_metadata_guest',
                    'edital_offline_data_guest',
                    'pending_sync_guest',
                    'last_successful_sync_guest'
                ].forEach(key => localStorage.removeItem(key));
            }
            await deleteIndexedDbRecordsForUser(uid);
        }

        async function deleteAllAccountStudyData() {
            if (!currentUser) return;
            if (!navigator.onLine) {
                return appNotice('Esta operação exige conexão com a internet para apagar primeiro os dados no Supabase. Nenhum dado foi removido.', { title:'Conexão necessária' });
            }
            const password = document.getElementById('accountDeletePassword')?.value || '';
            const confirmation = (document.getElementById('accountDeleteConfirmation')?.value || '').trim();
            if (!password) return appNotice('Informe sua senha atual para confirmar a exclusão.', { title:'Confirmação necessária' });
            if (confirmation !== 'EXCLUIR') return appNotice('Digite exatamente EXCLUIR para liberar a operação.', { title:'Confirmação necessária' });

            const ok = await appConfirm(
                'Esta operação apagará permanentemente todos os seus dados de estudo no Supabase e neste dispositivo, inclusive PDFs e backups locais. O login será preservado.\n\nEsta ação não pode ser desfeita. Continuar?',
                { title:'Excluir todos os dados', confirmText:'Excluir permanentemente', danger:true }
            );
            if (!ok) return;

            const uid = currentUser.id;
            try {
                await verifyCurrentAccountPassword(password);
                const { data, error } = await supabaseClient.rpc('delete_my_study_data');
                if (error) {
                    if (/function .*delete_my_study_data|Could not find the function|PGRST202/i.test(error.message || '')) {
                        throw new Error('A função segura delete_my_study_data ainda não está instalada no Supabase. Execute o SQL fornecido com a V9.51 e tente novamente.');
                    }
                    throw error;
                }
                await clearLocalStudyDataForUser(uid);
                resetInMemoryUserState();
                currentConcurso = 'Concurso Geral';
                metadataCache = {};
                console.info('Exclusão de dados concluída:', data || {});
                closeAccountModal();
                await appNotice('Todos os dados de estudo foram excluídos. Sua conta e seu e-mail foram preservados. O Painel será reiniciado em estado limpo.', { title:'Dados excluídos' });
                location.reload();
            } catch (error) {
                backupRestoreInProgress = false;
                await appNotice(`A exclusão não foi concluída: ${error.message}`, { title:'Falha na exclusão' });
            }
        }

        function clearSupabaseAuthStorage() {
            try {
                const projectRef = (() => {
                    try { return new URL(SUPABASE_URL).hostname.split('.')[0]; } catch (_) { return ''; }
                })();
                const remove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key) continue;
                    if ((projectRef && key === `sb-${projectRef}-auth-token`) || key === 'supabase.auth.token') remove.push(key);
                }
                remove.forEach(key => localStorage.removeItem(key));
            } catch (error) {
                console.warn('Limpeza local da sessão Supabase:', error);
            }
        }

        function showCleanAuthScreen(message = '') {
            currentUser = null;
            isSuperUser = false;
            activeUserContextId = null;
            userContextGeneration += 1;
            dashboardLoadPromise = null;
            syncPromise = null;
            syncUiMode = 'idle';
            resetInMemoryUserState();
            currentConcurso = 'Concurso Geral';
            metadataCache = {};
            backupRestoreInProgress = false;
            document.getElementById('app-dashboard').style.display = 'none';
            document.getElementById('auth-screen').style.display = 'flex';
            const email = document.getElementById('email');
            const password = document.getElementById('password');
            if (email) email.value = '';
            if (password) password.value = '';
            const status = document.getElementById('authStatusMessage');
            if (status) {
                status.textContent = message || '';
                status.style.display = message ? 'block' : 'none';
            }
        }

        async function deleteAccountPermanently() {
            if (!currentUser) return;
            if (!navigator.onLine) {
                return appNotice('A exclusão permanente da conta exige conexão com a internet. Nenhum dado foi removido.', { title:'Conexão necessária' });
            }

            const password = document.getElementById('accountPermanentDeletePassword')?.value || '';
            const confirmation = (document.getElementById('accountPermanentDeleteConfirmation')?.value || '').trim();
            if (!password) return appNotice('Informe sua senha atual para excluir a conta.', { title:'Confirmação necessária' });
            if (confirmation !== 'EXCLUIR CONTA') {
                return appNotice('Digite exatamente EXCLUIR CONTA para liberar a exclusão permanente.', { title:'Confirmação necessária' });
            }

            const ok = await appConfirm(
                'Esta operação excluirá permanentemente seus dados de estudo E o seu usuário de login. Você será desconectado imediatamente e voltará para a tela inicial. Para usar este e-mail novamente no futuro, será necessário fazer um novo cadastro.\n\nEsta ação não pode ser desfeita. Continuar?',
                { title:'Excluir conta permanentemente', confirmText:'Excluir minha conta', danger:true }
            );
            if (!ok) return;

            const uid = currentUser.id;
            try {
                await verifyCurrentAccountPassword(password);
                const { data:sessionData, error:sessionError } = await supabaseClient.auth.getSession();
                if (sessionError || !sessionData?.session?.access_token) throw new Error('Não foi possível obter uma sessão válida para excluir a conta.');

                // V9.54: exclusão permanente migrou para Supabase Edge Function.
                // A função recebe automaticamente o JWT da sessão pelo supabase-js,
                // identifica o próprio usuário e nunca aceita user_id arbitrário do navegador.
                const { data:payload, error:functionError } = await supabaseClient.functions.invoke('delete-account', {
                    body: { confirm: true }
                });
                if (functionError) {
                    const contextMessage = functionError?.context?.error || functionError?.context?.message || '';
                    const message = payload?.error || contextMessage || functionError.message || 'Falha ao executar a função segura de exclusão.';
                    if (/not found|404|function.*delete-account/i.test(message)) {
                        throw new Error('A Edge Function delete-account ainda não foi publicada no Supabase. Publique a função fornecida com a V9.54 e tente novamente.');
                    }
                    throw new Error(message);
                }
                if (!payload?.deleted) {
                    throw new Error(payload?.error || 'O Supabase não confirmou a exclusão permanente da conta.');
                }

                // A conta já foi removida no servidor. Daqui em diante, toda limpeza
                // local é best-effort e nunca deve manter o usuário dentro do app.
                closeAccountModal();
                document.getElementById('app-dashboard').style.display = 'none';
                try { await clearLocalStudyDataForUser(uid, { includeLegacy:true }); }
                catch (localError) { console.warn('Conta excluída; limpeza local parcial:', localError); }

                try { await supabaseClient.auth.signOut({ scope:'local' }); }
                catch (signOutError) { console.warn('Conta já excluída; signOut local:', signOutError); }
                clearSupabaseAuthStorage();
                showCleanAuthScreen('Conta excluída permanentemente. Para usar novamente este e-mail, faça um novo cadastro.');

                // Recarrega em estado anônimo para remover qualquer DOM/closure residual.
                setTimeout(() => location.replace(location.pathname + location.search), 120);
            } catch (error) {
                backupRestoreInProgress = false;
                await appNotice(`A conta não foi excluída: ${error.message}`, { title:'Falha na exclusão da conta' });
            }
        }

        async function handleLogout() {
            try {
                // Logout local: sai somente desta sessão/dispositivo, sem derrubar
                // outras sessões legítimas do mesmo usuário em outro aparelho.
                const { error } = await supabaseClient.auth.signOut({ scope:'local' });
                if (error) throw error;
            } catch (error) {
                console.warn('Falha no signOut remoto/local; limpando a interface por segurança:', error);
            }
            showCleanAuthScreen();
            clearSupabaseAuthStorage();
        }

        function checkSuperUserStatus() {
            const appRole = currentUser?.app_metadata?.role || currentUser?.user_metadata?.role || '';
            isSuperUser = appRole === 'super_user' || appRole === 'admin';
            const badge = document.getElementById('superUserBadge');
            if (badge) badge.style.display = isSuperUser ? 'inline-block' : 'none';
        }

        function showDashboard() {
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('app-dashboard').style.display = 'block';
            updateOnlineStatusBannerOnly();
            updateSyncIndicator();
            if (dashboardLoadPromise) return;
            dashboardLoadPromise = loadData().catch(error => {
                console.error('Falha ao carregar o painel:', error);
                alert('O painel foi aberto com os dados locais. A sincronização será tentada novamente.');
            }).finally(() => { dashboardLoadPromise = null; });
        }

        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                currentUser = session.user;
                prepareAuthenticatedUserContext(currentUser);
                checkSuperUserStatus();
                showDashboard();
                return;
            }

            // SIGNED_OUT também pode ocorrer por expiração, revogação ou exclusão
            // da conta em outro contexto. Nunca deixe o dashboard visível sem sessão.
            if (event === 'SIGNED_OUT' || !session) {
                showCleanAuthScreen();
            }
        });

        document.addEventListener('DOMContentLoaded', () => {
            checkAuthAndSync();
            const calendarGrid = document.getElementById('monthCalendarGrid');
            if (calendarGrid) {
                calendarGrid.addEventListener('keydown', event => {
                    if ((event.key === 'Enter' || event.key === ' ') && event.target.classList.contains('month-day-cell')) {
                        event.preventDefault();
                        event.target.click();
                    }
                });
            }
        });

        function toggleDarkMode() { document.body.classList.toggle('light-mode'); }

        function updateDesktopStickyTabsOffset() {
            if (window.matchMedia('(max-width: 900px)').matches) return;
            const header = document.querySelector('header.modern-header');
            if (!header) return;
            const style = getComputedStyle(header);
            const headerTop = parseFloat(style.top) || 0;
            const stickyTop = Math.ceil(headerTop + header.offsetHeight + 10);
            document.documentElement.style.setProperty('--desktop-tabs-sticky-top', `${stickyTop}px`);
        }

        function switchTab(tabId, btn) {
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(tb => tb.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            btn.classList.add('active');
            document.querySelectorAll('.mobile-nav-btn[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
            updateContextFab(tabId);
            updateModernOverview();

            // Renderiza componentes pesados somente quando a aba fica visível.
            if (tabId === 'tab-calendario') {
                requestAnimationFrame(() => renderMonthCalendar());
            } else if (tabId === 'tab-edital') {
                requestAnimationFrame(() => renderChart());
            }
        }



        // =========================================================
        // UI MODERNA 2026 — BUSCA, RESUMO, NAVEGAÇÃO MOBILE E FAB
        // =========================================================
        function toggleModernTools() {
            const bar = document.querySelector('.action-bar');
            if (!bar) return;
            bar.classList.toggle('mobile-open');
            if (bar.classList.contains('mobile-open') && window.innerWidth <= 900) {
                setTimeout(() => bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
            }
        }

        function getStructuredNotesForCurrentConcurso() {
            try {
                const metadata = getConcursosMetadata();
                return metadata[currentConcurso]?.structuredNotes || [];
            } catch (_) { return []; }
        }

        let globalSearchTimer = null;
        function scheduleGlobalStudySearch(rawTerm, delay = 140) {
            if (globalSearchTimer) clearTimeout(globalSearchTimer);
            globalSearchTimer = setTimeout(() => {
                globalSearchTimer = null;
                runGlobalStudySearch(rawTerm);
            }, delay);
        }

        function runGlobalStudySearch(rawTerm) {
            const box = document.getElementById('globalSearchResults');
            if (!box) return;
            const term = (rawTerm || '').trim().toLocaleLowerCase('pt-BR');
            if (term.length < 2) { box.classList.remove('visible'); box.innerHTML = ''; return; }

            const results = [];
            editalItems.forEach(item => {
                const mat = item.materia || 'Geral';
                const assunto = item.assunto || '';
                if (`${mat} ${assunto}`.toLocaleLowerCase('pt-BR').includes(term)) {
                    results.push({ type:'Edital', title:assunto || mat, sub:mat, action:() => openSearchEditalResult(mat) });
                }
            });
            getStructuredNotesForCurrentConcurso().forEach(note => {
                const txt = `${note.materia || ''} ${note.titulo || ''} ${note.conteudo || ''}`.toLocaleLowerCase('pt-BR');
                if (txt.includes(term)) results.push({ type:'Nota', title:note.titulo || 'Anotação', sub:note.materia || '', action:() => openSearchNotesResult(note.materia || '') });
            });
            (flashcardsList || []).forEach(fc => {
                const txt = `${fc.materia || ''} ${fc.assunto || ''} ${fc.pergunta || ''} ${fc.resposta || ''}`.toLocaleLowerCase('pt-BR');
                if (txt.includes(term)) results.push({ type:'Flashcard', title:fc.pergunta || 'Flashcard', sub:[fc.materia,fc.assunto].filter(Boolean).join(' · '), action:() => openSearchFlashcardResult(fc) });
            });

            const limited = results.slice(0, 16);
            if (!limited.length) {
                box.innerHTML = '<div style="padding:12px;color:var(--modern-muted);font-size:.84rem;">Nenhum resultado encontrado.</div>';
                box.classList.add('visible');
                return;
            }
            box.innerHTML = limited.map((r, idx) => `
                <button class="search-result-item" type="button" onclick="activateGlobalSearchResult(${idx})">
                    <span class="search-result-type">${escapeHtml(r.type)}</span>${escapeHtml(r.title)}
                    <span class="search-result-sub">${escapeHtml(r.sub || '')}</span>
                </button>`).join('');
            window.__globalStudySearchResults = limited;
            box.classList.add('visible');
        }

        function activateGlobalSearchResult(index) {
            const result = window.__globalStudySearchResults?.[index];
            if (result?.action) result.action();
            const box = document.getElementById('globalSearchResults');
            if (box) box.classList.remove('visible');
        }

        function findDesktopTabButton(tabId) {
            return [...document.querySelectorAll('.nav-tabs .tab-btn')].find(btn => (btn.getAttribute('onclick') || '').includes(`'${tabId}'`));
        }

        function openSearchEditalResult(materia) {
            openMaterias[materia] = true;
            const btn = findDesktopTabButton('tab-edital');
            if (btn) switchTab('tab-edital', btn);
            renderTable();
            setTimeout(() => document.getElementById('edital-title')?.scrollIntoView({behavior:'smooth', block:'start'}), 60);
        }
        function openSearchNotesResult(materia) {
            const btn = findDesktopTabButton('tab-anotacoes');
            if (btn) switchTab('tab-anotacoes', btn);
            loadNotesData();
            const sel = document.getElementById('notesMateriaSelect');
            if (sel && [...sel.options].some(o => o.value === materia)) { sel.value = materia; renderNotesList(); }
        }
        function openSearchFlashcardResult(fc) {
            const btn = findDesktopTabButton('tab-flashcards');
            if (btn) switchTab('tab-flashcards', btn);
            if (typeof setFlashcardViewFilter === 'function') setFlashcardViewFilter(fc.materia || '', fc.assunto || '');
        }

        function mobileSwitchTab(tabId, mobileBtn) {
            const desktopBtn = findDesktopTabButton(tabId);
            if (desktopBtn) switchTab(tabId, desktopBtn);
            document.querySelectorAll('.mobile-nav-btn[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
            updateContextFab(tabId);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function updateContextFab(tabId) {
            const fab = document.getElementById('contextFab');
            if (!fab) return;
            const active = tabId || document.querySelector('.tab-content.active')?.id || 'tab-edital';
            const labels = {
                'tab-edital':'Adicionar tópico',
                'tab-calendario':'Preencher cronograma',
                'tab-anotacoes':'Nova anotação',
                'tab-flashcards':'Importar flashcards'
            };
            fab.setAttribute('aria-label', labels[active] || 'Adicionar');
            fab.title = labels[active] || 'Adicionar';
        }

        function handleContextFab() {
            const active = document.querySelector('.tab-content.active')?.id || 'tab-edital';
            if (active === 'tab-anotacoes') return openModalNovaNota();
            if (active === 'tab-calendario') return openModalSelectCronogramaType();
            if (active === 'tab-flashcards') {
                document.getElementById('fcMateriaSelect')?.scrollIntoView({behavior:'smooth', block:'center'});
                setTimeout(() => document.getElementById('fcMateriaSelect')?.focus(), 350);
                return;
            }
            document.getElementById('materia')?.scrollIntoView({behavior:'smooth', block:'center'});
            setTimeout(() => document.getElementById('materia')?.focus(), 350);
        }

        let retentionDiagnosticRows = [];
        let pendingLayeredReview = null;

        function getLayeredReviewPlan(row, item, options = {}) {
            const contest = options.contest || getConcursosMetadata()[currentConcurso] || {};
            const state = row?.state || getRetentionTopicState(contest,item?.materia,item?.assunto,false);
            const retention = Number.isFinite(Number(row?.retention)) ? Number(row.retention) : (state?.lastStudyAt ? calculateRetentionFromState(state,new Date()) : 100);
            const accuracy = Number.isFinite(Number(row?.questionAccuracy)) ? Number(row.questionAccuracy) : (Number.isFinite(Number(state?.questionStats?.lastAccuracy)) ? Number(state.questionStats.lastAccuracy) : null);
            const confidence = Math.max(0,Math.min(1,Number(state?.questionStats?.confidence)||0));
            const overdue = !!row?.overdue;
            const forgot = state?.lastRating === 'forgot';
            let recommendedLayer = 1;
            let reason = 'Comece testando a recuperação sem consultar material.';
            if (forgot || retention < 40 || (accuracy != null && confidence >= .25 && accuracy < 45)) {
                recommendedLayer = 4;
                reason = 'Há evidência forte de perda do conteúdo; o reestudo é mais eficiente do que insistir em recuperação superficial.';
            } else if (item?.teoria && (accuracy == null || accuracy < 75) && retention < 72) {
                recommendedLayer = 3;
                reason = 'A teoria já existe, mas os sinais de domínio ainda pedem teste objetivo por questões.';
            } else if (overdue || retention < 82) {
                recommendedLayer = 2;
                reason = 'Uma revisão curta tende a recuperar o assunto sem exigir reestudo completo.';
            }
            const layers = [
                { layer:1, label:'Recuperação mental', minutes:5, description:'Tente explicar conceitos, regras e exceções sem consultar o material.' },
                { layer:2, label:'Revisão curta', minutes:10, description:'Consulte apenas resumo, anotação ou ponto central e confirme o que faltou.' },
                { layer:3, label:'Questões', minutes:20, description:'Resolva uma bateria curta e registre total de questões e acertos.' },
                { layer:4, label:'Reestudo de teoria', minutes:30, description:'Reconstrua o conteúdo quando a retenção ou o desempenho indicarem perda relevante.' }
            ];
            return { recommendedLayer, reason, retention, accuracy, layers };
        }

        function openLayeredReviewModal(index) {
            const row = retentionDiagnosticRows[index];
            if (!row?.state) return;
            const item = editalItems.find(i => getStudyTopicKey(i.materia,i.assunto) === row.state.key);
            if (!item) return appNotice('Este assunto não está mais disponível no edital atual.', { title:'Pontos críticos' });
            const contest = getConcursosMetadata()[currentConcurso] || {};
            const plan = getLayeredReviewPlan(row,item,{contest});
            pendingLayeredReview = { index, row, item, plan };
            const topic=document.getElementById('layeredReviewTopic');
            const meta=document.getElementById('layeredReviewMeta');
            const steps=document.getElementById('layeredReviewSteps');
            if(topic) topic.textContent=`${item.materia} — ${item.assunto}`;
            const perf = plan.accuracy == null ? '' : ` · Questões ${Math.round(plan.accuracy)}%`;
            if(meta) meta.textContent=`Retenção ${Math.round(plan.retention)}%${perf}. ${plan.reason}`;
            if(steps) steps.innerHTML=plan.layers.map(layer=>`<div class="layered-review-step ${layer.layer===plan.recommendedLayer?'recommended':''}"><div class="layered-review-number">${layer.layer}</div><div class="layered-review-content"><strong>${escapeHtml(layer.label)}${layer.layer===plan.recommendedLayer?' · recomendada':''}</strong><span>${escapeHtml(layer.description)} · ${layer.minutes} min sugeridos</span></div><button class="btn btn-secondary btn-sm" type="button" onclick="startLayeredReviewLayer(${layer.layer})">Iniciar</button></div>`).join('');
            const modal=document.getElementById('modalLayeredReview'); if(modal) modal.style.display='flex';
        }

        function closeLayeredReviewModal() {
            const modal=document.getElementById('modalLayeredReview'); if(modal) modal.style.display='none';
            pendingLayeredReview=null;
        }

        function startRecommendedLayeredReview() {
            const layer=pendingLayeredReview?.plan?.recommendedLayer;
            if(layer) startLayeredReviewLayer(layer);
        }

        function startLayeredReviewLayer(layer) {
            const pending=pendingLayeredReview; if(!pending?.item) return;
            const item=pending.item;
            const def=pending.plan.layers.find(x=>x.layer===Number(layer)); if(!def) return;
            const base={kind:'study',materia:item.materia,assunto:item.assunto,itemId:item.id,isRevision:true,minutes:def.minutes,source:'layered_review',layer:Number(layer)};
            const modal=document.getElementById('modalLayeredReview'); if(modal) modal.style.display='none';
            pendingLayeredReview=null;
            if(Number(layer)===1) return openActiveRecallGuide({...base,activityType:'revisao_ativa',method:'revisao_ativa',methodLabel:'Recuperação mental',recoveryMethod:'revisao_ativa'});
            if(Number(layer)===2) return launchOpportunityPomodoro({...base,activityType:'teoria',method:'revisao_curta',methodLabel:'Revisão curta',recoveryMethod:'revisao_curta'});
            if(Number(layer)===3) return launchOpportunityPomodoro({...base,activityType:'questoes',method:'questoes',methodLabel:'Questões',recoveryMethod:'questoes'});
            return launchOpportunityPomodoro({...base,activityType:'teoria',method:'reestudo',methodLabel:'Reestudo de teoria',recoveryMethod:'reestudo'});
        }

        function buildRetentionDiagnostics() {
            const contest = getConcursosMetadata()[currentConcurso] || {};
            const engine = getRetentionEngine(contest, false);
            const now = new Date();
            const states = Object.values(engine?.topics || {}).filter(state => state?.lastStudyAt);
            const rows = states.map(state => {
                const retention = Math.max(0, Math.min(100, calculateRetentionFromState(state, now)));
                const nextAt = state.nextReviewAt ? new Date(state.nextReviewAt) : null;
                const overdue = !!(nextAt && Number.isFinite(nextAt.getTime()) && nextAt < now);
                const overdueDays = overdue ? Math.max(0, Math.floor((now - nextAt) / 86400000)) : 0;
                const questionAccuracy = Number.isFinite(Number(state?.questionStats?.lastAccuracy)) ? Number(state.questionStats.lastAccuracy) : null;
                const item = editalItems.find(i => getStudyTopicKey(i.materia,i.assunto) === state.key);
                const schedulerScore = item ? computeRetentionSchedulerScore(item,{contest,now,state,isRevision:true,activityType:'revisao_ativa',availableMinutes:20,suggestedMinutes:15}).total : 0;
                const prioritySignal = Math.max(0,Math.min(50,schedulerScore/25));
                const riskScore = (100-retention) + (overdue ? 28 + Math.min(30,overdueDays*3) : 0) + (questionAccuracy!=null && questionAccuracy<60 ? (60-questionAccuracy)*.7 : 0) + prioritySignal;
                return { state, retention, nextAt, overdue, overdueDays, questionAccuracy, riskScore, schedulerScore };
            });
            const avg = rows.length ? rows.reduce((sum,row)=>sum+row.retention,0)/rows.length : null;
            const risk = rows.filter(row => row.retention < 70 || row.overdue || (row.questionAccuracy!=null && row.questionAccuracy<60));
            const overdue = rows.filter(row => row.overdue);
            const mastered = rows.filter(row => row.retention >= 85 && !row.overdue && (row.questionAccuracy==null || row.questionAccuracy>=75));
            risk.sort((a,b)=>b.riskScore-a.riskScore || a.retention-b.retention);
            return { rows, avg, risk, overdue, mastered };
        }

        function renderRetentionDiagnostics() {
            const panel = document.getElementById('retentionDiagnosticPanel');
            if (!panel) return;
            const set = (id,value) => { const el=document.getElementById(id); if(el) el.textContent=value; };
            if (!hasRealCurrentConcurso()) {
                set('retentionDiagAverage','—'); set('retentionDiagRisk','0'); set('retentionDiagOverdue','0'); set('retentionDiagMastered','0');
                const phaseBox=document.getElementById('retentionExamPhase'); if(phaseBox) phaseBox.innerHTML='<strong>Estratégia da prova</strong><span>Crie ou selecione um concurso para ativar a estratégia progressiva.</span>';
                const list=document.getElementById('retentionDiagnosticRiskList'); if(list) list.innerHTML='<div class="retention-empty">Crie ou selecione um concurso para iniciar o diagnóstico.</div>';
                retentionDiagnosticRows=[]; return;
            }
            const phase = getExamPhaseProfile(getConcursosMetadata()[currentConcurso] || {});
            const phaseBox = document.getElementById('retentionExamPhase');
            if (phaseBox) {
                const dayText = phase.days == null ? '' : (phase.days < 0 ? '' : phase.days === 0 ? 'Hoje' : `${phase.days} dia${phase.days===1?'':'s'}`);
                phaseBox.innerHTML = `<strong>${escapeHtml(phase.label)}${dayText?` · ${escapeHtml(dayText)}`:''}</strong><span>${escapeHtml(phase.guidance)}</span>`;
            }
            const diag = buildRetentionDiagnostics();
            set('retentionDiagAverage', Number.isFinite(diag.avg) ? `${Math.round(diag.avg)}%` : '—');
            set('retentionDiagRisk', diag.risk.length);
            set('retentionDiagOverdue', diag.overdue.length);
            set('retentionDiagMastered', diag.mastered.length);
            retentionDiagnosticRows = diag.risk.slice(0,5);
            const list=document.getElementById('retentionDiagnosticRiskList'); if(!list) return;
            if (!diag.rows.length) {
                list.innerHTML='<div class="retention-empty">Ainda não há sessões suficientes para estimar retenção. O diagnóstico aparecerá conforme você estudar.</div>';
                return;
            }
            if (!retentionDiagnosticRows.length) {
                list.innerHTML='<div class="retention-empty">Nenhum assunto está em risco neste momento.</div>';
                return;
            }
            list.innerHTML=retentionDiagnosticRows.map((row,index)=>{
                const state=row.state;
                const item=editalItems.find(i=>getStudyTopicKey(i.materia,i.assunto)===state.key);
                const plan=item?getLayeredReviewPlan(row,item):null;
                const status=row.overdue ? `Revisão vencida${row.overdueDays?` há ${row.overdueDays}d`:''}` : (row.questionAccuracy!=null && row.questionAccuracy<60 ? `Questões ${Math.round(row.questionAccuracy)}%` : 'Retenção abaixo do alvo');
                const layerDef=plan?.layers?.find(x=>x.layer===plan.recommendedLayer);
                const layerText=plan?`Camada ${plan.recommendedLayer}: ${layerDef?.label||'Revisão'}`:'Revisão adaptativa';
                return `<div class="retention-risk-row v965"><div class="critical-rank">${index+1}</div><div><div class="retention-risk-title">${escapeHtml(state.materia)} — ${escapeHtml(state.assunto)}</div><div class="retention-risk-meta">${escapeHtml(status)}</div><div class="critical-layer-label">${escapeHtml(layerText)}</div></div><div class="retention-risk-value">${Math.round(row.retention)}%</div><button class="btn btn-secondary btn-sm" type="button" onclick="openLayeredReviewModal(${index})">Revisar</button></div>`;
            }).join('');
        }

        function startRetentionDiagnosticTopic(index) {
            return openLayeredReviewModal(index);
            const row=retentionDiagnosticRows[index]; if(!row?.state) return;
            const state=row.state;
            const item=editalItems.find(i=>getStudyTopicKey(i.materia,i.assunto)===state.key);
            if(!item) return appNotice('Este assunto não está mais disponível no edital atual.', { title:'Retenção e Diagnóstico' });
            const isRevision=!!(row.overdue || row.retention<70);
            const contest=getConcursosMetadata()[currentConcurso]||{};
            const retentionState=getRetentionTopicState(contest,item.materia,item.assunto,false);
            const methodRec=getActiveRecallMethodRecommendation(item,{contest,state:retentionState,isRevision,minutes:20,contextMode:'any'});
            const rec={ kind:methodRec.method==='flashcards'?'flashcards':'study', materia:item.materia, assunto:item.assunto, itemId:item.id, activityType:methodRec.activityType, method:methodRec.method, methodLabel:methodRec.label, recoveryMethod:methodRec.method, flashcardCount:methodRec.flashcardCount||0, isRevision, minutes:methodRec.minutes||20, reason:methodRec.reason };
            opportunityRecommendations=[rec];
            startOpportunityRecommendation(0);
        }

        function updateModernOverview() {
            const topics = editalItems || [];
            const checks = ['teoria','questoes'];
            const done = topics.reduce((acc, item) => acc + checks.filter(k => !!item[k]).length, 0);
            const total = topics.length * checks.length;
            const pct = total ? Math.round(done / total * 100) : 0;
            const delayedText = document.getElementById('delayedBadgeCount')?.textContent || '0';
            const delayed = (delayedText.match(/\d+/) || ['0'])[0];
            const today = document.getElementById('dailyPomodoroTotal')?.textContent || '00:00';
            const target = document.getElementById('dailyPomodoroTarget')?.textContent || '—';
            const set = (id, value) => { const el=document.getElementById(id); if(el) el.textContent=value; };
            set('modernOverviewProgress', `${pct}%`);
            set('modernOverviewTopics', topics.length);
            set('modernOverviewReviews', delayed);
            set('modernOverviewToday', today);
            set('modernOverviewTarget', target === 'Sem meta' ? '—' : target);
            set('modernOverviewStudiedHours', formatStudyMinutes(getTotalRecordedStudyMinutes()));
            renderRetentionDiagnostics();
        }

        document.addEventListener('click', (event) => {
            const results = document.getElementById('globalSearchResults');
            if (results && !event.target.closest('.modern-command-center')) results.classList.remove('visible');
        });

        window.addEventListener('load', () => {
            updateModernOverview();
            updateContextFab();
            updateDesktopStickyTabsOffset();
            const stickyHeader = document.querySelector('header.modern-header');
            if (stickyHeader && 'ResizeObserver' in window) {
                new ResizeObserver(updateDesktopStickyTabsOffset).observe(stickyHeader);
            }
            window.addEventListener('resize', updateDesktopStickyTabsOffset, { passive: true });
            const observedIds = ['edital-list','dailyPomodoroTotal','dailyPomodoroTarget','delayedBadgeCount'];
            observedIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) new MutationObserver(updateModernOverview).observe(el, {childList:true,subtree:true,characterData:true});
            });
        });

        // =========================================================
        // PWA MULTIPLATAFORMA: INSTALAÇÃO ANDROID / iOS
        // =========================================================
        let deferredPwaInstallPrompt = null;

        function isPwaStandalone() {
            return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        }

        function markPwaInstalled() {
            try { localStorage.setItem('pwa_app_installed', '1'); } catch (_) {}
        }

        function isPwaKnownInstalled() {
            if (isPwaStandalone()) {
                markPwaInstalled();
                return true;
            }
            try { return localStorage.getItem('pwa_app_installed') === '1'; } catch (_) { return false; }
        }

        function getPwaPlatform() {
            const ua = navigator.userAgent || '';
            const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const isAndroid = /Android/i.test(ua);
            return { isIOS, isAndroid };
        }

        function showPwaInstallBanner(mode = 'generic') {
            if (isPwaKnownInstalled() || sessionStorage.getItem('pwa_install_banner_dismissed') === '1') return;

            const banner = document.getElementById('pwa-install-banner');
            const title = document.getElementById('pwaInstallTitle');
            const message = document.getElementById('pwaInstallText');
            const installBtn = document.getElementById('pwaInstallButton');
            if (!banner || !title || !message || !installBtn) return;

            if (mode === 'ios') {
                title.textContent = 'Instalar no iPhone / iPad';
                message.textContent = 'No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.';
                installBtn.style.display = 'none';
            } else if (mode === 'android-manual') {
                title.textContent = 'Instalar no Android';
                message.textContent = 'Abra o menu do navegador e escolha “Instalar app” ou “Adicionar à tela inicial”.';
                installBtn.style.display = 'none';
            } else {
                title.textContent = 'Instalar Estudo Adaptativo Inteligente';
                message.textContent = 'Instale o app para abrir em tela cheia e facilitar o uso offline.';
                installBtn.style.display = '';
            }

            banner.classList.add('visible');
        }

        function hidePwaInstallBanner() {
            const banner = document.getElementById('pwa-install-banner');
            if (banner) banner.classList.remove('visible');
        }

        function dismissPwaBanner() {
            sessionStorage.setItem('pwa_install_banner_dismissed', '1');
            hidePwaInstallBanner();
        }

        async function installPwaApp() {
            if (!deferredPwaInstallPrompt) {
                const { isIOS, isAndroid } = getPwaPlatform();
                showPwaInstallBanner(isIOS ? 'ios' : (isAndroid ? 'android-manual' : 'generic'));
                return;
            }

            deferredPwaInstallPrompt.prompt();
            try {
                await deferredPwaInstallPrompt.userChoice;
            } finally {
                deferredPwaInstallPrompt = null;
                hidePwaInstallBanner();
            }
        }

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            // Se o navegador voltou a oferecer instalação, o app não está mais
            // instalado neste perfil/dispositivo. Remove um marcador antigo.
            try { localStorage.removeItem('pwa_app_installed'); } catch (_) {}
            deferredPwaInstallPrompt = event;
            showPwaInstallBanner('prompt');
        });

        window.addEventListener('appinstalled', () => {
            deferredPwaInstallPrompt = null;
            markPwaInstalled();
            hidePwaInstallBanner();
        });

        window.addEventListener('load', () => {
            if (isPwaKnownInstalled()) { hidePwaInstallBanner(); return; }
            const { isIOS, isAndroid } = getPwaPlatform();
            if (isIOS) {
                setTimeout(() => showPwaInstallBanner('ios'), 900);
            } else if (isAndroid) {
                // Chromium dispara beforeinstallprompt quando elegível. Se não
                // disparar (ex.: Firefox), oferece orientação manual sem bloquear a UI.
                setTimeout(() => {
                    if (!deferredPwaInstallPrompt) showPwaInstallBanner('android-manual');
                }, 1800);
            }
        });

        window.installPwaApp = installPwaApp;
        window.dismissPwaBanner = dismissPwaBanner;
        window.handleSignUp = handleSignUp;
        window.handleLogin = handleLogin;
        window.handleLogout = handleLogout;
        window.toggleDarkMode = toggleDarkMode;
        window.startFocusTimer = startFocusTimer;
        window.startIntervalTimer = startIntervalTimer;
        window.populateNotaAssuntoDropdown = populateNotaAssuntoDropdown;
        window.handleNotaAssuntoChange = handleNotaAssuntoChange;
        window.switchTab = switchTab;
        window.openModalAnaliseEditalIA = openModalAnaliseEditalIA;
        window.closeModalAnaliseEditalIA = closeModalAnaliseEditalIA;
        window.executarAnaliseEditalIA = executarAnaliseEditalIA;
        window.importarAnaliseEditalIA = importarAnaliseEditalIA;
        window.importJSON = importJSON;
        window.clearData = clearData;
        window.addManualItem = addManualItem;
        window.toggleCheck = toggleCheck;
        window.clearRowCheckboxes = clearRowCheckboxes;
        window.toggleMateria = toggleMateria;
        window.toggleAllAccordions = toggleAllAccordions;
        window.updateMateriaPriority = updateMateriaPriority;
        window.updateAssuntoPriority = updateAssuntoPriority;
        window.excluirMateriaEspecifica = excluirMateriaEspecifica;
        window.changeConcurso = changeConcurso;
        window.openModalNovoConcurso = openModalNovoConcurso;
        window.closeModalNovoConcurso = closeModalNovoConcurso;
        window.confirmarNovoConcurso = confirmarNovoConcurso;
        window.renomearConcursoAtual = renomearConcursoAtual;
        window.removerConcursoAtual = removerConcursoAtual;
        window.editarDataProva = editarDataProva;
        window.startTimer = startTimer;
        window.resetTimer = resetTimer;
        window.updateTimerSettings = updateTimerSettings;
        window.openModalPromptIA = openModalPromptIA;
        window.closeModalPromptIA = closeModalPromptIA;
        window.copyPromptToClipboard = copyPromptToClipboard;
        window.openModalViewEdital = openModalViewEdital;
        window.closeModalViewEdital = closeModalViewEdital;
        window.uploadEditalFile = uploadEditalFile;
        window.downloadEditalFile = downloadEditalFile;
        window.removerEditalFile = removerEditalFile;
        window.forceFullSync = forceFullSync;
        window.removeFlashcard = removeFlashcard;
        window.openEditarFlashcardModal = openEditarFlashcardModal;
        window.closeModalEditarFlashcard = closeModalEditarFlashcard;
        window.salvarEdicaoFlashcard = salvarEdicaoFlashcard;
        window.onMonthYearChange = onMonthYearChange;
        window.limparCronogramaMesAtual = limparCronogramaMesAtual;
        window.limparMateriasEstudadas = limparMateriasEstudadas;
        window.filterDelayedList = filterDelayedList;
        window.updateFcAssuntoOptions = updateFcAssuntoOptions;
        window.processPastedFlashcardsText = processPastedFlashcardsText;
        window.startShuffleStudyModal = startShuffleStudyModal;
        window.toggleStudyCardAnswer = toggleStudyCardAnswer;
        window.nextStudyCard = nextStudyCard;
        window.closeStudyModal = closeStudyModal;
        window.openModalConfigHorarios = openModalConfigHorarios;
        window.closeModalConfigHorarios = closeModalConfigHorarios;
        window.gerarCronogramaInteligente = gerarCronogramaInteligente;
        window.renderNotesList = renderNotesList;
        window.openModalNovaNota = openModalNovaNota;
        window.closeModalNovaNota = closeModalNovaNota;
        window.salvarNota = salvarNota;
        window.editNota = editNota;
        window.deleteNota = deleteNota;
        window.handleActionButton = handleActionButton;
        window.openModalDayContent = openModalDayContent;
        window.closeModalDayContent = closeModalDayContent;
        window.toggleCheckFromModal = toggleCheckFromModal;
        window.deleteTopicFromDay = deleteTopicFromDay;
        window.openModalSelectCronogramaType = openModalSelectCronogramaType;
        window.closeModalSelectCronogramaType = closeModalSelectCronogramaType;
        window.chooseCronogramaType = chooseCronogramaType;
        window.openModalMentorisMethod = openModalMentorisMethod;
        window.closeModalMentorisMethod = closeModalMentorisMethod;
        window.toggleWeekdaySelect = toggleWeekdaySelect;
        window.selectHoursOption = selectHoursOption;
        window.selectCustomDailyHoursOption = selectCustomDailyHoursOption;
        window.setCustomDailyHours = setCustomDailyHours;
        window.toggleAdaptiveRevision = toggleAdaptiveRevision;
        window.gerarCronogramaMetodo2 = gerarCronogramaMetodo2;
        window.openFlexibleStudyConfig = openFlexibleStudyConfig;
        window.closeFlexibleStudyConfig = closeFlexibleStudyConfig;
        window.setFlexibleDayMode = setFlexibleDayMode;
        window.activateFlexibleStudyMode = activateFlexibleStudyMode;
        window.openOpportunityStudyModal = openOpportunityStudyModal;
        window.closeOpportunityStudyModal = closeOpportunityStudyModal;
        window.selectOpportunityMinutes = selectOpportunityMinutes;
        window.selectOpportunityContext = selectOpportunityContext;
        window.ignoreFlexibleRestForOpportunity = ignoreFlexibleRestForOpportunity;
        window.startOpportunityRecommendation = startOpportunityRecommendation;
        window.startRetentionDiagnosticTopic = startRetentionDiagnosticTopic;
        window.showEditTopicDropdown = showEditTopicDropdown;
        window.updateEditAssuntoDropdown = updateEditAssuntoDropdown;
        window.confirmEditTopicWithSwap = confirmEditTopicWithSwap;
        window.addManualTopicToDay = addManualTopicToDay;
        window.showAddTopicSelectors = showAddTopicSelectors;
        window.updateAddAssuntoDropdown = updateAddAssuntoDropdown;
        window.resetAddTopicArea = resetAddTopicArea;
        window.confirmAddTopicWithSwap = confirmAddTopicWithSwap;
        window.toggleFcFolder = toggleFcFolder;
        window.setFlashcardViewFilter = setFlashcardViewFilter;
        window.openModalFiltroEstudoFlashcards = openModalFiltroEstudoFlashcards;
        window.closeModalFiltroEstudoFlashcards = closeModalFiltroEstudoFlashcards;
        window.updateStudyFilterAssuntoOptions = updateStudyFilterAssuntoOptions;
        window.startFilteredStudyModal = startFilteredStudyModal;
        window.resetDailyPomodoroHours = resetDailyPomodoroHours;

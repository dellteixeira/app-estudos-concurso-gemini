from pathlib import Path


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 anchor, found {count}')
    p.write_text(text.replace(old, new, 1))


replace_once(
    'public/index.html',
    '    <script src="./js/core/local-backup-store.js" defer></script>\n    <script src="./js/app-core.js" defer></script>',
    '    <script src="./js/core/edital-integrity.js" defer></script>\n    <script src="./js/core/local-backup-store.js" defer></script>\n    <script src="./js/app-core.js" defer></script>',
    'index helper load'
)

p = Path('config/app-assets.json')
text = p.read_text()
anchor = '"/js/core/local-backup-store.js"'
if '"/js/core/edital-integrity.js"' not in text:
    if anchor not in text:
        raise SystemExit('app-assets local-backup anchor missing')
    text = text.replace(anchor, '"/js/core/edital-integrity.js", "/js/core/local-backup-store.js"', 1)
p.write_text(text)

p = Path('public/sw.js')
text = p.read_text()
critical_anchor = "'./js/study-domain.js', './js/core/local-backup-store.js'"
if "'./js/core/edital-integrity.js'" not in text:
    if critical_anchor not in text:
        raise SystemExit('public/sw.js: critical app shell anchor missing')
    text = text.replace(
        critical_anchor,
        "'./js/study-domain.js', './js/core/edital-integrity.js', './js/core/local-backup-store.js'",
        1
    )
core_anchor = "'/js/study-domain.js', '/js/core/local-backup-store.js'"
if "'/js/core/edital-integrity.js'" not in text:
    if core_anchor not in text:
        raise SystemExit('public/sw.js: network-first core anchor missing')
    text = text.replace(
        core_anchor,
        "'/js/study-domain.js', '/js/core/edital-integrity.js', '/js/core/local-backup-store.js'",
        1
    )
p.write_text(text)

p = Path('src/worker.js')
text = p.read_text()
if '/js/core/edital-integrity.js' not in text:
    anchor = "  '/js/core/offline-outbox-store.js',"
    if anchor not in text:
        raise SystemExit('src/worker.js: offline-outbox anchor missing')
    text = text.replace(anchor, "  '/js/core/edital-integrity.js',\n" + anchor, 1)
p.write_text(text)

p = Path('public/_headers')
text = p.read_text()
if '/js/core/edital-integrity.js' not in text:
    anchor = '/js/core/local-backup-store.js\n  Cache-Control: no-cache, no-store, must-revalidate'
    if anchor not in text:
        raise SystemExit('_headers local-backup anchor missing')
    text = text.replace(anchor, '/js/core/edital-integrity.js\n  Cache-Control: no-cache, no-store, must-revalidate\n\n' + anchor, 1)
p.write_text(text)

p = Path('public/js/app-core.js')
text = p.read_text()

old = """        function getEditalLocalStorageKey() {
            const uid = currentUser ? currentUser.id : 'guest';
            return `edital_offline_data_${uid}`;
        }

        function loadLocalEditalData() {
            const local = localStorage.getItem(getEditalLocalStorageKey());
            if (local) {
                try {
                    allEditalItems = JSON.parse(local).map(item => ({ ...item, id: String(item.id), concurso: item.concurso || 'Concurso Geral', videoaula: !!item.videoaula, metodo_conteudo: normalizeContentMethod(item.metodo_conteudo) }));
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
"""
new = """        function getEditalLocalStorageKey() {
            const uid = currentUser ? currentUser.id : 'guest';
            return `edital_offline_data_${uid}`;
        }

        function reconcileEditalTopicIntegrity(options = {}) {
            const integrity = window.EditalIntegrity;
            if (!integrity?.dedupe) return { items: allEditalItems, removedIds: [], changed: false };
            const result = integrity.dedupe(allEditalItems);
            if (!result.changed) return result;

            allEditalItems = result.items;
            if (options.queue !== false && currentUser) {
                const state = getSyncState();
                const removed = new Set(result.removedIds.map(String));
                result.removedIds.forEach(id => {
                    const normalizedId = String(id);
                    delete state.editalUpserts[normalizedId];
                    if (!state.editalDeletes.includes(normalizedId)) state.editalDeletes.push(normalizedId);
                });
                result.items.forEach(item => {
                    if (item?.id == null || removed.has(String(item.id))) return;
                    const id = String(item.id);
                    state.editalUpserts[id] = { ...item, id };
                    state.editalDeletes = state.editalDeletes.filter(savedId => String(savedId) !== id);
                });
                saveSyncState(state);
            }
            return result;
        }

        function loadLocalEditalData() {
            const local = localStorage.getItem(getEditalLocalStorageKey());
            if (local) {
                try {
                    allEditalItems = JSON.parse(local).map(item => ({ ...item, id: String(item.id), concurso: item.concurso || 'Concurso Geral', videoaula: !!item.videoaula, metodo_conteudo: normalizeContentMethod(item.metodo_conteudo) }));
                    const reconciliation = reconcileEditalTopicIntegrity();
                    if (reconciliation.changed) {
                        localStorage.setItem(getEditalLocalStorageKey(), JSON.stringify(allEditalItems));
                    }
                } catch(e) { allEditalItems = []; }
            }
        }

        function saveEditalToLocalStorage() {
            reconcileEditalTopicIntegrity();
            localStorage.setItem(getEditalLocalStorageKey(), JSON.stringify(allEditalItems));
            scheduleLocalBackup('alteração no edital verticalizado');
        }

        async function saveEditalItemToCloud(item) {
            // Delta sync: grava imediatamente no aparelho e agrupa alterações rápidas.
            const integrity = window.EditalIntegrity;
            const duplicate = integrity?.findDuplicate?.(allEditalItems, item, { ignoreId: item?.id });
            if (duplicate && String(duplicate.id) !== String(item?.id)) {
                Object.assign(duplicate, integrity.mergePair(duplicate, item));
                allEditalItems = allEditalItems.filter(saved => String(saved.id) !== String(item.id));
                saveEditalToLocalStorage();
                queueEditalUpsert(duplicate);
                queueEditalDelete(item.id);
                if (navigator.onLine && currentUser) scheduleEditalSync();
                return duplicate;
            }
            saveEditalToLocalStorage();
            queueEditalUpsert(item);
            if (navigator.onLine && currentUser) scheduleEditalSync();
            return item;
        }
"""
if text.count(old) != 1:
    raise SystemExit(f'app-core storage block anchor count={text.count(old)}')
text = text.replace(old, new, 1)

old = """            const materia = document.getElementById('materia').value.trim();
            const assunto = document.getElementById('assunto').value.trim();
            const prioridade = parseInt(document.getElementById('prioridade').value) || 1;

            const newItem = {"""
new = """            const materia = document.getElementById('materia').value.trim();
            const assunto = document.getElementById('assunto').value.trim();
            const prioridade = parseInt(document.getElementById('prioridade').value) || 1;

            const duplicate = window.EditalIntegrity?.findDuplicate?.(allEditalItems, { concurso: currentConcurso, materia, assunto });
            if (duplicate) {
                await appNotice('Este assunto já está cadastrado nesta matéria. O edital não permite assuntos duplicados no mesmo concurso e matéria.', { title:'Assunto já cadastrado' });
                return;
            }

            const newItem = {"""
if text.count(old) != 1:
    raise SystemExit(f'manual add anchor count={text.count(old)}')
text = text.replace(old, new, 1)

old = """                                    formattedData.push(itemObj);
                                    allEditalItems.push(itemObj);
                                    openMaterias[mName] = true;"""
new = """                                    const duplicateImport = window.EditalIntegrity?.findDuplicate?.(allEditalItems, itemObj, { ignoreId: itemObj.id });
                                    if (duplicateImport) return;
                                    formattedData.push(itemObj);
                                    allEditalItems.push(itemObj);
                                    openMaterias[mName] = true;"""
if text.count(old) != 1:
    raise SystemExit(f'import push anchor count={text.count(old)}')
text = text.replace(old, new, 1)

p.write_text(text)

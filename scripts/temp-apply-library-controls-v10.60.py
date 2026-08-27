from pathlib import Path
import re


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected 1 occurrence, found {count}: {old[:80]!r}')
    p.write_text(text.replace(old, new, 1))


def replace_all(path, old, new, minimum=1):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f'{path}: expected >= {minimum} occurrences, found {count}: {old!r}')
    p.write_text(text.replace(old, new))


# public/index.html — preserve CRLF and move Selecionar next to the PDF grid.
p = Path('public/index.html')
data = p.read_bytes()
for old in [
    b'                            <button class="btn btn-secondary" id="btnPdfSelectionMode" type="button" data-action="call" data-call="PdfStudyLibraryUI.toggleSelectionMode">Selecionar</button>\r\n',
    b'                        <select id="pdfAssuntoFilter" data-inline-change="ih-018"><option value="">Todos os assuntos</option></select>\r\n',
]:
    if data.count(old) != 1:
        raise SystemExit(f'public/index.html: exact markup not found once: {old!r}')
    data = data.replace(old, b'', 1)
anchor = b'                    <div id="pdfLibraryStatus" class="pdf-library-status" aria-live="polite"></div>\r\n                    <div id="pdfBulkToolbar" class="pdf-bulk-toolbar" hidden>\r\n'
inserted = b'                    <div id="pdfLibraryStatus" class="pdf-library-status" aria-live="polite"></div>\r\n                    <div class="pdf-library-selection-row">\r\n                        <button class="btn btn-secondary" id="btnPdfSelectionMode" type="button" data-action="call" data-call="PdfStudyLibraryUI.toggleSelectionMode">Selecionar</button>\r\n                    </div>\r\n                    <div id="pdfBulkToolbar" class="pdf-bulk-toolbar" hidden>\r\n'
if data.count(anchor) != 1:
    raise SystemExit('public/index.html: selection insertion anchor not found once')
p.write_bytes(data.replace(anchor, inserted, 1))

# Library UI — remove only the visual Assunto filter path; upload/link Assunto remain.
replace_once('public/js/pdf/pdf-library-ui.js',
    "let state={docs:[],workspaces:[],scope:'global',activeWorkspace:'',activeMateria:'',activeAssunto:'',search:'',initializedFor:'',loadSeq:0};",
    "let state={docs:[],workspaces:[],scope:'global',activeWorkspace:'',activeMateria:'',search:'',initializedFor:'',loadSeq:0};")
replace_once('public/js/pdf/pdf-library-ui.js',
    "  renderAss('filter');renderAss('upload');renderAss('link');",
    "  renderAss('upload');renderAss('link');")
replace_once('public/js/pdf/pdf-library-ui.js',
    "function renderAss(mode){\n  const mid=mode==='filter'?'pdfMateriaFilter':mode==='upload'?'pdfUploadMateria':'pdfLinkMateria';\n  const tid=mode==='filter'?'pdfAssuntoFilter':mode==='upload'?'pdfUploadAssunto':'pdfLinkAssunto';\n  const e=$(tid);if(!e)return;\n  const arr=assuntos($(mid)?.value||'');\n  e.innerHTML=`<option value=\"\">${mode==='filter'?'Todos os assuntos':'Sem assunto específico'}</option>`+arr.map(a=>`<option value=\"${esc(a)}\">${esc(a)}</option>`).join('');\n}",
    "function renderAss(mode){\n  const mid=mode==='upload'?'pdfUploadMateria':'pdfLinkMateria';\n  const tid=mode==='upload'?'pdfUploadAssunto':'pdfLinkAssunto';\n  const e=$(tid);if(!e)return;\n  const arr=assuntos($(mid)?.value||'');\n  e.innerHTML='<option value=\"\">Sem assunto específico</option>'+arr.map(a=>`<option value=\"${esc(a)}\">${esc(a)}</option>`).join('');\n}")
replace_once('public/js/pdf/pdf-library-ui.js',
    "  const filters={scope:state.scope,concurso:cc,workspaceId:state.activeWorkspace,materia:state.activeMateria,assunto:state.activeAssunto,search:state.search};",
    "  const filters={scope:state.scope,concurso:cc,workspaceId:state.activeWorkspace,materia:state.activeMateria,search:state.search};")
replace_once('public/js/pdf/pdf-library-ui.js',
    "function ensureLibraryViewToggle(){ensureLibraryViewStyles();const assunto=$('pdfAssuntoFilter');if(!assunto)return;let wrap=$('pdfLibraryViewToggle');if(!wrap){wrap=document.createElement('div');wrap.id='pdfLibraryViewToggle';wrap.className='pdf-library-view-toggle';wrap.setAttribute('aria-label','Modo de visualização da Biblioteca');wrap.innerHTML='<button type=\"button\" data-view=\"cards\" aria-label=\"Visualizar em cards\">▦ Cards</button><button type=\"button\" data-view=\"list\" aria-label=\"Visualizar em lista\">☰ Lista</button>';wrap.addEventListener('click',event=>{const btn=event.target.closest('button[data-view]');if(btn)applyLibraryViewMode(btn.dataset.view)});assunto.insertAdjacentElement('afterend',wrap)}applyLibraryViewMode()}",
    "function ensureLibraryViewToggle(){ensureLibraryViewStyles();const materia=$('pdfMateriaFilter');if(!materia)return;let wrap=$('pdfLibraryViewToggle');if(!wrap){wrap=document.createElement('div');wrap.id='pdfLibraryViewToggle';wrap.className='pdf-library-view-toggle';wrap.setAttribute('aria-label','Modo de visualização da Biblioteca');wrap.innerHTML='<button type=\"button\" data-view=\"cards\" aria-label=\"Visualizar em cards\">▦ Cards</button><button type=\"button\" data-view=\"list\" aria-label=\"Visualizar em lista\">☰ Lista</button>';wrap.addEventListener('click',event=>{const btn=event.target.closest('button[data-view]');if(btn)applyLibraryViewMode(btn.dataset.view)});materia.insertAdjacentElement('afterend',wrap)}applyLibraryViewMode()}")
replace_once('public/js/pdf/pdf-library-ui.js',
    "function resetLibraryToGlobalView(){state.scope='global';state.activeWorkspace='';state.activeMateria='';state.activeAssunto='';state.search='';if($('pdfLibraryScope'))$('pdfLibraryScope').value='global';if($('pdfMateriaFilter'))$('pdfMateriaFilter').value='';if($('pdfAssuntoFilter'))$('pdfAssuntoFilter').value='';if($('pdfLibrarySearch'))$('pdfLibrarySearch').value=''}",
    "function resetLibraryToGlobalView(){state.scope='global';state.activeWorkspace='';state.activeMateria='';state.search='';if($('pdfLibraryScope'))$('pdfLibraryScope').value='global';if($('pdfMateriaFilter'))$('pdfMateriaFilter').value='';if($('pdfLibrarySearch'))$('pdfLibrarySearch').value=''}")
replace_once('public/js/pdf/pdf-library-ui.js',
    "  state={...state,docs:[],activeWorkspace:'',activeMateria:'',activeAssunto:'',search:'',initializedFor:cc};",
    "  state={...state,docs:[],activeWorkspace:'',activeMateria:'',search:'',initializedFor:cc};")
replace_once('public/js/pdf/pdf-library-ui.js',
    "function onScopeChange(v){state.scope=v==='global'?'global':'contest';state.activeMateria='';state.activeAssunto='';$('pdfLibraryScope').value=state.scope;load().catch(handle)}\nfunction onMateriaFilterChange(v){state.activeMateria=v||'';state.activeAssunto='';renderAss('filter');load().catch(handle)}\nfunction onAssuntoFilterChange(v){state.activeAssunto=v||'';load().catch(handle)}",
    "function onScopeChange(v){state.scope=v==='global'?'global':'contest';state.activeMateria='';$('pdfLibraryScope').value=state.scope;load().catch(handle)}\nfunction onMateriaFilterChange(v){state.activeMateria=v||'';load().catch(handle)}")
replace_once('public/js/pdf/pdf-library-ui.js',
    "global.PdfStudyLibraryUI=Object.freeze({initialize,refresh:refreshLibrary,getCurrentContest:contest,onTabActivated:activateLibrary,setViewMode:applyLibraryViewMode,onScopeChange,onMateriaFilterChange,onAssuntoFilterChange,onSearch,",
    "global.PdfStudyLibraryUI=Object.freeze({initialize,refresh:refreshLibrary,getCurrentContest:contest,onTabActivated:activateLibrary,setViewMode:applyLibraryViewMode,onScopeChange,onMateriaFilterChange,onSearch,")
replace_once('public/js/pdf/pdf-library-ui.js',
    "  const ids=['pdfLibraryScope','pdfMateriaFilter','pdfAssuntoFilter'];",
    "  const ids=['pdfLibraryScope','pdfMateriaFilter'];")
ui_text = Path('public/js/pdf/pdf-library-ui.js').read_text()
for stale in ['pdfAssuntoFilter', 'activeAssunto', 'onAssuntoFilterChange']:
    if stale in ui_text:
        raise SystemExit(f'pdf-library-ui.js: stale visual filter reference remains: {stale}')

# Inline event dispatch cleanup.
replace_once('public/js/app-ui.js',
    "            'ih-018': function(event) { PdfStudyLibraryUI.onAssuntoFilterChange(this.value) },\n",
    "")

# Ordering — three top actions; Sort ends top row. Selection is no longer part of this row.
p = Path('public/js/pdf/pdf-library-ordering.js')
text = p.read_text().replace('grid-template-columns:repeat(4,minmax(0,1fr))!important', 'grid-template-columns:repeat(3,minmax(0,1fr))!important')
old = "function syncActionButtons(){\n  const selectBtn=$('btnPdfSelectionMode');\n  const addBtn=findActionButton(btn=>(btn.getAttribute('onclick')||'').includes('openUploadModal'));\n  if(!selectBtn||!addBtn)return;\n  addBtn.classList.remove('btn-primary');addBtn.classList.add('btn-secondary');\n  selectBtn.classList.add('pdf-library-action-equal');addBtn.classList.add('pdf-library-action-equal');\n  selectBtn.style.width='100%';selectBtn.style.minWidth='0';addBtn.style.width='100%';addBtn.style.minWidth='0';\n}\nfunction placeSortControl(wrap){\n  const selectBtn=$('btnPdfSelectionMode');\n  const actions=selectBtn?.closest('.pdf-library-actions');\n  if(!actions)return false;\n  wrap.classList.add('pdf-library-sort-control--actions');\n  if(wrap.parentElement!==actions||wrap.nextElementSibling!==selectBtn)actions.insertBefore(wrap,selectBtn);\n  return true;\n}"
new = "function syncActionButtons(){\n  const addBtn=findActionButton(btn=>(btn.getAttribute('onclick')||'').includes('openUploadModal'));\n  if(!addBtn)return;\n  addBtn.classList.remove('btn-primary');addBtn.classList.add('btn-secondary');\n  addBtn.classList.add('pdf-library-action-equal');\n  addBtn.style.width='100%';addBtn.style.minWidth='0';\n}\nfunction placeSortControl(wrap){\n  const actions=document.querySelector('.pdf-library-actions');\n  if(!actions)return false;\n  wrap.classList.add('pdf-library-sort-control--actions');\n  if(wrap.parentElement!==actions||wrap!==actions.lastElementChild)actions.appendChild(wrap);\n  return true;\n}"
if text.count(old) != 1:
    raise SystemExit('pdf-library-ordering.js: old action placement block not found once')
text = text.replace(old, new, 1)
text = text.replace("const anchor=$('pdfLibraryViewToggle')||$('pdfAssuntoFilter')", "const anchor=$('pdfLibraryViewToggle')||$('pdfMateriaFilter')")
p.write_text(text)

# Offline manager — remove configurable app cap and manual pause API.
p = Path('public/js/pdf/pdf-offline-library-manager.js')
text = p.read_text()
text = text.replace("const DEFAULT_LIMIT_MB_MOBILE=2048;\nconst DEFAULT_LIMIT_MB_DESKTOP=5120;\n", "")
text = text.replace("function defaults(){return{mode:'opened',limitMb:isMobile()?DEFAULT_LIMIT_MB_MOBILE:DEFAULT_LIMIT_MB_DESKTOP,wifiOnly:false,updatedAt:Date.now()}}", "function defaults(){return{mode:'opened',wifiOnly:false,updatedAt:Date.now()}}")
text = text.replace("  try{const raw=JSON.parse(localStorage.getItem(settingsKey(u.id))||'null');return{...defaults(),...(raw&&typeof raw==='object'?raw:{})}}catch(_){return defaults()}", "  try{const raw=JSON.parse(localStorage.getItem(settingsKey(u.id))||'null');const legacy=raw&&typeof raw==='object'?{...raw}:{};delete legacy.limitMb;return{...defaults(),...legacy}}catch(_){return defaults()}")
text = text.replace("  const current=await getSettings();const value={...current,...next,mode:MODES.has(next?.mode)?next.mode:current.mode,updatedAt:Date.now()};", "  const current=await getSettings();const value={...current,...next,mode:MODES.has(next?.mode)?next.mode:current.mode,updatedAt:Date.now()};delete value.limitMb;")
text = text.replace("  const configured=Number(s.limitMb)>0?Number(s.limitMb)*1024*1024:Number.POSITIVE_INFINITY;\n  const appBudget=Math.min(safeAvailable||configured,configured);", "  const configured=Number.POSITIVE_INFINITY;\n  const appBudget=quota>0?safeAvailable:Number.POSITIVE_INFINITY;")
text = text.replace("function pause(){if(!running)return false;paused=true;emit('paused',{reason:'Download pausado pelo usuário.'});return true}\nfunction resume(){if(!running||!paused)return false;paused=false;lastError='';emit('resumed',{});return true}\n", "")
text = text.replace("async function setLimitMb(limitMb){const n=Number(limitMb);return saveSettings({limitMb:Number.isFinite(n)&&n>=0?n:0})}\n", "")
text = text.replace("global.PdfOfflineLibraryManager=Object.freeze({getSettings,setMode,setLimitMb,setWifiOnly,start,pause,resume,cancel,syncCurrentPolicy,getStatus,preflight,bytesLabel});", "global.PdfOfflineLibraryManager=Object.freeze({getSettings,setMode,setWifiOnly,start,cancel,syncCurrentPolicy,getStatus,preflight,bytesLabel});")
for stale in ['DEFAULT_LIMIT_MB_', 'function setLimitMb', 'function pause(', 'function resume(', 'Download pausado pelo usuário']:
    if stale in text:
        raise SystemExit(f'pdf-offline-library-manager.js: stale API remains: {stale}')
p.write_text(text)

# Offline UI — remove limit and manual pause; rename primary operation to Enviar.
p = Path('public/js/pdf/pdf-offline-library-ui.js')
text = p.read_text()
text = text.replace('Desktop: quatro filtros ocupam igualmente toda a largura útil da Biblioteca.', 'Desktop: três filtros ocupam igualmente toda a largura útil da Biblioteca.')
text = text.replace(',.pdf-library-filters #pdfAssuntoFilter', '')
text = re.sub(r'\.pdf-offline-limit-wrap\{width:215px\}', '', text)
text = re.sub(r'\.pdf-offline-limit-wrap\{width:190px\}', '', text)
text = text.replace('#pdfOfflineSyncBtn,#pdfOfflinePauseBtn', '#pdfOfflineSyncBtn,#pdfOfflineCancelBtn')
old_markup = '<div class="pdf-offline-controls" aria-label="Controles da Biblioteca Offline"><label class="pdf-offline-limit-wrap"><select id="pdfOfflineLimit" aria-label="Limite de armazenamento local"><option value="1024">Limite: 1 GB</option><option value="2048">Limite: 2 GB</option><option value="5120">Limite: 5 GB</option><option value="10240">Limite: 10 GB</option><option value="0">Sem limite fixo</option></select></label><label class="pdf-offline-wifi"><input id="pdfOfflineWifiOnly" type="checkbox"> Somente Wi-Fi</label><div id="pdfOfflineStorage" class="pdf-offline-storage">Calculando armazenamento…</div><div class="pdf-offline-actions"><button class="btn btn-secondary" id="pdfOfflineSyncBtn" type="button">Preparar agora</button><button class="btn btn-secondary" id="pdfOfflinePauseBtn" type="button">Pausar</button><button class="btn btn-secondary" id="pdfOfflineCancelBtn" type="button">Cancelar fila</button></div></div>'
new_markup = '<div class="pdf-offline-controls" aria-label="Controles da Biblioteca Offline"><label class="pdf-offline-wifi"><input id="pdfOfflineWifiOnly" type="checkbox"> Somente Wi-Fi</label><div id="pdfOfflineStorage" class="pdf-offline-storage">Calculando armazenamento…</div><div class="pdf-offline-actions"><button class="btn btn-secondary primary" id="pdfOfflineSyncBtn" type="button">Enviar</button><button class="btn btn-secondary" id="pdfOfflineCancelBtn" type="button">Cancelar fila</button></div></div>'
if text.count(old_markup) != 1:
    raise SystemExit('pdf-offline-library-ui.js: old controls markup not found once')
text = text.replace(old_markup, new_markup, 1)
text = text.replace("      }else if(target?.id==='pdfOfflineLimit'){\n        await global.PdfOfflineLibraryManager.setLimitMb(Number(target.value));await refresh();\n      }else if(target?.id==='pdfOfflineWifiOnly'){", "      }else if(target?.id==='pdfOfflineWifiOnly'){")
pause_line = "    $('pdfOfflinePauseBtn')?.addEventListener('click',()=>{const s=global.PdfOfflineLibraryManager;const state=$('pdfOfflinePauseBtn')?.dataset.state;if(state==='paused'){s.resume();$('pdfOfflinePauseBtn').dataset.state='';$('pdfOfflinePauseBtn').textContent='Pausar'}else{s.pause();$('pdfOfflinePauseBtn').dataset.state='paused';$('pdfOfflinePauseBtn').textContent='Retomar'}});\n"
text = text.replace(pause_line, '')
text = text.replace("  const limit=$('pdfOfflineLimit');if(limit)limit.value=String(Number(s.limitMb)||0);const wifi=$('pdfOfflineWifiOnly');if(wifi)wifi.checked=!!s.wifiOnly;", "  const wifi=$('pdfOfflineWifiOnly');if(wifi)wifi.checked=!!s.wifiOnly;")
for stale in ['pdfOfflineLimit', 'pdfOfflinePauseBtn', 'setLimitMb', 'pdf-offline-limit-wrap', 'Preparar agora']:
    if stale in text:
        raise SystemExit(f'pdf-offline-library-ui.js: stale removed control remains: {stale}')
p.write_text(text)

# Responsive layout — three actions, three filters and three offline control groups.
p = Path('public/js/pdf/pdf-library-layout-fix.js')
text = p.read_text()
text = text.replace('grid-template-columns:repeat(4,minmax(0,1fr))!important;', 'grid-template-columns:repeat(3,minmax(0,1fr))!important;')
text = text.replace('/* A barra possui quatro filtros. Eles dividem 100% da linha. */', '/* A barra possui três filtros. Eles dividem 100% da linha. */')
text = text.replace(',\n  .pdf-library-filters #pdfAssuntoFilter', '')
text = text.replace('    grid-template-columns:minmax(170px,210px) max-content minmax(220px,1fr) auto!important;', '    grid-template-columns:max-content minmax(220px,1fr) auto!important;')
text = re.sub(r'\n  #pdfOfflineManager \.pdf-offline-limit-wrap\{[^\n]*\}', '', text)
selection_css = """
  .pdf-library-selection-row {
    display:flex!important;
    justify-content:flex-end!important;
    align-items:center!important;
    width:100%!important;
    margin:2px 0 8px!important;
  }
  .pdf-library-selection-row #btnPdfSelectionMode {
    min-width:138px!important;
    min-height:44px!important;
  }
"""
marker = '  #pdfOfflineManager {\n    grid-column:1/-1!important;'
if text.count(marker) != 1:
    raise SystemExit('pdf-library-layout-fix.js: desktop selection CSS anchor missing')
text = text.replace(marker, selection_css + '\n' + marker, 1)
mobile_marker = '  #pdfOfflineManager{width:100%!important;max-width:none!important;}'
mobile_selection = """  .pdf-library-selection-row{display:flex!important;justify-content:flex-end!important;width:100%!important;margin:2px 0 8px!important;}
  .pdf-library-selection-row #btnPdfSelectionMode{min-width:132px!important;min-height:44px!important;}
"""
if text.count(mobile_marker) != 1:
    raise SystemExit('pdf-library-layout-fix.js: mobile selection CSS anchor missing')
text = text.replace(mobile_marker, mobile_selection + mobile_marker, 1)
for stale in ['#pdfAssuntoFilter', 'pdf-offline-limit-wrap']:
    if stale in text:
        raise SystemExit(f'pdf-library-layout-fix.js: stale selector remains: {stale}')
p.write_text(text)

# Update existing regression contracts.
Path('tests/library-action-alignment.test.cjs').write_text("""const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const ordering = fs.readFileSync(path.join(root, 'public/js/pdf/pdf-library-ordering.js'), 'utf8');
const offlineUi = fs.readFileSync(path.join(root, 'public/js/pdf/pdf-offline-library-ui.js'), 'utf8');
test('Ordenar encerra a barra superior de três ações', () => { assert.match(ordering, /actions\\.appendChild\\(wrap\\)/); assert.match(ordering, /pdf-library-sort-control--actions/); });
test('ações da Biblioteca usam três colunas iguais', () => { assert.match(ordering, /grid-template-columns:repeat\\(3,minmax\\(0,1fr\\)\\)!important/); assert.match(ordering, /addBtn\\.style\\.width='100%'/); });
test('filtros restantes distribuem igualmente a largura', () => { assert.match(offlineUi, /\\.pdf-library-filters>\\*\\{flex:1 1 0!important/); assert.doesNotMatch(offlineUi, /pdfAssuntoFilter/); });
test('Enviar e Cancelar fila permanecem sem Pausar', () => { assert.match(offlineUi, /id=\"pdfOfflineSyncBtn\"[^>]*>Enviar<\\/button>/); assert.match(offlineUi, /id=\"pdfOfflineCancelBtn\"/); assert.doesNotMatch(offlineUi, /pdfOfflinePauseBtn/); });
""")

Path('tests/library-desktop-single-row-layout.test.cjs').write_text("""const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const layout=fs.readFileSync(path.join(__dirname,'..','public','js','pdf','pdf-library-layout-fix.js'),'utf8');
const adapter=fs.readFileSync(path.join(__dirname,'..','public','js','pdf','pdf-library-opfs-adapter.js'),'utf8');
test('painel offline fica fora da barra de filtros',()=>{assert.match(layout,/filters\\.insertAdjacentElement\\('afterend', panel\\)/)});
test('desktop usa três ações e três filtros harmônicos',()=>{assert.match(layout,/grid-template-columns:repeat\\(3,minmax\\(0,1fr\\)\\)!important/);assert.doesNotMatch(layout,/pdfAssuntoFilter/)});
test('controles offline restantes ficam em uma linha',()=>{assert.match(layout,/grid-template-columns:max-content minmax\\(220px,1fr\\) auto!important/)});
test('Selecionar possui linha própria junto à grade',()=>{assert.match(layout,/pdf-library-selection-row/);assert.match(layout,/btnPdfSelectionMode/)});
test('tablet e mobile preservam rolagem e alvos de toque',()=>{assert.match(layout,/@media \\(max-width:1100px\\)/);assert.match(layout,/overflow-x:auto!important/)});
test('adapter carrega a correção de layout',()=>{assert.match(adapter,/pdf-library-layout-fix\\.js/);assert.match(adapter,/ui\\.onload = loadLayoutFix/)});
""")

Path('tests/library-toolbar-cleanup.test.cjs').write_text("""// Regression contract for the simplified Biblioteca toolbar.
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..');
const index=fs.readFileSync(path.join(root,'public/index.html'),'utf8');const ui=fs.readFileSync(path.join(root,'public/js/pdf/pdf-library-ui.js'),'utf8');const appUi=fs.readFileSync(path.join(root,'public/js/app-ui.js'),'utf8');const ordering=fs.readFileSync(path.join(root,'public/js/pdf/pdf-library-ordering.js'),'utf8');const layout=fs.readFileSync(path.join(root,'public/js/pdf/pdf-library-layout-fix.js'),'utf8');
test('controles Workspace continuam ausentes do cabeçalho',()=>{assert.doesNotMatch(index,/id=\"pdfLibraryContestName\"/);assert.doesNotMatch(index,/id=\"pdfWorkspaceFilter\"/)});
test('filtro visual de Assunto foi removido sem afetar upload e vínculo',()=>{assert.doesNotMatch(index,/id=\"pdfAssuntoFilter\"/);assert.doesNotMatch(ui,/onAssuntoFilterChange/);assert.doesNotMatch(appUi,/onAssuntoFilterChange/);assert.match(ui,/pdfUploadAssunto/);assert.match(ui,/pdfLinkAssunto/)});
test('barra de ações e filtros usam três posições',()=>{assert.match(ordering,/repeat\\(3,minmax\\(0,1fr\\)\\)/);assert.match(layout,/repeat\\(3,minmax\\(0,1fr\\)\\)/)});
test('Selecionar saiu do cabeçalho e ficou junto da grade',()=>{const filters=index.indexOf('class=\"pdf-library-filters\"');const select=index.indexOf('id=\"btnPdfSelectionMode\"');const grid=index.indexOf('id=\"pdfLibraryGrid\"');assert.ok(filters>=0&&select>filters&&grid>select);assert.match(ordering,/actions\\.appendChild\\(wrap\\)/)});
""")

Path('tests/pdf-library-single-row-layout.test.cjs').write_text("""const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','public','js','pdf','pdf-offline-library-ui.js'),'utf8');
test('três filtros dividem igualmente o desktop',()=>{assert.match(source,/pdfLibrarySearch,.pdf-library-filters #pdfLibraryScope,.pdf-library-filters #pdfMateriaFilter/);assert.doesNotMatch(source,/pdfAssuntoFilter/)});
test('offline remove limite e pausa e mantém Enviar e Cancelar',()=>{assert.match(source,/id=\"pdfOfflineWifiOnly\"/);assert.match(source,/id=\"pdfOfflineSyncBtn\"[^>]*>Enviar<\\/button>/);assert.match(source,/id=\"pdfOfflineCancelBtn\"/);assert.doesNotMatch(source,/pdfOfflineLimit/);assert.doesNotMatch(source,/pdfOfflinePauseBtn/)});
test('mobile mantém alvos de toque e rolagem',()=>{assert.match(source,/@media\\(max-width:700px\\)/);assert.match(source,/overflow-x:auto/)});
""")

# Semantic release identity.
for path in ['package.json', 'config/app-assets.json', 'public/version.json', 'src/index.js', 'public/sw.js', 'public/js/app-pwa.js']:
    replace_all(path, '10.59.0', '10.60.0')

print('Library controls v10.60.0 applied successfully.')

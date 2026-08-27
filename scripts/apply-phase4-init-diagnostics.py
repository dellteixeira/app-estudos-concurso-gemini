from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_once(content, old, new, label):
    count = content.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 trecho, encontrado {count}')
    return content.replace(old, new, 1)


# UI: bounded/event-driven bootstrap + explicit diagnostics.
ui_path = 'public/js/pdf/pdf-offline-library-ui.js'
ui = read(ui_path)
ui = replace_once(
    ui,
    "let currentMode='opened';\nlet lastRender=0;",
    "let currentMode='opened';\nlet lastRender=0;\nlet bootAttempts=0;\nlet bootTimer=null;\nconst BOOT_RETRY_MS=100;\nconst BOOT_MAX_ATTEMPTS=50;",
    'ui bootstrap state'
)
ui = replace_once(
    ui,
    "async function mount(){\n  if(!global.PdfOfflineLibraryManager)return;\n  css();",
    "function reportError(context,error,{status=true}={}){\n  const message=error?.message||String(error||'Falha desconhecida.');\n  global.console?.error?.(`[pdf-offline-ui] ${context}: ${message}`,error||'');\n  if(status)setStatus(message,'error');\n  return message;\n}\nfunction renderInitDiagnostic(message){\n  css();\n  let el=$('pdfOfflineInitDiagnostic');\n  if(!el){\n    el=document.createElement('div');el.id='pdfOfflineInitDiagnostic';el.className='pdf-offline-status';el.setAttribute('role','status');\n    const a=anchor();if(a?.parentElement)a.insertAdjacentElement('afterend',el);else $('pdfLibraryGrid')?.before(el);\n  }\n  el.textContent=message;el.dataset.kind='error';\n}\nasync function mount(){\n  if(!global.PdfOfflineLibraryManager)throw new Error('Gerenciador da Biblioteca Offline indisponível.');\n  $('pdfOfflineInitDiagnostic')?.remove();\n  css();",
    'ui diagnostics and mount guard'
)
ui = replace_once(
    ui,
    "  const data=await global.PdfOfflineLibraryManager.getStatus().catch(()=>null);if(!data)return;",
    "  let data;\n  try{data=await global.PdfOfflineLibraryManager.getStatus()}catch(error){reportError('Falha ao atualizar o estado offline',error);return}\n  if(!data)return;",
    'ui refresh diagnostic'
)
ui = replace_once(
    ui,
    "  if(d.type==='blocked'||d.type==='error')setStatus(d.reason||d.error||state.lastError,'error');",
    "  if(d.type==='blocked'||d.type==='error'||d.type==='resume-error')setStatus(d.reason||d.error||state.lastError,'error');\n  else if(d.type==='warning')setStatus(d.reason||'A Biblioteca Offline encontrou uma limitação local.','warning');",
    'ui event diagnostics'
)
ui = replace_once(
    ui,
    "  if(Date.now()-lastRender>400)refresh().catch(()=>{});\n});\nfunction boot(){if(global.PdfOfflineLibraryManager)mount().catch(()=>{});else setTimeout(boot,100)}\nif(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();\ndocument.addEventListener('click',event=>{const b=event.target.closest('button');if((b?.getAttribute('onclick')||'').includes(\"switchTab('tab-biblioteca'\"))setTimeout(()=>mount().catch(()=>{}),80)});",
    "  if(Date.now()-lastRender>400)refresh().catch(error=>reportError('Falha ao reconciliar evento offline',error,{status:false}));\n});\nfunction clearBootTimer(){if(bootTimer){clearTimeout(bootTimer);bootTimer=null}}\nfunction boot(){\n  if(global.PdfOfflineLibraryManager){\n    clearBootTimer();bootAttempts=0;\n    mount().catch(error=>reportError('Falha ao inicializar a Biblioteca Offline',error));\n    return;\n  }\n  bootAttempts++;\n  if(bootAttempts>=BOOT_MAX_ATTEMPTS){\n    clearBootTimer();\n    const message='Biblioteca Offline indisponível: o gerenciador não foi carregado. Recarregue a página ou verifique a conexão.';\n    reportError('Tempo limite de inicialização',new Error(message),{status:false});\n    renderInitDiagnostic(message);\n    return;\n  }\n  clearBootTimer();bootTimer=setTimeout(boot,BOOT_RETRY_MS);\n}\nglobal.addEventListener('pdf-offline-library-manager-ready',()=>{clearBootTimer();bootAttempts=0;boot()},{once:true});\nif(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();\ndocument.addEventListener('click',event=>{const b=event.target.closest('button');if((b?.getAttribute('onclick')||'').includes(\"switchTab('tab-biblioteca'\"))setTimeout(()=>mount().catch(error=>reportError('Falha ao abrir a Biblioteca Offline',error)),80)});",
    'ui bounded bootstrap'
)
write(ui_path, ui)

# Manager: replace silent fallbacks with observable diagnostics and readiness signal.
manager_path = 'public/js/pdf/pdf-offline-library-manager.js'
manager = read(manager_path)
manager = replace_once(
    manager,
    "let running=false,paused=false,cancelled=false,queue=[],completed=0,failed=0,current=null,lastError='';",
    "let running=false,paused=false,cancelled=false,queue=[],completed=0,failed=0,current=null,lastError='';\n\nfunction diagnostic(scope,error,level='warn'){\n  const message=error?.message||String(error||'Falha desconhecida.');\n  const logger=level==='error'?'error':'warn';\n  global.console?.[logger]?.(`[pdf-offline] ${scope}: ${message}`,error||'');\n  return message;\n}",
    'manager diagnostic helper'
)
manager = replace_once(
    manager,
    "  try{const raw=JSON.parse(localStorage.getItem(settingsKey(u.id))||'null');const legacy=raw&&typeof raw==='object'?{...raw}:{};delete legacy.limitMb;return{...defaults(),...legacy}}catch(_){return defaults()}",
    "  try{const raw=JSON.parse(localStorage.getItem(settingsKey(u.id))||'null');const legacy=raw&&typeof raw==='object'?{...raw}:{};delete legacy.limitMb;return{...defaults(),...legacy}}catch(error){diagnostic('Configuração local inválida; usando padrão',error);return defaults()}",
    'manager getSettings diagnostic'
)
manager = replace_once(
    manager,
    "  try{localStorage.setItem(settingsKey(u.id),JSON.stringify(value))}catch(_){}\n  emit('settings',value);return value;",
    "  try{localStorage.setItem(settingsKey(u.id),JSON.stringify(value))}catch(error){const reason='Não foi possível salvar as preferências offline neste navegador.';diagnostic('Persistência de configurações',error);emit('warning',{reason})}\n  emit('settings',value);return value;",
    'manager saveSettings diagnostic'
)
manager = replace_once(
    manager,
    "function emit(type,detail={}){try{global.dispatchEvent(new CustomEvent('pdf-offline-library',{detail:{type,...detail,state:getStateSync()}}))}catch(_){} }",
    "function emit(type,detail={}){try{global.dispatchEvent(new CustomEvent('pdf-offline-library',{detail:{type,...detail,state:getStateSync()}}))}catch(error){diagnostic(`Falha ao publicar evento ${type}`,error)} }",
    'manager emit diagnostic'
)
manager = replace_once(
    manager,
    "  }catch(_){}\n  return false;\n}\nasync function buildQueue(mode){",
    "  }catch(error){diagnostic(`Falha ao verificar cópia offline de ${doc?.id||'PDF'}`,error)}\n  return false;\n}\nasync function buildQueue(mode){",
    'manager hasOfflineCopy diagnostic'
)
manager = replace_once(
    manager,
    "  }catch(_){}\n  return{supported:false,persisted:false};\n}\nasync function persistOfflineBlob",
    "  }catch(error){diagnostic('Falha ao solicitar persistência de armazenamento',error)}\n  return{supported:false,persisted:false};\n}\nasync function persistOfflineBlob",
    'manager persistence diagnostic'
)
manager = replace_once(
    manager,
    "global.addEventListener('online',()=>{getSettings().then(s=>{if(s.mode!=='opened'&&!running)setTimeout(()=>syncCurrentPolicy().catch(()=>{}),1200)})});\n\nglobal.PdfOfflineLibraryManager=Object.freeze({getSettings,setMode,setWifiOnly,start,cancel,syncCurrentPolicy,getStatus,preflight,bytesLabel,connectionStatus});",
    "global.addEventListener('online',()=>{getSettings().then(s=>{if(s.mode!=='opened'&&!running)setTimeout(()=>syncCurrentPolicy().catch(error=>{const reason=error?.message||'Falha ao retomar a Biblioteca Offline após reconexão.';diagnostic('Retomada após reconexão',error,'error');emit('resume-error',{reason})}),1200)}).catch(error=>{const reason=error?.message||'Falha ao ler a política offline após reconexão.';diagnostic('Leitura da política após reconexão',error,'error');emit('resume-error',{reason})})});\n\nglobal.PdfOfflineLibraryManager=Object.freeze({getSettings,setMode,setWifiOnly,start,cancel,syncCurrentPolicy,getStatus,preflight,bytesLabel,connectionStatus});\ntry{global.dispatchEvent(new CustomEvent('pdf-offline-library-manager-ready'))}catch(error){diagnostic('Falha ao anunciar inicialização do gerenciador',error)}",
    'manager online diagnostic and ready signal'
)
write(manager_path, manager)

# Structural regression test.
test_path = ROOT / 'tests/offline-pdf-library-init-diagnostics-v10.64.test.cjs'
test_path.write_text("""const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'public/js/pdf/pdf-offline-library-ui.js'), 'utf8');
const manager = fs.readFileSync(path.join(root, 'public/js/pdf/pdf-offline-library-manager.js'), 'utf8');

test('Biblioteca Offline encerra bootstrap quando o manager não chega', () => {
  assert.match(ui, /const BOOT_MAX_ATTEMPTS=50;/);
  assert.match(ui, /bootAttempts>=BOOT_MAX_ATTEMPTS/);
  assert.match(ui, /clearBootTimer\(\)/);
  assert.doesNotMatch(ui, /else setTimeout\(boot,100\)/);
  assert.match(ui, /Biblioteca Offline indisponível: o gerenciador não foi carregado/);
});

test('inicialização usa sinal de prontidão e não engole falhas críticas', () => {
  assert.match(manager, /pdf-offline-library-manager-ready/);
  assert.match(ui, /pdf-offline-library-manager-ready/);
  assert.match(ui, /function reportError\(/);
  assert.doesNotMatch(ui, /getStatus\(\)\.catch\(\(\)=>null\)/);
  assert.doesNotMatch(ui, /mount\(\)\.catch\(\(\)=>\{\}\)/);
  assert.doesNotMatch(manager, /syncCurrentPolicy\(\)\.catch\(\(\)=>\{\}\)/);
  assert.match(manager, /emit\('resume-error'/);
  assert.match(manager, /emit\('warning'/);
});
""", encoding='utf-8')

# Canonical runtime identity.
for path in [
    'package.json',
    'public/version.json',
    'config/app-assets.json',
    'public/sw.js',
    'src/index.js',
]:
    content = read(path)
    if '10.64.2' not in content:
        raise SystemExit(f'{path}: versão 10.64.2 não encontrada')
    write(path, content.replace('10.64.2', '10.64.3'))

# Remove temporary delivery machinery from the final functional commit.
for temporary in [
    ROOT / 'scripts/apply-phase4-init-diagnostics.py',
    ROOT / '.github/workflows/temp-phase4-init-diagnostics.yml',
]:
    if temporary.exists():
        temporary.unlink()

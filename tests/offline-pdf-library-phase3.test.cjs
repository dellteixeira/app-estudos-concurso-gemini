const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const manager = fs.readFileSync('public/js/pdf/pdf-offline-library-manager.js','utf8');
const ui = fs.readFileSync('public/js/pdf/pdf-offline-library-ui.js','utf8');
const adapter = fs.readFileSync('public/js/pdf/pdf-library-opfs-adapter.js','utf8');

test('fase 3 oferece exatamente os três modos gerenciados em um botão cíclico',()=>{
  assert.match(manager,/\['opened','favorites','all'\]/);
  assert.match(ui,/const modeOrder=\['opened','favorites','all'\]/);
  assert.match(ui,/id="pdfOfflineModeBtn"/);
  assert.match(ui,/function nextMode\(mode\)/);
  assert.match(ui,/function cycleMode\(\)/);
  assert.match(ui,/Apenas PDFs que eu abrir/);
  assert.match(ui,/PDFs favoritos/);
  assert.match(ui,/Biblioteca inteira/);
  assert.doesNotMatch(ui,/name="pdfOfflineMode"/);
  assert.doesNotMatch(ui,/pdf-offline-options/);
  assert.doesNotMatch(ui,/pdf-offline-option/);
});

test('mobile usa concorrência unitária e armazenamento sem limite artificial do app',()=>{
  assert.match(manager,/const concurrency=isMobile\(\)\?1:2/);
  assert.doesNotMatch(manager,/DEFAULT_LIMIT_MB_(?:MOBILE|DESKTOP)/);
  assert.match(manager,/const configured=Number\.POSITIVE_INFINITY/);
  assert.match(manager,/FREE_RESERVE_RATIO=0\.20/);
  assert.match(manager,/MIN_FREE_RESERVE_BYTES=256\*1024\*1024/);
});

test('modo opened não inicia download em massa',()=>{
  assert.match(manager,/if\(mode==='opened'\)\{cancel\(\)/);
  assert.match(manager,/if\(mode==='opened'\)return\[\]/);
});

test('downloads passam pela API integrada da biblioteca',()=>{
  assert.match(manager,/PdfStudyLibrary\.downloadBlob\(doc\)/);
  assert.match(manager,/PdfStudyLibrary\.hasOfflineCopy/);
});

test('adapter carrega manager e interface somente depois da integração OPFS',()=>{
  assert.match(adapter,/pdf-offline-library-manager\.js/);
  assert.match(adapter,/pdf-offline-library-ui\.js/);
  assert.match(adapter,/manager\.onload/);
});

test('toolbar offline mantém todos os controles em uma única linha horizontal',()=>{
  assert.match(ui,/\.pdf-offline-controls\{display:grid!important;grid-template-columns:/);
  assert.match(ui,/grid-auto-flow:column!important/);
  assert.match(ui,/id="pdfOfflineModeBtn"[\s\S]*id="pdfOfflineWifiOnly"[\s\S]*id="pdfOfflineStorage"[\s\S]*id="btnPdfSelectionMode"[\s\S]*id="pdfOfflineSyncBtn"[\s\S]*id="pdfOfflineCancelBtn"/);
  assert.match(ui,/@media\(max-width:1200px\)/);
  assert.match(ui,/overflow-x:auto/);
  assert.match(ui,/white-space:nowrap!important/);
  assert.match(ui,/min-height:44px/);
  assert.match(ui,/max-width:100%;box-sizing:border-box;overflow-x:auto/);
  assert.doesNotMatch(ui,/min-width:1128px/);
  assert.doesNotMatch(ui,/min-width:1054px/);
  assert.doesNotMatch(ui,/pdf-offline-actions/);
  assert.doesNotMatch(ui,/flex-wrap:wrap/);
});

test('Somente Wi-Fi distingue detecção suportada de navegador sem Network Information API',()=>{
  assert.match(manager,/function connectionStatus\(settings\)/);
  assert.match(manager,/supported:false/);
  assert.match(manager,/não permite confirmar automaticamente se a conexão atual é Wi-Fi/);
  assert.match(manager,/connection:connectionStatus\(settings\)/);
  assert.match(manager,/wifi-detection-unavailable/);
  assert.match(ui,/data\.connection\?\.supported===false/);
  assert.match(ui,/Detecção automática de Wi-Fi indisponível neste navegador/);
});

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

test('toolbar offline mantém modo, Wi-Fi, armazenamento e ações na mesma linha',()=>{
  assert.match(ui,/\.pdf-offline-controls\{display:flex;flex-wrap:nowrap/);
  assert.match(ui,/id="pdfOfflineModeBtn"[\s\S]*id="pdfOfflineWifiOnly"[\s\S]*id="pdfOfflineStorage"[\s\S]*id="btnPdfSelectionMode"[\s\S]*id="pdfOfflineSyncBtn"[\s\S]*id="pdfOfflineCancelBtn"/);
  assert.match(ui,/@media\(max-width:700px\)/);
  assert.match(ui,/overflow-x:auto/);
  assert.match(ui,/min-height:44px/);
  assert.doesNotMatch(ui,/pdf-offline-actions/);
});
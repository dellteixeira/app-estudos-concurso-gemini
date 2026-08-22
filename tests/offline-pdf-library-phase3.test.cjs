const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const manager = fs.readFileSync('public/js/pdf/pdf-offline-library-manager.js','utf8');
const ui = fs.readFileSync('public/js/pdf/pdf-offline-library-ui.js','utf8');
const adapter = fs.readFileSync('public/js/pdf/pdf-library-opfs-adapter.js','utf8');

test('fase 3 oferece exatamente os três modos gerenciados',()=>{
  assert.match(manager,/\['opened','favorites','all'\]/);
  assert.match(ui,/Apenas PDFs que eu abrir/);
  assert.match(ui,/PDFs favoritos/);
  assert.match(ui,/Biblioteca inteira/);
});

test('mobile usa concorrência unitária e limite conservador',()=>{
  assert.match(manager,/const concurrency=isMobile\(\)\?1:2/);
  assert.match(manager,/DEFAULT_LIMIT_MB_MOBILE=2048/);
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

test('interface mobile usa controles empilhados e alvos de toque amplos',()=>{
  assert.match(ui,/@media\(max-width:700px\)/);
  assert.match(ui,/min-height:44px/);
  assert.match(ui,/grid-template-columns:1fr/);
});

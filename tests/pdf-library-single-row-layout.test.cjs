const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','public','js','pdf','pdf-offline-library-ui.js'),'utf8');
test('três filtros dividem igualmente o desktop',()=>{assert.match(source,/pdfLibrarySearch,.pdf-library-filters #pdfLibraryScope,.pdf-library-filters #pdfMateriaFilter/);assert.doesNotMatch(source,/pdfAssuntoFilter/)});
test('offline remove limite e pausa e mantém Enviar e Cancelar',()=>{assert.match(source,/id="pdfOfflineWifiOnly"/);assert.match(source,/id="pdfOfflineSyncBtn"[^>]*>Enviar<\/button>/);assert.match(source,/id="pdfOfflineCancelBtn"/);assert.doesNotMatch(source,/pdfOfflineLimit/);assert.doesNotMatch(source,/pdfOfflinePauseBtn/)});
test('mobile mantém alvos de toque e rolagem',()=>{assert.match(source,/@media\(max-width:700px\)/);assert.match(source,/overflow-x:auto/)});

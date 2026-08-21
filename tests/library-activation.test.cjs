const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');

test('Biblioteca usa somente o hook oficial de ativação da guia',()=>{
  const ui=read('public/js/pdf/pdf-library-ui.js');
  assert.match(ui,/onTabActivated:activateLibrary/);
  assert.match(ui,/activationPromise=initialize\(false\)/);
  assert.doesNotMatch(ui,/window\.PdfStudyLibraryUI\?\.onTabActivated\?\.\(\)/);
  assert.doesNotMatch(ui,/scheduleLibraryActivationRefresh/);
  assert.doesNotMatch(ui,/initialize\(true\)\.catch\(handle\)/);
});

test('reabrir Biblioteca no mesmo concurso preserva filtros e apenas recarrega documentos',()=>{
  const ui=read('public/js/pdf/pdf-library-ui.js');
  assert.match(ui,/const sameContext=state\.initializedFor===cc;/);
  assert.match(ui,/if\(sameContext\)\{await load\(\);return;\}/);
  assert.doesNotMatch(ui,/if\(!force&&state\.initializedFor===cc\)/);
});

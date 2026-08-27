const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = path => fs.readFileSync(path, 'utf8');

test('Biblioteca atualiza automaticamente ao ativar a guia e não expõe botão manual', () => {
  const index = read('public/index.html');
  const navigation = read('public/js/app-ai.js');
  const library = read('public/js/pdf/pdf-library-ui.js');

  assert.doesNotMatch(index, /PdfStudyLibraryUI\.refresh/);
  assert.doesNotMatch(index, />\s*↻\s*Atualizar\s*</);
  assert.match(navigation, /tabId === 'tab-biblioteca'/);
  assert.match(navigation, /PdfStudyLibraryUI\?\.onTabActivated\?\.\(\)/);
  assert.match(library, /onTabActivated:activateLibrary/);
  assert.doesNotMatch(library, /refresh:refreshLibrary/);
  assert.doesNotMatch(library, /function refreshLibrary/);
});

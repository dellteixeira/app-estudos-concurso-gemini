const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const core=fs.readFileSync('public/js/app-core.js','utf8');
const ai=fs.readFileSync('public/js/app-ai.js','utf8');
const ui=fs.readFileSync('public/js/app-ui.js','utf8');
const nav=fs.readFileSync('public/js/ui/navigation.js','utf8');
const loader=fs.readFileSync('public/js/core/asset-loader.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

test('Biblioteca foi removida integralmente da interface principal',()=>{
  assert.doesNotMatch(html,/tab-biblioteca|>Biblioteca<|pdfLibrary|pdfReaderOverlay|modalPdfWorkspace|modalPdfUpload|modalPdfLink|modalPdfNoteEditor/);
  assert.equal(fs.existsSync('public/css/pdf-library.css'),false);
  assert.equal(fs.existsSync('public/css/pdf-reader.css'),false);
  assert.equal(fs.existsSync('public/js/pdf'),false);
});

test('navegacao principal preserva somente as quatro areas suportadas',()=>{
  const tabs=[...html.matchAll(/class="tab-btn(?: active)?"[^>]*data-tab="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(tabs,['tab-edital','tab-calendario','tab-flashcards','tab-anotacoes']);
  for(const id of tabs) assert.match(html,new RegExp(`id="${id}" class="tab-content`));
});

test('switchTab pertence ao nucleo critico e nao ao runtime lazy',()=>{
  assert.match(core,/function switchTab\(tabId, btn, options = \{\}\)/);
  assert.match(core,/window\.switchTab = switchTab/);
  assert.doesNotMatch(ai,/function switchTab\(/);
  assert.doesNotMatch(nav,/ensurePdfLibraryRuntime|PdfStudyLibraryUI|tab-biblioteca/);
});

test('handlers e loader nao referenciam Biblioteca ou leitor removidos',()=>{
  for(const source of [ui,nav,loader,sw]){
    assert.doesNotMatch(source,/PdfStudyLibrary|PdfStudyReader|tab-biblioteca|js\/pdf\/|pdf-library\.css|pdf-reader\.css/);
  }
});

test('cronograma flashcards e anotacoes continuam navegaveis',()=>{
  assert.match(core,/tabId === 'tab-calendario'/);
  assert.match(core,/renderMonthCalendar\(\)/);
  assert.match(core,/TAB_WORKSPACE_TARGETS/);
  assert.match(core,/'tab-flashcards': 'flashcardsWorkspace'/);
  assert.match(core,/'tab-anotacoes': 'notesWorkspace'/);
});

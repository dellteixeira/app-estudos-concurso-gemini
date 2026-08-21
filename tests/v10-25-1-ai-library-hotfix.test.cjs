const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const worker=fs.readFileSync('src/index.js','utf8');
const reader=fs.readFileSync('public/js/pdf/pdf-reader.js','utf8');
const library=fs.readFileSync('public/js/pdf/pdf-library-ui.js','utf8');

test('IA de flashcard tem caminho rápido e limites rígidos de latência',()=>{
  assert.ok(worker.includes('gemini-2.5-flash-lite'));
  assert.ok(worker.includes('const FLASHCARD_AUTO_CHAIN = ["gemini", "llama"]'));
  assert.ok(worker.includes('controller.abort(), 4000'));
  assert.ok(worker.includes('2500, model.label'));
  assert.ok(reader.includes('controller.abort(),7500'));
  assert.ok(reader.includes('.slice(0,5000)'));
});

test('Biblioteca abre no escopo global sem filtros antigos',()=>{
  assert.ok(library.includes('function resetLibraryToGlobalView()'));
  assert.ok(library.includes("state.scope='global'"));
  assert.ok(library.includes("state.activeWorkspace=''"));
  assert.ok(library.includes('resetLibraryToGlobalView();'));
});

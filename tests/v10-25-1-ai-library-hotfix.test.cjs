const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const worker=fs.readFileSync('src/index.js','utf8');
const reader=fs.readFileSync('public/js/pdf/pdf-reader.js','utf8');
const library=fs.readFileSync('public/js/pdf/pdf-library-ui.js','utf8');

test('IA de flashcard tem caminho rápido e limites rígidos de latência',()=>{
  assert.ok(worker.includes('gemini-3.6-flash'));
  assert.ok(worker.includes('const FLASHCARD_AUTO_CHAIN = ["gemini", "llama"]'));
  assert.ok(worker.includes('controller.abort(), GEMINI_FLASHCARD_TIMEOUT_MS'));
  assert.ok(worker.includes('WORKERS_FLASHCARD_TIMEOUT_MS, model.label'));
  assert.ok(reader.includes('controller.abort(),25000'));
  assert.ok(reader.includes('.slice(0,5000)'));
});

test('Biblioteca abre no escopo global sem filtros antigos',()=>{
  assert.ok(library.includes('function resetLibraryToGlobalView()'));
  assert.ok(library.includes("state.scope='global'"));
  assert.ok(library.includes("state.activeWorkspace=''"));
  assert.ok(library.includes('resetLibraryToGlobalView();'));
});

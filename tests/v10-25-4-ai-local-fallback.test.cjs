const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const worker=fs.readFileSync('src/index.js','utf8');
const reader=fs.readFileSync('public/js/pdf/pdf-reader.js','utf8');

test('v10.25.4 usa Gemini 3.6 Flash',()=>{
  assert.ok(worker.includes('gemini-3.6-flash'));
  assert.ok(!worker.includes('gemini-2.5-flash'));
  assert.ok(reader.includes('Gemini 3.6 Flash'));
});

test('modelo manual continua protegido por fallback',()=>{
  assert.ok(worker.includes('function flashcardCandidateChain(requested)'));
  assert.ok(worker.includes('[requested, "llama"]'));
});

test('falha das IAs usa gerador local determinístico',()=>{
  assert.ok(worker.includes('function buildDeterministicFlashcard'));
  assert.ok(worker.includes('provider: "local-deterministic"'));
  assert.ok(worker.includes('model: "Gerador local · sem IA"'));
  assert.ok(reader.includes("result.provider==='local-deterministic'"));
});

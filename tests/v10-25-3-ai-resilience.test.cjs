const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const worker=fs.readFileSync('src/index.js','utf8');
const reader=fs.readFileSync('public/js/pdf/pdf-reader.js','utf8');

test('v10.25.4 registra causa real e amplia timeouts da cadeia de IA',()=>{
  assert.ok(worker.includes('const GEMINI_FLASHCARD_TIMEOUT_MS = 12000'));
  assert.ok(worker.includes('const WORKERS_FLASHCARD_TIMEOUT_MS = 8000'));
  assert.ok(worker.includes('provider=${provider} model=${model.id} status=${status} reason=${reason} duration=${durationMs}ms'));
  assert.ok(worker.includes('httpError.status = response.status'));
  assert.ok(worker.includes('timeoutError.status = \"timeout\"') || worker.includes('timeoutError.status = "timeout"'));
});

test('v10.25.4 informa ao usuário quando Gemini ou fallback respondeu',()=>{
  assert.ok(reader.includes('controller.abort(),25000'));
  assert.ok(reader.includes('✅ Gerado por'));
  assert.ok(reader.includes('⚠️ Modelo preferido indisponível — gerado por'));
  assert.ok(worker.includes('provider, modelKey: key, fallbackUsed'));
});

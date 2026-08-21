const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const worker=fs.readFileSync('src/index.js','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const version=JSON.parse(fs.readFileSync('public/version.json','utf8'));

test('v10.25.5 inicia fallback antecipado sem reduzir o teto do Gemini',()=>{
  assert.ok(worker.includes('const FLASHCARD_HEDGE_DELAY_MS = 4500'));
  assert.ok(worker.includes('const GEMINI_FLASHCARD_TIMEOUT_MS = 12000'));
  assert.ok(worker.includes('runFlashcardProvidersHedged'));
  assert.ok(worker.includes('timer = setTimeout(startFallback, FLASHCARD_HEDGE_DELAY_MS)'));
  assert.ok(worker.includes('startFallback();'));
});

test('v10.25.5 registra sucesso falha e seleção com latência por provedor',()=>{
  assert.ok(worker.includes('Flashcard AI success provider='));
  assert.ok(worker.includes('Flashcard AI failure provider='));
  assert.ok(worker.includes('Flashcard AI selected provider='));
  assert.ok(worker.includes('duration=${durationMs}ms hedged=${hedged}'));
  assert.ok(worker.includes('latencyMs: result.durationMs'));
  assert.ok(worker.includes('provider=local-deterministic model=local'));
});

test('v10.25.5 preserva fallback determinístico e versionamento',()=>{
  assert.ok(worker.includes('buildDeterministicFlashcard'));
  assert.ok(worker.includes('fallbackUsed: true, deterministic: true'));
  assert.equal(pkg.version,'10.25.5');
  assert.equal(version.version,'10.25.5');
});

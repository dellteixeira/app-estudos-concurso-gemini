const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const worker=fs.readFileSync('src/index.js','utf8');

test('v10.25.7 increases Gemini output budget',()=>{
  assert.match(worker,/maxOutputTokens: compactRetry \? 900 : 1600/);
  assert.match(worker,/const APP_VERSION = \"10\.25\.7\"/);
});

test('v10.25.7 retries Gemini once when MAX_TOKENS truncates JSON',()=>{
  assert.match(worker,/compactRetry = false/);
  assert.match(worker,/summary\.finishReasons\.split\('\,'\)\.includes\('MAX_TOKENS'\)/);
  assert.match(worker,/runGeminiFlashcard\(env, model, systemPrompt, userPrompt, \{ compactRetry: true \}\)/);
  assert.match(worker,/RETRY COMPACTO/);
});

test('v10.25.7 keeps hedge and fallback intact',()=>{
  assert.match(worker,/FLASHCARD_HEDGE_DELAY_MS = 4500/);
  assert.match(worker,/runFlashcardProvidersHedged/);
  assert.match(worker,/buildDeterministicFlashcard/);
});

test('v10.25.7 logs retry without source content',()=>{
  assert.match(worker,/Flashcard Gemini retry reason=MAX_TOKENS/);
  assert.doesNotMatch(worker,/console\.(?:info|warn)\([^\n]*TRECHO-FONTE/);
});

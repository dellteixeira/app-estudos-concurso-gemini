const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const worker=fs.readFileSync('src/index.js','utf8');

test('v10.25.7 percorre múltiplos candidates e parts do Gemini',()=>{
  assert.match(worker,/function parseGeminiFlashcardPayload\(payload\)/);
  assert.match(worker,/for \(let candidateIndex = 0; candidateIndex < candidates\.length; candidateIndex\+\+\)/);
  assert.match(worker,/const texts = parts\.map\(/);
  assert.match(worker,/for \(const text of texts\)/);
});

test('v10.25.7 recupera JSON simples malformado sem inventar conteúdo',()=>{
  assert.match(worker,/function recoverGeminiFlashcardText\(value\)/);
  assert.match(worker,/mode: "relaxed-json"/);
  assert.match(worker,/mode: "field-recovery"/);
  assert.match(worker,/isValidFlashcardObject/);
});

test('v10.25.7 registra estrutura segura e finishReason sem conteúdo bruto',()=>{
  assert.match(worker,/function summarizeGeminiFlashcardPayload\(payload\)/);
  assert.match(worker,/finishReasons=\$\{summary\.finishReasons\}/);
  assert.match(worker,/textChars=\$\{summary\.textChars\}/);
  assert.doesNotMatch(worker,/console\.(?:info|warn)\([^\n]*payload\)/);
});

test('v10.25.7 mantém hedge e fallbacks existentes',()=>{
  assert.match(worker,/FLASHCARD_HEDGE_DELAY_MS = 4500/);
  assert.match(worker,/runFlashcardProvidersHedged/);
  assert.match(worker,/buildDeterministicFlashcard/);
});

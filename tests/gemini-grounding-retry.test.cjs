const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const src = fs.readFileSync('src/index.js', 'utf8');

test('prompt do Gemini exige aderência lexical e literalidade jurídica', () => {
  assert.match(src, /A RESPOSTA deve permanecer lexicalmente colada à evidência/);
  assert.match(src, /prefira copiar literalmente o menor trecho suficiente/);
  assert.match(src, /não troque termos jurídicos por sinônimos/);
});

test('retry de grounding é curto e exclusivo de answer-not-grounded', () => {
  assert.match(src, /GEMINI_GROUNDING_RETRY_TIMEOUT_MS = 4500/);
  assert.match(src, /function isOnlyAnswerNotGrounded\(error\)/);
  assert.match(src, /return reason === "answer-not-grounded"/);
  assert.match(src, /isOnlyAnswerNotGrounded\(error\)/);
});

test('hedge antecipado de 4,5s é preservado para não regredir latência', () => {
  assert.match(src, /timer = setTimeout\(startFallback, FLASHCARD_HEDGE_DELAY_MS\)/);
  assert.match(src, /const FLASHCARD_HEDGE_DELAY_MS = 4500/);
});

test('Gemini recebe retry de grounding dentro da tentativa primária', () => {
  const start = src.indexOf('const primaryPromise = attemptFlashcardModel');
  assert.ok(start >= 0);
  const block = src.slice(start, src.indexOf('try {\n    return await firstSuccessfulFlashcard', start));
  assert.match(block, /isOnlyAnswerNotGrounded\(error\)/);
  assert.match(block, /\{ groundingRetry: true \}/);
});

test('validador determinístico não é relaxado', () => {
  assert.match(src, /return lexicalCoverage >= 0\.72 && numbersSupported/);
  assert.match(src, /duplicate-question/);
});

test('retry usa prompt e orçamento específicos e telemetria explícita', () => {
  assert.match(src, /groundingRetryInstruction/);
  assert.match(src, /temperature: groundingRetry \? 0/);
  assert.match(src, /maxOutputTokens: groundingRetry \? 700/);
  assert.match(src, /groundingRetry: Boolean\(result\.groundingRetry\)/);
});

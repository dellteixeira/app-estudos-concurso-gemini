from pathlib import Path

path = Path('src/index.js')
s = path.read_text(encoding='utf-8')

old = '''function isOnlyAnswerNotGrounded(error) {
  const reason = cleanText(error?.flashcardTelemetry?.reason || error?.reason || "", 200);
  return reason === "answer-not-grounded";
}

function aggregateFlashcardFailures(failures) {
  const aggregate = new Error("Todos os provedores externos falharam");
  aggregate.causes = failures.filter(Boolean);
  return aggregate;
}

async function runFlashcardProvidersHedged(env, candidates, systemPrompt, userPrompt, validationContext) {
  if (!candidates.length) throw new Error("Nenhum provedor de IA disponível");

  // Na cadeia automática o Gemini recebe prioridade real. Se a única falha for
  // grounding, uma segunda tentativa curta e mais literal ocorre antes do Llama.
  if (candidates[0] === "gemini") {
    const failures = [];
    try {
      return await attemptFlashcardModel(env, "gemini", systemPrompt, userPrompt, validationContext);
    } catch (primaryError) {
      failures.push(primaryError);
      if (isOnlyAnswerNotGrounded(primaryError)) {
        console.info(`Flashcard Gemini retry reason=answer-not-grounded model=${FLASHCARD_AI_MODELS.gemini.id} timeout=${GEMINI_GROUNDING_RETRY_TIMEOUT_MS}ms`);
        try {
          return await attemptFlashcardModel(env, "gemini", systemPrompt, userPrompt, validationContext, { groundingRetry: true });
        } catch (retryError) {
          failures.push(retryError);
        }
      }
    }

    if (candidates.length > 1) {
      try {
        return await attemptFlashcardModel(env, candidates[1], systemPrompt, userPrompt, validationContext);
      } catch (fallbackError) {
        failures.push(fallbackError);
      }
    }
    throw aggregateFlashcardFailures(failures);
  }

  if (candidates.length === 1) return attemptFlashcardModel(env, candidates[0], systemPrompt, userPrompt, validationContext);
  let fallbackStarted = false;
  let timer = null;
  let startFallback;
  const fallbackPromise = new Promise((resolve, reject) => {
    startFallback = () => {
      if (fallbackStarted) return;
      fallbackStarted = true;
      if (timer) clearTimeout(timer);
      attemptFlashcardModel(env, candidates[1], systemPrompt, userPrompt, validationContext, { hedged: true }).then(resolve, reject);
    };
    timer = setTimeout(startFallback, FLASHCARD_HEDGE_DELAY_MS);
  });
  const primaryPromise = attemptFlashcardModel(env, candidates[0], systemPrompt, userPrompt, validationContext).catch(error => {
    startFallback();
    throw error;
  });
  try {
    return await firstSuccessfulFlashcard([primaryPromise, fallbackPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}'''

new = '''function isOnlyAnswerNotGrounded(error) {
  const reason = cleanText(error?.flashcardTelemetry?.reason || error?.reason || "", 200);
  return reason === "answer-not-grounded";
}

async function runFlashcardProvidersHedged(env, candidates, systemPrompt, userPrompt, validationContext) {
  if (!candidates.length) throw new Error("Nenhum provedor de IA disponível");

  if (candidates.length === 1) {
    try {
      return await attemptFlashcardModel(env, candidates[0], systemPrompt, userPrompt, validationContext);
    } catch (error) {
      if (candidates[0] === "gemini" && isOnlyAnswerNotGrounded(error)) {
        console.info(`Flashcard Gemini retry reason=answer-not-grounded model=${FLASHCARD_AI_MODELS.gemini.id} timeout=${GEMINI_GROUNDING_RETRY_TIMEOUT_MS}ms`);
        return attemptFlashcardModel(env, "gemini", systemPrompt, userPrompt, validationContext, { groundingRetry: true });
      }
      throw error;
    }
  }

  let fallbackStarted = false;
  let timer = null;
  let startFallback;
  const fallbackPromise = new Promise((resolve, reject) => {
    startFallback = () => {
      if (fallbackStarted) return;
      fallbackStarted = true;
      if (timer) clearTimeout(timer);
      attemptFlashcardModel(env, candidates[1], systemPrompt, userPrompt, validationContext, { hedged: true }).then(resolve, reject);
    };
    timer = setTimeout(startFallback, FLASHCARD_HEDGE_DELAY_MS);
  });

  const primaryPromise = attemptFlashcardModel(env, candidates[0], systemPrompt, userPrompt, validationContext).catch(async error => {
    if (candidates[0] === "gemini" && isOnlyAnswerNotGrounded(error)) {
      console.info(`Flashcard Gemini retry reason=answer-not-grounded model=${FLASHCARD_AI_MODELS.gemini.id} timeout=${GEMINI_GROUNDING_RETRY_TIMEOUT_MS}ms`);
      try {
        return await attemptFlashcardModel(env, "gemini", systemPrompt, userPrompt, validationContext, { groundingRetry: true });
      } catch (retryError) {
        // O hedge original continua disponível: caso ainda não tenha iniciado,
        // a falha do retry o libera imediatamente; caso já esteja em andamento,
        // firstSuccessfulFlashcard continua aguardando a primeira resposta válida.
        startFallback();
        throw retryError;
      }
    }
    startFallback();
    throw error;
  });

  try {
    return await firstSuccessfulFlashcard([primaryPromise, fallbackPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}'''

count = s.count(old)
if count != 1:
    raise SystemExit(f'provider orchestration v1 expected once, found {count}')
s = s.replace(old, new, 1)

# Safety checks: keep the old hedge and strict grounding threshold.
required = [
    'timer = setTimeout(startFallback, FLASHCARD_HEDGE_DELAY_MS);',
    'return lexicalCoverage >= 0.72 && numbersSupported;',
    'return reason === "answer-not-grounded";',
    '{ groundingRetry: true }',
]
for token in required:
    if token not in s:
        raise SystemExit(f'missing safety invariant: {token}')

path.write_text(s, encoding='utf-8')

Path('tests/gemini-grounding-retry.test.cjs').write_text(r'''const test = require('node:test');
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
''', encoding='utf-8')

import fs from "node:fs";
import path from "node:path";

const replacement = `
function parseFlashcardAIResponse(result) {
  if (!result) return null;
  const candidates = [result?.response, result?.result?.response, result?.response?.response, result?.output, result?.data, result];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "object" && !Array.isArray(candidate)) {
      if (typeof candidate.question === "string" && typeof candidate.answer === "string") return candidate;
    } else if (typeof candidate === "string") {
      const parsed = extractFirstJsonObject(candidate);
      if (parsed && typeof parsed.question === "string" && typeof parsed.answer === "string") return parsed;
    }
  }
  return null;
}

function deterministicFlashcardSentences(text) {
  const normalized = cleanText(text, 7000).replace(/\\s+/g, " ").trim();
  if (!normalized) return [];
  const parts = normalized.match(/[^.!?;]+(?:[.!?;]+|$)/g) || [normalized];
  const sentences = parts.map(value => cleanText(value, 1800)).filter(value => value.length >= 12);
  return sentences.length ? sentences : [normalized];
}

function classifyFlashcardKnowledge(sentence) {
  const lower = fold(sentence);
  if (/\\bprazo\\b|\\bdias?\\b|\\bmeses?\\b|\\banos?\\b/.test(lower)) return "prazo";
  if (/\\bcompete\\b|\\bcompetencia\\b/.test(lower)) return "competencia";
  if (/\\bvedad[oa]\\b|\\bproibid[oa]\\b|\\bnao podera\\b/.test(lower)) return "vedacao";
  if (/\\bconsidera-se\\b|\\bdefine-se\\b|\\bconsiste\\b|\\bentende-se\\b/.test(lower)) return "conceito";
  if (/\\brequisit[oa]s?\\b|\\bcondicao\\b|\\bdepende\\b|\\bexige\\b/.test(lower)) return "requisito";
  if (/\\bsalvo\\b|\\bexceto\\b|\\bressalvad[oa]\\b|\\bexcepcionalmente\\b/.test(lower)) return "excecao";
  if (/\\bpena\\b|\\breclusao\\b|\\bdetencao\\b|\\bmulta\\b|\\bsancao\\b/.test(lower)) return "sancao";
  if (/\\b\\d+(?:[.,]\\d+)?\\b/.test(lower)) return "numero";
  return "regra";
}

function deterministicFlashcardScore(sentence) {
  const lower = fold(sentence);
  let score = Math.min(4, Math.floor(sentence.length / 140));
  for (const signal of [/\\bprazo\\b|\\bdias?\\b|\\bmeses?\\b|\\banos?\\b/,/\\bcompete\\b|\\bcompetencia\\b/,/\\bvedad[oa]\\b|\\bproibid[oa]\\b|\\bnao podera\\b/,/\\bconsidera-se\\b|\\bdefine-se\\b|\\bconsiste\\b|\\bentende-se\\b/,/\\brequisit[oa]s?\\b|\\bcondicao\\b|\\bdepende\\b|\\bexige\\b/,/\\bsalvo\\b|\\bexceto\\b|\\bressalvad[oa]\\b|\\bexcepcionalmente\\b/,/\\bpena\\b|\\breclusao\\b|\\bdetencao\\b|\\bmulta\\b|\\bsancao\\b/]) if (signal.test(lower)) score += 3;
  return score;
}

function buildFlashcardEvidenceCatalog(text) {
  return deterministicFlashcardSentences(text)
    .map((sentence, sourceIndex) => ({
      id: \`E\${sourceIndex + 1}\`,
      text: cleanText(sentence, 1800),
      sourceIndex,
      knowledgeType: classifyFlashcardKnowledge(sentence),
      score: deterministicFlashcardScore(sentence)
    }))
    .filter(item => item.text)
    .sort((a, b) => b.score - a.score || a.sourceIndex - b.sourceIndex);
}

function selectFlashcardEvidence(catalog, generationIndex) {
  if (!catalog.length) return null;
  return catalog[(Math.max(1, generationIndex) - 1) % catalog.length];
}

function deterministicFlashcardQuestion(sentence, materia, assunto, variant = 0) {
  const lower = fold(sentence), context = cleanText(assunto || materia, 90);
  if (/\\bprazo\\b|\\bdias?\\b|\\bmeses?\\b|\\banos?\\b/.test(lower)) return variant % 2 ? "Qual marco temporal ou prazo deve ser lembrado segundo o trecho?" : "Qual prazo ou referência temporal o trecho estabelece?";
  if (/\\bcompete\\b|\\bcompetencia\\b/.test(lower)) return variant % 2 ? "Que competência é atribuída no trecho?" : "A quem ou a que órgão o trecho atribui a competência indicada?";
  if (/\\bvedad[oa]\\b|\\bproibid[oa]\\b|\\bnao podera\\b/.test(lower)) return variant % 2 ? "Que conduta ou situação o trecho proíbe?" : "Qual vedação o trecho estabelece?";
  if (/\\bconsidera-se\\b|\\bdefine-se\\b|\\bconsiste\\b|\\bentende-se\\b/.test(lower)) return variant % 2 ? "Qual conceito é definido pelo trecho?" : "Como o trecho define o instituto indicado?";
  if (/\\brequisit[oa]s?\\b|\\bcondicao\\b|\\bdepende\\b|\\bexige\\b/.test(lower)) return variant % 2 ? "Qual condição precisa ser observada segundo o trecho?" : "Qual requisito ou condição o trecho estabelece?";
  if (/\\bsalvo\\b|\\bexceto\\b|\\bressalvad[oa]\\b|\\bexcepcionalmente\\b/.test(lower)) return variant % 2 ? "Que ressalva modifica a regra apresentada?" : "Qual exceção ou ressalva o trecho apresenta?";
  if (/\\bpena\\b|\\breclusao\\b|\\bdetencao\\b|\\bmulta\\b|\\bsancao\\b/.test(lower)) return variant % 2 ? "Que sanção ou consequência jurídica aparece no trecho?" : "Qual consequência ou sanção o trecho prevê?";
  if (context) return variant % 2 ? \`Segundo o trecho, o que deve ser lembrado sobre \${context}?\` : \`Qual regra central o trecho apresenta sobre \${context}?\`;
  return variant % 2 ? "Segundo o trecho selecionado, qual informação central deve ser recuperada?" : "Qual é a regra ou informação principal apresentada no trecho?";
}

function tokenizeFlashcardValidation(value) {
  return fold(value)
    .replace(/[^a-z0-9\\s]/g, " ")
    .split(/\\s+/)
    .filter(token => token.length >= 3);
}

function flashcardQuestionSimilarity(a, b) {
  const left = new Set(tokenizeFlashcardValidation(a));
  const right = new Set(tokenizeFlashcardValidation(b));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / Math.max(left.size, right.size);
}

function isGenericFlashcardQuestion(question) {
  const normalized = fold(question);
  if (normalized.length < 18) return true;
  return [
    /^o que diz o trecho\\??$/,
    /^o que o trecho diz\\??$/,
    /^qual e a informacao principal\\??$/,
    /^explique o trecho\\??$/,
    /^fale sobre\\b/,
    /^o que voce sabe sobre\\b/
  ].some(pattern => pattern.test(normalized));
}

function evidenceSupportsAnswer(evidenceText, answer) {
  const sourceTokens = new Set(tokenizeFlashcardValidation(evidenceText));
  const answerTokens = tokenizeFlashcardValidation(answer);
  if (!sourceTokens.size || !answerTokens.length) return false;

  let supported = 0;
  for (const token of answerTokens) if (sourceTokens.has(token)) supported += 1;
  const lexicalCoverage = supported / answerTokens.length;

  const sourceNumbers = new Set(String(evidenceText).match(/\\d+(?:[.,]\\d+)?/g) || []);
  const answerNumbers = String(answer).match(/\\d+(?:[.,]\\d+)?/g) || [];
  const numbersSupported = answerNumbers.every(number => sourceNumbers.has(number));

  return lexicalCoverage >= 0.72 && numbersSupported;
}

function validateFlashcardCandidate(candidate, { evidence, previousQuestions, existingQuestion }) {
  const question = cleanText(candidate?.question, 500);
  const answer = cleanText(candidate?.answer, 4000);
  const evidenceId = cleanText(candidate?.evidenceId || evidence?.id, 40);
  const knowledgeType = cleanText(candidate?.knowledgeType || evidence?.knowledgeType, 40);
  const reasons = [];

  if (!question || !answer) reasons.push("missing-fields");
  if (!evidence?.text || evidenceId !== evidence.id) reasons.push("wrong-evidence");
  if (isGenericFlashcardQuestion(question)) reasons.push("generic-question");
  if (fold(question) === fold(answer)) reasons.push("question-equals-answer");
  if (question && answer && !evidenceSupportsAnswer(evidence.text, answer)) reasons.push("answer-not-grounded");

  const blocked = [existingQuestion, ...(previousQuestions || [])].filter(Boolean);
  if (question && blocked.some(previous => fold(previous) === fold(question) || flashcardQuestionSimilarity(previous, question) >= 0.8)) {
    reasons.push("duplicate-question");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    flashcard: { question, answer, evidenceId, knowledgeType: knowledgeType || evidence?.knowledgeType || "regra" }
  };
}

function buildDeterministicFlashcard({ evidenceCatalog, materia, assunto, generationIndex, previousQuestions, existingQuestion }) {
  const blocked = new Set([existingQuestion, ...(previousQuestions || [])].map(fold).filter(Boolean));
  const catalog = Array.isArray(evidenceCatalog) ? evidenceCatalog : [];
  const start = catalog.length ? (Math.max(1, generationIndex) - 1) % catalog.length : 0;

  for (let offset = 0; offset < Math.max(1, catalog.length); offset++) {
    const evidence = catalog[(start + offset) % catalog.length];
    if (!evidence) break;
    for (let variant = 0; variant < 2; variant++) {
      const question = cleanText(deterministicFlashcardQuestion(evidence.text, materia, assunto, generationIndex + variant), 500);
      if (!question || blocked.has(fold(question))) continue;
      const candidate = {
        question,
        answer: cleanText(evidence.text, 4000),
        evidenceId: evidence.id,
        knowledgeType: evidence.knowledgeType
      };
      const checked = validateFlashcardCandidate(candidate, { evidence, previousQuestions, existingQuestion });
      if (checked.valid) return { ...checked.flashcard, evidence };
    }
  }

  const evidence = catalog[0];
  return {
    question: assunto || materia ? \`Qual regra expressa deve ser lembrada sobre \${cleanText(assunto || materia, 90)}?\` : "Qual regra expressa deve ser lembrada do trecho selecionado?",
    answer: cleanText(evidence?.text || "", 4000),
    evidenceId: evidence?.id || "E1",
    knowledgeType: evidence?.knowledgeType || "regra",
    evidence
  };
}

function isValidFlashcardObject(value) {
  return Boolean(value && typeof value.question === "string" && typeof value.answer === "string" && value.question.trim() && value.answer.trim());
}

function recoverGeminiFlashcardText(value) {
  const source = stripMarkdownJsonFence(value);
  if (!source) return null;

  const direct = extractFirstJsonObject(source);
  if (isValidFlashcardObject(direct)) return { flashcard: direct, mode: "json" };

  let relaxed = source
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/([{,]\\s*)(question|answer|evidenceId|knowledgeType)\\s*:/gi, '$1"$2":')
    .replace(/,\\s*([}\\]])/g, '$1')
    .trim();

  if (relaxed.startsWith("{") && !relaxed.endsWith("}")) relaxed += "}";
  const normalized = extractFirstJsonObject(relaxed);
  if (isValidFlashcardObject(normalized)) return { flashcard: normalized, mode: "relaxed-json" };

  const readField = field => {
    const markers = ['"' + field + '"', "'" + field + "'", field];
    let markerIndex = -1, markerLength = 0;
    const lower = relaxed.toLowerCase();
    for (const marker of markers) {
      markerIndex = lower.indexOf(marker.toLowerCase());
      if (markerIndex >= 0) { markerLength = marker.length; break; }
    }
    if (markerIndex < 0) return "";
    const colonIndex = relaxed.indexOf(":", markerIndex + markerLength);
    if (colonIndex < 0) return "";
    const rest = relaxed.slice(colonIndex + 1).trim();
    const quote = rest[0];
    if (quote === '"' || quote === "'") {
      const endQuote = rest.indexOf(quote, 1);
      return endQuote > 0 ? rest.slice(1, endQuote) : rest.slice(1);
    }
    const newlineIndex = rest.indexOf(String.fromCharCode(10));
    const braceIndex = rest.indexOf("}");
    const ends = [newlineIndex, braceIndex].filter(value => value >= 0);
    const lineEnd = ends.length ? Math.min(...ends) : -1;
    let raw = (lineEnd >= 0 ? rest.slice(0, lineEnd) : rest).trim();
    if (raw.endsWith(",")) raw = raw.slice(0, -1).trim();
    return raw;
  };

  const question = cleanText(readField("question"), 500);
  const answer = cleanText(readField("answer"), 4000);
  const evidenceId = cleanText(readField("evidenceId"), 40);
  const knowledgeType = cleanText(readField("knowledgeType"), 40);
  return question && answer ? { flashcard: { question, answer, evidenceId, knowledgeType }, mode: "field-recovery" } : null;
}

function summarizeGeminiFlashcardPayload(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  let parts = 0, textParts = 0, textChars = 0;
  const finishReasons = [];
  for (const candidate of candidates) {
    finishReasons.push(cleanText(candidate?.finishReason || "unknown", 40));
    const candidateParts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    parts += candidateParts.length;
    for (const part of candidateParts) {
      if (typeof part?.text === "string") {
        textParts += 1;
        textChars += part.text.length;
      }
    }
  }
  return {
    candidates: candidates.length,
    parts,
    textParts,
    textChars,
    finishReasons: finishReasons.filter(Boolean).join(",") || "none"
  };
}

function parseGeminiFlashcardPayload(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
    const parts = Array.isArray(candidates[candidateIndex]?.content?.parts) ? candidates[candidateIndex].content.parts : [];
    const texts = parts.map(part => typeof part?.text === "string" ? part.text : "").filter(Boolean);
    for (const text of texts) {
      const recovered = recoverGeminiFlashcardText(text);
      if (recovered) return { ...recovered, candidateIndex };
    }
    if (texts.length > 1) {
      const recovered = recoverGeminiFlashcardText(texts.join("\\n"));
      if (recovered) return { ...recovered, candidateIndex };
    }
  }
  return null;
}

async function runGeminiFlashcard(env, model, systemPrompt, userPrompt, { compactRetry = false } = {}) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada");
  const endpoint = \`https://generativelanguage.googleapis.com/v1beta/models/\${encodeURIComponent(model.id)}:generateContent\`;
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), GEMINI_FLASHCARD_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: compactRetry ? \`\${userPrompt}\\n\\nRETRY COMPACTO: devolva apenas JSON curto, completo e estritamente aderente à evidência indicada.\` : userPrompt }] }],
        generationConfig: {
          temperature: compactRetry ? 0.1 : 0.2,
          maxOutputTokens: compactRetry ? 900 : 1600,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              question: { type: "STRING" },
              answer: { type: "STRING" },
              evidenceId: { type: "STRING" },
              knowledgeType: { type: "STRING" }
            },
            required: ["question", "answer", "evidenceId", "knowledgeType"]
          },
          thinkingConfig: { thinkingLevel: "LOW" }
        }
      })
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(\`Gemini excedeu o limite de \${GEMINI_FLASHCARD_TIMEOUT_MS} ms\`);
      timeoutError.provider = "gemini";
      timeoutError.model = model.id;
      timeoutError.status = "timeout";
      timeoutError.reason = "request timeout";
      timeoutError.durationMs = Date.now() - startedAt;
      throw timeoutError;
    }
    error.provider = error?.provider || "gemini";
    error.model = error?.model || model.id;
    error.status = error?.status || "network-error";
    error.reason = error?.reason || error?.message || "network error";
    error.durationMs = error?.durationMs || (Date.now() - startedAt);
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = cleanText(await response.text(), 500);
    const httpError = new Error(\`Gemini HTTP \${response.status}\${detail ? \`: \${detail}\` : ""}\`);
    httpError.provider = "gemini";
    httpError.model = model.id;
    httpError.status = response.status;
    httpError.reason = detail || response.statusText || "HTTP error";
    httpError.durationMs = Date.now() - startedAt;
    throw httpError;
  }

  const payload = await response.json();
  const summary = summarizeGeminiFlashcardPayload(payload);
  console.info(\`Flashcard Gemini response model=\${model.id} status=200 candidates=\${summary.candidates} parts=\${summary.parts} textParts=\${summary.textParts} textChars=\${summary.textChars} finishReasons=\${summary.finishReasons} compactRetry=\${compactRetry}\`);

  const recovered = parseGeminiFlashcardPayload(payload);
  if (!recovered?.flashcard && !compactRetry && summary.finishReasons.split(',').includes('MAX_TOKENS')) {
    console.info(\`Flashcard Gemini retry reason=MAX_TOKENS model=\${model.id} firstDuration=\${Date.now() - startedAt}ms\`);
    return runGeminiFlashcard(env, model, systemPrompt, userPrompt, { compactRetry: true });
  }
  if (!recovered?.flashcard) {
    const parseError = new Error("Resposta incompleta do Gemini");
    parseError.provider = "gemini";
    parseError.model = model.id;
    parseError.status = 200;
    parseError.reason = \`incomplete JSON response finishReasons=\${summary.finishReasons} candidates=\${summary.candidates} textParts=\${summary.textParts} textChars=\${summary.textChars}\`;
    parseError.durationMs = Date.now() - startedAt;
    throw parseError;
  }
  return recovered.flashcard;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(\`\${label} excedeu o limite de \${ms} ms\`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function attemptFlashcardModel(env, key, systemPrompt, userPrompt, validationContext, { hedged = false } = {}) {
  const model = FLASHCARD_AI_MODELS[key];
  const provider = model?.provider === "gemini" ? "gemini" : "workers-ai";
  const providerLabel = provider === "gemini" ? "Google Gemini" : "Workers AI";
  const startedAt = Date.now();
  try {
    const parsed = provider === "gemini"
      ? await runGeminiFlashcard(env, model, systemPrompt, userPrompt)
      : parseFlashcardAIResponse(await withTimeout(env.AI.run(model.id, { messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.1, max_tokens: 700 }), WORKERS_FLASHCARD_TIMEOUT_MS, model.label));
    const checked = validateFlashcardCandidate(parsed, validationContext);
    if (!checked.valid) {
      const validationError = new Error(\`Flashcard rejeitado na validação: \${checked.reasons.join(",")}\`);
      validationError.reason = checked.reasons.join(",");
      throw validationError;
    }
    const durationMs = Date.now() - startedAt;
    console.info(\`Flashcard AI success provider=\${provider} model=\${model.id} duration=\${durationMs}ms hedged=\${hedged} evidence=\${validationContext.evidence.id} type=\${validationContext.evidence.knowledgeType}\`);
    return { ...checked.flashcard, provider, providerLabel, model, key, durationMs, hedged };
  } catch (error) {
    const durationMs = Number(error?.durationMs) || (Date.now() - startedAt);
    const status = error?.status ?? "error";
    const reason = cleanText(error?.reason || error?.message || String(error), 500);
    console.warn(\`Flashcard AI failure provider=\${provider} model=\${model.id} status=\${status} reason=\${reason} duration=\${durationMs}ms hedged=\${hedged}\`);
    error.flashcardTelemetry = { provider, model: model.id, status, reason, durationMs, hedged };
    throw error;
  }
}

function firstSuccessfulFlashcard(promises) {
  return new Promise((resolve, reject) => {
    const failures = [];
    let remaining = promises.length;
    for (const promise of promises) {
      Promise.resolve(promise).then(resolve, error => {
        failures.push(error);
        remaining -= 1;
        if (remaining === 0) {
          const aggregate = new Error("Todos os provedores externos falharam");
          aggregate.causes = failures;
          reject(aggregate);
        }
      });
    }
  });
}

async function runFlashcardProvidersHedged(env, candidates, systemPrompt, userPrompt, validationContext) {
  if (!candidates.length) throw new Error("Nenhum provedor de IA disponível");
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
}

async function generateFlashcard(request, env) {
  const user = await authenticateSupabaseUser(request, env);
  if (!user?.id) return json({ error: "Sessão inválida ou expirada." }, 401);
  if (env.AI_RATE_LIMITER?.limit) {
    const { success } = await env.AI_RATE_LIMITER.limit({ key: \`\${user.id}:flashcard\` });
    if (!success) return json({ error: "Muitas gerações em sequência. Aguarde um minuto." }, 429);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: "Corpo JSON inválido." }, 400); }
  const text = cleanText(body?.text, 7000);
  const existingQuestion = cleanText(body?.existingQuestion, 500);
  const previousQuestions = (Array.isArray(body?.previousQuestions) ? body.previousQuestions : []).map(q => cleanText(q, 500)).filter(Boolean).slice(-12);
  const generationIndex = Math.max(1, Math.min(99, Number.parseInt(body?.generationIndex, 10) || 1));
  const materia = cleanText(body?.materia, 180);
  const assunto = cleanText(body?.assunto, 300);
  const requested = String(body?.model || "auto").toLowerCase();
  if (text.length < 8) return json({ error: "Selecione um trecho mais completo." }, 422);
  if (requested !== "auto" && !FLASHCARD_AI_MODELS[requested]) return json({ error: "Modelo de IA inválido." }, 400);
  const evidenceCatalog = buildFlashcardEvidenceCatalog(text);
  const evidence = selectFlashcardEvidence(evidenceCatalog, generationIndex);
  if (!evidence) return json({ error: "Não foi possível extrair evidência suficiente do trecho selecionado." }, 422);
  const candidates = flashcardCandidateChain(requested);
  const validationContext = { evidence, previousQuestions, existingQuestion };
  const systemPrompt = \`Você é um elaborador especialista de flashcards para concursos públicos brasileiros. Gere exatamente UM flashcard usando SOMENTE a EVIDÊNCIA AUTORIZADA. Não use conhecimento externo, não complete lacunas e não altere números, prazos, sujeitos, requisitos, exceções ou consequências. A resposta deve ficar lexicalmente próxima da evidência para permitir validação automática. A pergunta deve ser autossuficiente, específica, ter um único núcleo de cobrança e não pode ser genérica. Não repita nem parafraseie perguntas anteriores. Retorne somente JSON válido com question, answer, evidenceId e knowledgeType.\`;
  const avoid = previousQuestions.length ? previousQuestions.map((q, i) => \`\${i + 1}. \${q}\`).join("\\n") : "nenhuma";
  const userPrompt = \`GERAÇÃO: \${generationIndex}
MATÉRIA: \${materia || "não informada"}
ASSUNTO: \${assunto || "não informado"}
CLASSIFICAÇÃO DO CONHECIMENTO: \${evidence.knowledgeType}
EVIDENCE_ID OBRIGATÓRIO: \${evidence.id}
EVIDÊNCIA AUTORIZADA — única fonte de verdade:
\${evidence.text}

PERGUNTA ATUAL A NÃO REPETIR: \${existingQuestion || "nenhuma"}
PERGUNTAS JÁ GERADAS A NÃO REPETIR NEM PARAFRASEAR:
\${avoid}

DEVOLVA EXATAMENTE:
{"question":"...","answer":"...","evidenceId":"\${evidence.id}","knowledgeType":"\${evidence.knowledgeType}"}\`;
  try {
    const result = await runFlashcardProvidersHedged(env, candidates, systemPrompt, userPrompt, validationContext);
    const preferredKey = requested === "auto" ? candidates[0] : requested;
    const fallbackUsed = result.key !== preferredKey;
    console.info(\`Flashcard AI selected provider=\${result.provider} model=\${result.model.id} duration=\${result.durationMs}ms fallback=\${fallbackUsed} hedged=\${result.hedged} evidence=\${result.evidenceId}\`);
    return json({ question: result.question, answer: result.answer, model: \`\${result.providerLabel} · \${result.model.label}\`, provider: result.provider, modelKey: result.key, fallbackUsed, hedged: result.hedged, latencyMs: result.durationMs, evidenceId: result.evidenceId, knowledgeType: result.knowledgeType, sourceValidated: true });
  } catch (aggregate) {
    const errors = Array.isArray(aggregate?.causes) ? aggregate.causes.map(error => {
      const telemetry = error?.flashcardTelemetry;
      return telemetry ? \`\${telemetry.model}: \${telemetry.reason}\` : cleanText(error?.message || String(error), 500);
    }) : [cleanText(aggregate?.message || String(aggregate), 500)];
    console.warn("Flashcard AI external providers exhausted; using deterministic local fallback", errors);
  }
  const localStartedAt = Date.now();
  const local = buildDeterministicFlashcard({ evidenceCatalog, materia, assunto, generationIndex, previousQuestions, existingQuestion });
  const localDurationMs = Date.now() - localStartedAt;
  console.info(\`Flashcard AI success provider=local-deterministic model=local duration=\${localDurationMs}ms hedged=false fallback=true evidence=\${local.evidenceId}\`);
  return json({ question: local.question, answer: local.answer, model: "Gerador local · sem IA", provider: "local-deterministic", modelKey: "local", fallbackUsed: true, deterministic: true, hedged: false, latencyMs: localDurationMs, evidenceId: local.evidenceId, knowledgeType: local.knowledgeType, sourceValidated: true });
}
`;

const workerPath = "src/index.js";
let worker = fs.readFileSync(workerPath, "utf8");
const startMarker = "function parseFlashcardAIResponse(result) {";
const endMarker = "\n\nexport default {";
const start = worker.indexOf(startMarker);
const end = worker.indexOf(endMarker, start);
if (start < 0 || end < 0 || end <= start) throw new Error("Bloco funcional de flashcards não localizado");
worker = worker.slice(0, start) + replacement.trimStart() + worker.slice(end);
worker = worker.replace(/const APP_VERSION = "[^"]+";/, 'const APP_VERSION = "10.26.0";');
fs.writeFileSync(workerPath, worker);

const pkgPath = "package.json";
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.version = "10.26.0";
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const versionPath = "public/version.json";
const version = JSON.parse(fs.readFileSync(versionPath, "utf8"));
version.version = "10.26.0";
version.build = new Date().toISOString();
fs.writeFileSync(versionPath, JSON.stringify(version, null, 2) + "\n");

const swPath = "public/sw.js";
let sw = fs.readFileSync(swPath, "utf8");
sw = sw.replace(/const APP_VERSION = '[^']+';/, "const APP_VERSION = '10.26.0';");
fs.writeFileSync(swPath, sw);

for (const name of fs.readdirSync("tests")) {
  if (!name.endsWith(".test.cjs")) continue;
  const file = path.join("tests", name);
  let source = fs.readFileSync(file, "utf8");
  source = source.replaceAll("10.25.7", "10.26.0").replaceAll("10\\.25\\.7", "10\\.26\\.0");
  fs.writeFileSync(file, source);
}

fs.writeFileSync("tests/v10-26-source-grounded-flashcards.test.cjs", `const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const worker=fs.readFileSync('src/index.js','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const version=JSON.parse(fs.readFileSync('public/version.json','utf8'));
const sw=fs.readFileSync('public/sw.js','utf8');

test('v10.26.0 builds deterministic evidence before asking AI',()=>{
  const buildPos=worker.indexOf('const evidenceCatalog = buildFlashcardEvidenceCatalog(text)');
  const promptPos=worker.indexOf('const systemPrompt = \\`Você é um elaborador especialista');
  assert.ok(buildPos>0); assert.ok(promptPos>buildPos);
  assert.match(worker,/function classifyFlashcardKnowledge\\(/);
  assert.match(worker,/knowledgeType: classifyFlashcardKnowledge\\(sentence\\)/);
});

test('v10.26.0 uses Gemini structured output with low thinking',()=>{
  assert.match(worker,/responseMimeType: "application\\/json"/);
  assert.match(worker,/evidenceId: \\{ type: "STRING" \\}/);
  assert.match(worker,/knowledgeType: \\{ type: "STRING" \\}/);
  assert.match(worker,/thinkingConfig: \\{ thinkingLevel: "LOW" \\}/);
  assert.match(worker,/maxOutputTokens: compactRetry \\? 900 : 1600/);
});

test('v10.26.0 validates source grounding and rejects weak questions',()=>{
  assert.match(worker,/function evidenceSupportsAnswer\\(/);
  assert.match(worker,/lexicalCoverage >= 0\\.72/);
  assert.match(worker,/function isGenericFlashcardQuestion\\(/);
  assert.match(worker,/function flashcardQuestionSimilarity\\(/);
  assert.match(worker,/reasons\\.push\\("answer-not-grounded"\\)/);
  assert.match(worker,/reasons\\.push\\("duplicate-question"\\)/);
  assert.match(worker,/sourceValidated: true/);
});

test('v10.26.0 preserves hedge and deterministic fallback',()=>{
  assert.match(worker,/const FLASHCARD_HEDGE_DELAY_MS = 4500/);
  assert.match(worker,/runFlashcardProvidersHedged/);
  assert.match(worker,/buildDeterministicFlashcard/);
  assert.match(worker,/provider: "local-deterministic"/);
});

test('v10.26.0 version is synchronized',()=>{
  assert.equal(pkg.version,'10.26.0'); assert.equal(version.version,'10.26.0');
  assert.match(worker,/const APP_VERSION = "10\\.26\\.0"/);
  assert.match(sw,/const APP_VERSION = '10\\.26\\.0'/);
});
`);
console.log("v10.26.0 aplicada diretamente aos arquivos funcionais.");

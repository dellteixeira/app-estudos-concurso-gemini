// Universal Parser V8.4: o backend recebe matéria/assunto já bloqueados pelo frontend.
const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const FLASHCARD_AI_MODELS = Object.freeze({
  gemini: { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", provider: "gemini" },
  gemma: { id: "@cf/google/gemma-4-26b-a4b-it", label: "Gemma 4 26B" },
  nemotron: { id: "@cf/nvidia/nemotron-3-120b-a12b", label: "Nemotron 3 120B" },
  glm: { id: "@cf/zai-org/glm-4.7-flash", label: "GLM-4.7 Flash" },
  llama: { id: "@cf/meta/llama-3.1-8b-instruct-fast", label: "Llama 3.1 8B Fast", legacyLabel: "Workers AI · Llama 3.1 8B" }
});
const FLASHCARD_AUTO_CHAIN = ["gemini", "llama"];
function flashcardCandidateChain(requested) {
  const preferred = requested === "auto" ? FLASHCARD_AUTO_CHAIN : [requested, "llama"];
  return [...new Set(preferred.filter(key => FLASHCARD_AI_MODELS[key]))];
}
const GEMINI_FLASHCARD_TIMEOUT_MS = 12000;
const WORKERS_FLASHCARD_TIMEOUT_MS = 8000;
const FLASHCARD_HEDGE_DELAY_MS = 4500;
const MAX_TEXT_CHARS = 110000;
const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_MATERIAS = 120;
const MAX_TOPICS_TOTAL = 5000;
const MAX_MATERIA_CHARS = 180;
const MAX_ASSUNTO_CHARS = 1200;

const APP_VERSION = "10.25.7";
const CORE_NO_STORE_PATHS = new Set([
  "/", "/index.html", "/sw.js", "/pwa-update.js", "/version.json",
  "/css/base.css", "/css/dashboard.css", "/css/features.css", "/css/pdf-library.css", "/css/pdf-reader.css",
  "/js/study-domain.js", "/js/app-core.js", "/js/pdf/pdf-core.js", "/js/pdf/pdf-workspaces.js", "/js/pdf/pdf-links.js", "/js/pdf/pdf-library.js", "/js/pdf/pdf-upload.js", "/js/app-ai.js", "/js/app-ui.js", "/js/pdf/pdf-annotations.js", "/js/pdf/pdf-reader.js", "/js/pdf/pdf-library-ui.js", "/js/app-pwa.js"
]);

const VENDOR_ROUTES = {
  "/vendor/supabase.js": {
    upstreams: [
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/dist/umd/supabase.js",
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
    ],
    contentType: "application/javascript; charset=utf-8"
  },
  "/vendor/chart.umd.min.js": {
    upstreams: [
      "https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js",
      "https://cdn.jsdelivr.net/npm/chart.js@4.5.1"
    ],
    contentType: "application/javascript; charset=utf-8"
  },
  "/vendor/pdf.min.js": {
    upstreams: [
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
      "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js"
    ],
    contentType: "application/javascript; charset=utf-8"
  },
  "/vendor/pdf_viewer.min.js": {
    upstreams: [
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf_viewer.min.js",
      "https://unpkg.com/pdfjs-dist@3.11.174/web/pdf_viewer.js"
    ],
    contentType: "application/javascript; charset=utf-8"
  },
  "/vendor/pdf_viewer.min.css": {
    upstreams: [
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf_viewer.min.css",
      "https://unpkg.com/pdfjs-dist@3.11.174/web/pdf_viewer.css"
    ],
    contentType: "text/css; charset=utf-8"
  },
  "/vendor/pdf.worker.min.js": {
    upstreams: [
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
      "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js"
    ],
    contentType: "application/javascript; charset=utf-8"
  }
};

async function serveVendorAsset(request, route) {
  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let lastStatus = 0;
  for (const upstreamUrl of route.upstreams) {
    try {
      const upstream = await fetch(upstreamUrl, { redirect: "follow" });
      lastStatus = upstream.status;
      if (!upstream.ok) continue;

      const headers = new Headers();
      headers.set("content-type", route.contentType);
      headers.set("cache-control", "public, max-age=86400, s-maxage=31536000");
      headers.set("x-content-type-options", "nosniff");
      headers.set("x-painel-vendor-source", new URL(upstreamUrl).hostname);
      const response = new Response(upstream.body, { status: 200, headers });
      await cache.put(cacheKey, response.clone());
      return response;
    } catch (error) {
      console.warn("Falha ao obter dependência vendor:", upstreamUrl, error?.message || error);
    }
  }

  return new Response("Dependência temporariamente indisponível.", {
    status: 503,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-painel-vendor-last-status": String(lastStatus || 0)
    }
  });
}


const prioritySchema = {
  type: "object",
  properties: {
    materias: {
      type: "array",
      items: {
        type: "object",
        properties: {
          materia: { type: "string" },
          prioridade: { type: "integer", minimum: 1, maximum: 4 },
          peso: { type: "number", minimum: 0 }
        },
        required: ["materia", "prioridade", "peso"]
      }
    }
  },
  required: ["materias"]
};

function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer"
  });
  for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  return new Response(JSON.stringify(data), { status, headers });
}

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function stripMarkdownJsonFence(value) {
  return String(value || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractFirstJsonObject(text) {
  const source = stripMarkdownJsonFence(text);
  if (!source) return null;

  try {
    const direct = JSON.parse(source);
    if (direct && typeof direct === "object") return direct;
  } catch {}

  let start = -1, depth = 0, inString = false, escaped = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        try { return JSON.parse(source.slice(start, i + 1)); } catch {}
        start = -1;
      }
    }
  }
  return null;
}

function parseAIResponse(result) {
  if (!result) return null;
  const candidates = [
    result?.response,
    result?.result?.response,
    result?.response?.response,
    result?.output,
    result?.data,
    result
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "object" && !Array.isArray(candidate)) {
      if (Array.isArray(candidate.materias)) return candidate;
      if (candidate.analysis && Array.isArray(candidate.analysis.materias)) return candidate.analysis;
    } else if (typeof candidate === "string") {
      const parsed = extractFirstJsonObject(candidate);
      if (parsed && Array.isArray(parsed.materias)) return parsed;
    }
  }
  return null;
}

async function authenticateSupabaseUser(request, env) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;

  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      authorization,
      apikey: env.SUPABASE_ANON_KEY
    }
  });

  if (!response.ok) return null;
  return response.json();
}

function sanitizeLockedMaterias(input) {
  const items = Array.isArray(input) ? input : [];
  const clean = [];
  const seen = new Set();

  let topicCount = 0;
  for (const item of items.slice(0, MAX_MATERIAS)) {
    const materia = cleanText(item?.materia, MAX_MATERIA_CHARS);
    if (!materia) continue;

    const assuntos = [];
    const topicSeen = new Set();
    for (const value of (Array.isArray(item?.assuntos) ? item.assuntos : [])) {
      if (topicCount >= MAX_TOPICS_TOTAL) break;
      const assunto = cleanText(value, MAX_ASSUNTO_CHARS);
      const key = fold(assunto);
      if (!assunto || topicSeen.has(key)) continue;
      topicSeen.add(key);
      assuntos.push(assunto);
      topicCount++;
    }
    if (!assuntos.length) continue;

    const key = fold(materia);
    if (seen.has(key)) continue;
    seen.add(key);

    clean.push({
      materia,
      prioridade: Math.min(4, Math.max(1, Number.parseInt(item?.prioridade, 10) || 2)),
      peso: Number.isFinite(Number(item?.peso)) && Number(item?.peso) > 0 ? Number(item.peso) : 1,
      assuntos
    });
  }
  return clean;
}

function mergePriorityOnly(lockedMaterias, aiResult) {
  const scores = new Map();
  for (const item of (Array.isArray(aiResult?.materias) ? aiResult.materias : [])) {
    const name = String(item?.materia || "").trim();
    if (!name) continue;
    scores.set(fold(name), {
      prioridade: Math.min(4, Math.max(1, Number.parseInt(item?.prioridade, 10) || 2)),
      peso: Number.isFinite(Number(item?.peso)) && Number(item?.peso) > 0 ? Number(item.peso) : null
    });
  }

  return lockedMaterias.map(item => {
    const score = scores.get(fold(item.materia));
    return {
      materia: item.materia,
      // A hierarquia e os assuntos jamais vêm da IA.
      prioridade: score?.prioridade ?? item.prioridade,
      // Peso detectado do quadro de provas no frontend tem precedência.
      peso: item.peso > 1 ? item.peso : (score?.peso ?? item.peso),
      assuntos: item.assuntos
    };
  });
}

async function analyzeEdital(request, env) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json({ error: "Content-Type deve ser application/json." }, 415);
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    return json({ error: "Requisição excede o limite de segurança." }, 413);
  }

  const user = await authenticateSupabaseUser(request, env);
  if (!user?.id) return json({ error: "Sessão inválida ou expirada." }, 401);

  if (env.AI_RATE_LIMITER?.limit) {
    const { success } = await env.AI_RATE_LIMITER.limit({ key: `${user.id}:analisar-edital` });
    if (!success) {
      return json({ error: "Muitas análises em sequência. Aguarde um minuto e tente novamente." }, 429, { "retry-after": "60" });
    }
  }

  let body;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json({ error: "Requisição excede o limite de segurança." }, 413);
    }
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: "Corpo JSON inválido." }, 400);
  }

  const rawLockedMaterias = Array.isArray(body?.lockedMaterias) ? body.lockedMaterias : [];
  if (rawLockedMaterias.length > MAX_MATERIAS) {
    return json({ error: "Quantidade de matérias excede o limite de segurança." }, 413);
  }
  const rawTopicCount = rawLockedMaterias.reduce((sum, item) => sum + (Array.isArray(item?.assuntos) ? item.assuntos.length : 0), 0);
  if (rawTopicCount > MAX_TOPICS_TOTAL) {
    return json({ error: "Quantidade de tópicos excede o limite de segurança." }, 413);
  }

  const concurso = cleanText(body?.concurso, 200);
  const banca = cleanText(body?.banca, 120);
  const fileName = cleanText(body?.fileName || "Edital.pdf", 240);
  const cargoLabel = cleanText(body?.cargo?.label || body?.cargo, 240);
  const rawText = cleanText(body?.text, MAX_TEXT_CHARS + 1);
  const lockedMaterias = sanitizeLockedMaterias(rawLockedMaterias);

  if (!lockedMaterias.length) {
    return json({ error: "O frontend não enviou matérias/assuntos determinísticos válidos para o cargo selecionado." }, 422);
  }

  if (rawText.length > MAX_TEXT_CHARS) {
    return json({ error: "Recorte do edital excedeu o limite de segurança." }, 413);
  }

  // Resultado-base seguro: mesmo que a IA falhe, matéria/assunto permanecem corretos.
  let finalMaterias = lockedMaterias;
  let aiUsed = false;

  const systemPrompt = `
Você auxilia na PRIORIZAÇÃO de um edital já extraído deterministicamente.

REGRAS ABSOLUTAS:
1. NÃO extraia matérias.
2. NÃO crie matérias.
3. NÃO remova matérias.
4. NÃO renomeie matérias.
5. NÃO gere assuntos.
6. A lista de matérias fornecida está BLOQUEADA.
7. Sua única tarefa é atribuir prioridade 1, 2, 3 ou 4 e peso numérico às matérias usando SOMENTE sinais existentes no edital recebido.
8. Se o texto não permitir diferenciar, use prioridade 2. A escala é P1 = prioridade máxima, P2 = alta, P3 = média e P4 = baixa.
9. Se o peso já estiver explicitamente indicado no texto/quadro de provas, respeite-o.
10. Não use histórico da banca; ele não está disponível nesta fase.
11. Retorne somente JSON no schema solicitado.
`;

  const lockedNames = lockedMaterias.map(m => ({
    materia: m.materia,
    peso_detectado: m.peso,
    prioridade_inicial: m.prioridade
  }));

  const userPrompt = `
Concurso: ${concurso || "não informado"}
Cargo/Área/Especialidade: ${cargoLabel || "não informado"}
Banca: ${banca || "não informada"}
Arquivo: ${fileName}

MATÉRIAS BLOQUEADAS:
${JSON.stringify(lockedNames)}

RECORTE DO EDITAL DO CARGO:
${rawText.slice(0, MAX_TEXT_CHARS)}
`;

  try {
    const result = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: prioritySchema
      },
      temperature: 0,
      max_tokens: 3000
    });

    const parsed = parseAIResponse(result);
    if (parsed && Array.isArray(parsed.materias)) {
      finalMaterias = mergePriorityOnly(lockedMaterias, parsed);
      aiUsed = true;
    }
  } catch (error) {
    console.error("Workers AI priority error; using deterministic fallback", error);
  }

  return json({
    parserVersion: "v8-adaptive-universal",
    analysis: {
      concurso,
      materias: finalMaterias
    },
    model: MODEL,
    aiUsed,
    extractionLocked: true
  });
}


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
  const normalized = cleanText(text, 7000).replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const parts = normalized.match(/[^.!?;]+(?:[.!?;]+|$)/g) || [normalized];
  const sentences = parts.map(value => cleanText(value, 1800)).filter(value => value.length >= 12);
  return sentences.length ? sentences : [normalized];
}

function deterministicFlashcardScore(sentence) {
  const lower = fold(sentence);
  let score = Math.min(4, Math.floor(sentence.length / 140));
  for (const signal of [/\bprazo\b|\bdias?\b|\bmeses?\b|\banos?\b/,/\bcompete\b|\bcompetencia\b/,/\bvedad[oa]\b|\bproibid[oa]\b|\bnao podera\b/,/\bconsidera-se\b|\bdefine-se\b|\bconsiste\b|\bentende-se\b/,/\brequisit[oa]s?\b|\bcondicao\b|\bdepende\b|\bexige\b/,/\bsalvo\b|\bexceto\b|\bressalvad[oa]\b|\bexcepcionalmente\b/,/\bpena\b|\breclusao\b|\bdetencao\b|\bmulta\b|\bsancao\b/]) if (signal.test(lower)) score += 3;
  return score;
}

function deterministicFlashcardQuestion(sentence, materia, assunto, variant = 0) {
  const lower = fold(sentence), context = cleanText(assunto || materia, 90);
  if (/\bprazo\b|\bdias?\b|\bmeses?\b|\banos?\b/.test(lower)) return variant%2?'Qual marco temporal ou prazo deve ser lembrado segundo o trecho?':'Qual prazo ou referência temporal o trecho estabelece?';
  if (/\bcompete\b|\bcompetencia\b/.test(lower)) return variant%2?'Que competência é atribuída no trecho?':'A quem ou a que órgão o trecho atribui a competência indicada?';
  if (/\bvedad[oa]\b|\bproibid[oa]\b|\bnao podera\b/.test(lower)) return variant%2?'Que conduta ou situação o trecho proíbe?':'Qual vedação o trecho estabelece?';
  if (/\bconsidera-se\b|\bdefine-se\b|\bconsiste\b|\bentende-se\b/.test(lower)) return variant%2?'Qual conceito é definido pelo trecho?':'Como o trecho define o instituto indicado?';
  if (/\brequisit[oa]s?\b|\bcondicao\b|\bdepende\b|\bexige\b/.test(lower)) return variant%2?'Qual condição precisa ser observada segundo o trecho?':'Qual requisito ou condição o trecho estabelece?';
  if (/\bsalvo\b|\bexceto\b|\bressalvad[oa]\b|\bexcepcionalmente\b/.test(lower)) return variant%2?'Que ressalva modifica a regra apresentada?':'Qual exceção ou ressalva o trecho apresenta?';
  if (/\bpena\b|\breclusao\b|\bdetencao\b|\bmulta\b|\bsancao\b/.test(lower)) return variant%2?'Que sanção ou consequência jurídica aparece no trecho?':'Qual consequência ou sanção o trecho prevê?';
  if (context) return variant%2?`Segundo o trecho, o que deve ser lembrado sobre ${context}?`:`Qual regra central o trecho apresenta sobre ${context}?`;
  return variant%2?'Segundo o trecho selecionado, qual informação central deve ser recuperada?':'Qual é a regra ou informação principal apresentada no trecho?';
}

function buildDeterministicFlashcard({ text, materia, assunto, generationIndex, previousQuestions, existingQuestion }) {
  const sentences = deterministicFlashcardSentences(text).map((sentence,sourceIndex)=>({sentence,sourceIndex,score:deterministicFlashcardScore(sentence)})).sort((a,b)=>b.score-a.score||a.sourceIndex-b.sourceIndex);
  const blocked = new Set([existingQuestion,...(previousQuestions||[])].map(fold).filter(Boolean));
  const start = sentences.length ? (Math.max(1,generationIndex)-1)%sentences.length : 0;
  for(let offset=0;offset<Math.max(1,sentences.length);offset++){
    const item=sentences[(start+offset)%sentences.length]||{sentence:cleanText(text,1800)};
    for(let variant=0;variant<2;variant++){
      const question=cleanText(deterministicFlashcardQuestion(item.sentence,materia,assunto,generationIndex+variant),500);
      if(question&&!blocked.has(fold(question))) return {question,answer:cleanText(item.sentence,4000)};
    }
  }
  return {question: assunto||materia ? `O que o trecho estabelece sobre ${cleanText(assunto||materia,90)}?` : 'O que o trecho selecionado estabelece?',answer:cleanText(sentences[0]?.sentence||text,4000)};
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
    .replace(/([{,]\s*)(question|answer)\s*:/gi, '$1"$2":')
    .replace(/,\s*([}\]])/g, '$1')
    .trim();

  if (relaxed.startsWith('{') && !relaxed.endsWith('}')) relaxed += '}';
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
    if (markerIndex < 0) return '';
    const colonIndex = relaxed.indexOf(':', markerIndex + markerLength);
    if (colonIndex < 0) return '';
    const rest = relaxed.slice(colonIndex + 1).trim();
    const quote = rest[0];
    if (quote === '"' || quote === "'") {
      const endQuote = rest.indexOf(quote, 1);
      return endQuote > 0 ? rest.slice(1, endQuote) : rest.slice(1);
    }
    const newlineIndex = rest.indexOf(String.fromCharCode(10));
    const braceIndex = rest.indexOf('}');
    const ends = [newlineIndex, braceIndex].filter(value => value >= 0);
    const lineEnd = ends.length ? Math.min(...ends) : -1;
    let raw = (lineEnd >= 0 ? rest.slice(0, lineEnd) : rest).trim();
    if (raw.endsWith(',')) raw = raw.slice(0, -1).trim();
    return raw;
  };

  const question = cleanText(readField('question'), 500);
  const answer = cleanText(readField('answer'), 4000);
  return question && answer ? { flashcard: { question, answer }, mode: "field-recovery" } : null;
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
    finishReasons: finishReasons.filter(Boolean).join(',') || 'none'
  };
}

function parseGeminiFlashcardPayload(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
    const parts = Array.isArray(candidates[candidateIndex]?.content?.parts) ? candidates[candidateIndex].content.parts : [];
    const texts = parts.map(part => typeof part?.text === "string" ? part.text : '').filter(Boolean);

    for (const text of texts) {
      const recovered = recoverGeminiFlashcardText(text);
      if (recovered) return { ...recovered, candidateIndex };
    }

    if (texts.length > 1) {
      const recovered = recoverGeminiFlashcardText(texts.join('\n'));
      if (recovered) return { ...recovered, candidateIndex };
    }
  }
  return null;
}

async function runGeminiFlashcard(env, model, systemPrompt, userPrompt, { compactRetry = false } = {}) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.id)}:generateContent`;
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
        contents: [{ role: "user", parts: [{ text: compactRetry ? `${userPrompt}\n\nRETRY COMPACTO: devolva apenas um JSON curto e completo, com pergunta objetiva e resposta concisa. Não explique, não raciocine em texto e não inclua markdown.` : userPrompt }] }],
        generationConfig: {
          temperature: compactRetry ? 0.1 : 0.35,
          maxOutputTokens: compactRetry ? 900 : 1600,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: { question: { type: "STRING" }, answer: { type: "STRING" } },
            required: ["question", "answer"]
          }
        }
      })
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`Gemini excedeu o limite de ${GEMINI_FLASHCARD_TIMEOUT_MS} ms`);
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
    const httpError = new Error(`Gemini HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    httpError.provider = "gemini";
    httpError.model = model.id;
    httpError.status = response.status;
    httpError.reason = detail || response.statusText || "HTTP error";
    httpError.durationMs = Date.now() - startedAt;
    throw httpError;
  }

  const payload = await response.json();
  const summary = summarizeGeminiFlashcardPayload(payload);
  console.info(`Flashcard Gemini response model=${model.id} status=200 candidates=${summary.candidates} parts=${summary.parts} textParts=${summary.textParts} textChars=${summary.textChars} finishReasons=${summary.finishReasons} compactRetry=${compactRetry}`);

  const recovered = parseGeminiFlashcardPayload(payload);
  if (!recovered?.flashcard && !compactRetry && summary.finishReasons.split(',').includes('MAX_TOKENS')) {
    console.info(`Flashcard Gemini retry reason=MAX_TOKENS model=${model.id} firstDuration=${Date.now() - startedAt}ms`);
    return runGeminiFlashcard(env, model, systemPrompt, userPrompt, { compactRetry: true });
  }
  if (!recovered?.flashcard) {
    const parseError = new Error("Resposta incompleta do Gemini");
    parseError.provider = "gemini";
    parseError.model = model.id;
    parseError.status = 200;
    parseError.reason = `incomplete JSON response finishReasons=${summary.finishReasons} candidates=${summary.candidates} textParts=${summary.textParts} textChars=${summary.textChars}`;
    parseError.durationMs = Date.now() - startedAt;
    throw parseError;
  }

  if (recovered.mode !== "json" || recovered.candidateIndex > 0) {
    console.info(`Flashcard Gemini recovered model=${model.id} mode=${recovered.mode} candidate=${recovered.candidateIndex} finishReasons=${summary.finishReasons}`);
  }
  return recovered.flashcard;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} excedeu o limite de ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function attemptFlashcardModel(env, key, systemPrompt, userPrompt, { hedged = false } = {}) {
  const model = FLASHCARD_AI_MODELS[key];
  const provider = model?.provider === "gemini" ? "gemini" : "workers-ai";
  const providerLabel = provider === "gemini" ? "Google Gemini" : "Workers AI";
  const startedAt = Date.now();
  try {
    const parsed = provider === "gemini"
      ? await runGeminiFlashcard(env, model, systemPrompt, userPrompt)
      : parseFlashcardAIResponse(await withTimeout(env.AI.run(model.id, { messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.1, max_tokens: 700 }), WORKERS_FLASHCARD_TIMEOUT_MS, model.label));
    const question = cleanText(parsed?.question, 500);
    const answer = cleanText(parsed?.answer, 4000);
    if (!question || !answer) throw new Error("Resposta incompleta da IA");
    const durationMs = Date.now() - startedAt;
    console.info(`Flashcard AI success provider=${provider} model=${model.id} duration=${durationMs}ms hedged=${hedged}`);
    return { question, answer, provider, providerLabel, model, key, durationMs, hedged };
  } catch (error) {
    const durationMs = Number(error?.durationMs) || (Date.now() - startedAt);
    const status = error?.status ?? "error";
    const reason = cleanText(error?.reason || error?.message || String(error), 500);
    console.warn(`Flashcard AI failure provider=${provider} model=${model.id} status=${status} reason=${reason} duration=${durationMs}ms hedged=${hedged}`);
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

async function runFlashcardProvidersHedged(env, candidates, systemPrompt, userPrompt) {
  if (!candidates.length) throw new Error("Nenhum provedor de IA disponível");
  if (candidates.length === 1) return attemptFlashcardModel(env, candidates[0], systemPrompt, userPrompt);

  let fallbackStarted = false;
  let timer = null;
  let startFallback;
  const fallbackPromise = new Promise((resolve, reject) => {
    startFallback = () => {
      if (fallbackStarted) return;
      fallbackStarted = true;
      if (timer) clearTimeout(timer);
      attemptFlashcardModel(env, candidates[1], systemPrompt, userPrompt, { hedged: true }).then(resolve, reject);
    };
    timer = setTimeout(startFallback, FLASHCARD_HEDGE_DELAY_MS);
  });

  const primaryPromise = attemptFlashcardModel(env, candidates[0], systemPrompt, userPrompt).catch(error => {
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
    const { success } = await env.AI_RATE_LIMITER.limit({ key: `${user.id}:flashcard` });
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
  const candidates = flashcardCandidateChain(requested);
  const systemPrompt = `Você é um elaborador especialista de flashcards para concursos públicos brasileiros, com foco em aprendizagem ativa e recuperação ativa. Gere exatamente UM novo flashcard usando EXCLUSIVAMENTE fatos presentes no TRECHO-FONTE. A pergunta deve ser autossuficiente, clara, tecnicamente precisa e útil para recuperação ativa. Priorize, conforme o conteúdo permitir: regra e exceção; requisito; prazo; competência; conceito; consequência jurídica; distinção; condição; vedação; número ou literalidade relevante. A resposta deve responder diretamente à pergunta, sem introduções, sem inventar informação e preservando ressalvas essenciais. NÃO repita nem parafraseie de modo trivial perguntas anteriores. Quando houver perguntas anteriores, explore OUTRO ângulo factual do mesmo trecho. raciocine silenciosamente em cinco etapas e critique a pergunta antes de devolver: (1) a resposta está integralmente sustentada pelo trecho? (2) a pergunta é específica? (3) há apenas um núcleo de cobrança? (4) pergunta e resposta são diferentes das anteriores? Se qualquer resposta for não, reescreva. Retorne somente JSON válido no formato {"question":"...","answer":"..."}.`;
  const avoid = previousQuestions.length ? previousQuestions.map((q,i)=>`${i+1}. ${q}`).join("\n") : "nenhuma";
  const userPrompt = `GERAÇÃO: ${generationIndex}\nMATÉRIA (contexto opcional): ${materia || "não informada"}\nASSUNTO (contexto opcional): ${assunto || "não informado"}\nPERGUNTA ATUAL A NÃO REPETIR: ${existingQuestion || "nenhuma"}\nPERGUNTAS JÁ GERADAS A NÃO REPETIR NEM PARAFRASEAR:\n${avoid}\n\nTRECHO-FONTE — única fonte de verdade:\n${text}`;
  try {
    const result = await runFlashcardProvidersHedged(env, candidates, systemPrompt, userPrompt);
    const preferredKey = requested === "auto" ? candidates[0] : requested;
    const fallbackUsed = result.key !== preferredKey;
    console.info(`Flashcard AI selected provider=${result.provider} model=${result.model.id} duration=${result.durationMs}ms fallback=${fallbackUsed} hedged=${result.hedged}`);
    return json({ question: result.question, answer: result.answer, model: `${result.providerLabel} · ${result.model.label}`, provider: result.provider, modelKey: result.key, fallbackUsed, hedged: result.hedged, latencyMs: result.durationMs });
  } catch (aggregate) {
    const errors = Array.isArray(aggregate?.causes) ? aggregate.causes.map(error => {
      const telemetry = error?.flashcardTelemetry;
      return telemetry ? `${telemetry.model}: ${telemetry.reason}` : cleanText(error?.message || String(error), 500);
    }) : [cleanText(aggregate?.message || String(aggregate), 500)];
    console.warn("Flashcard AI external providers exhausted; using deterministic local fallback", errors);
  }
  const localStartedAt = Date.now();
  const local = buildDeterministicFlashcard({ text, materia, assunto, generationIndex, previousQuestions, existingQuestion });
  const localDurationMs = Date.now() - localStartedAt;
  console.info(`Flashcard AI success provider=local-deterministic model=local duration=${localDurationMs}ms hedged=false fallback=true`);
  return json({ question: local.question, answer: local.answer, model: "Gerador local · sem IA", provider: "local-deterministic", modelKey: "local", fallbackUsed: true, deterministic: true, hedged: false, latencyMs: localDurationMs });
}


export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && CORE_NO_STORE_PATHS.has(url.pathname)) {
      const assetResponse = await env.ASSETS.fetch(request);
      const headers = new Headers(assetResponse.headers);
      headers.set("cache-control", "no-cache, no-store, must-revalidate");
      headers.set("pragma", "no-cache");
      headers.set("expires", "0");
      headers.set("x-app-version", APP_VERSION);
      return new Response(assetResponse.body, { status:assetResponse.status, statusText:assetResponse.statusText, headers });
    }

    const vendorRoute = VENDOR_ROUTES[url.pathname];
    if (vendorRoute && request.method === "GET") {
      return serveVendorAsset(request, vendorRoute);
    }

    if (url.pathname === "/api/ai/analisar-edital") {
      if (request.method !== "POST") {
        return json({ error: "Método não permitido." }, 405);
      }
      return analyzeEdital(request, env);
    }

    if (url.pathname === "/api/ai/flashcard") {
      if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
      return generateFlashcard(request, env);
    }


    return env.ASSETS.fetch(request);
  }
};


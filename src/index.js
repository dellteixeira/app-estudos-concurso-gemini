// Universal Parser V8.4: o backend recebe matéria/assunto já bloqueados pelo frontend.
const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const FLASHCARD_AI_MODELS = Object.freeze({
  gemini: { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" },
  gemma: { id: "@cf/google/gemma-4-26b-a4b-it", label: "Gemma 4 26B" },
  nemotron: { id: "@cf/nvidia/nemotron-3-120b-a12b", label: "Nemotron 3 120B" },
  glm: { id: "@cf/zai-org/glm-4.7-flash", label: "GLM-4.7 Flash" },
  llama: { id: "@cf/meta/llama-3.1-8b-instruct-fast", label: "Llama 3.1 8B Fast", legacyLabel: "Workers AI · Llama 3.1 8B" }
});
const FLASHCARD_AUTO_CHAIN = ["gemini", "llama"];
const MAX_TEXT_CHARS = 110000;
const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_MATERIAS = 120;
const MAX_TOPICS_TOTAL = 5000;
const MAX_MATERIA_CHARS = 180;
const MAX_ASSUNTO_CHARS = 1200;

const APP_VERSION = "10.25.2";
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

async function runGeminiFlashcard(env, model, systemPrompt, userPrompt) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.id)}:generateContent`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 600,
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
    if (error?.name === "AbortError") throw new Error("Gemini excedeu o limite de 4 segundos");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const detail = cleanText(await response.text(), 500);
    throw new Error(`Gemini HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map(part => part?.text || "").join("") || "";
  const parsed = extractFirstJsonObject(text);
  if (!parsed?.question || !parsed?.answer) throw new Error("Resposta incompleta do Gemini");
  return parsed;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} excedeu o limite de ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
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
  const candidates = requested === "auto" ? FLASHCARD_AUTO_CHAIN : [requested];
  const systemPrompt = `Você é um elaborador especialista de flashcards para concursos públicos brasileiros, com foco em aprendizagem ativa e recuperação ativa. Gere exatamente UM novo flashcard usando EXCLUSIVAMENTE fatos presentes no TRECHO-FONTE. A pergunta deve ser autossuficiente, clara, tecnicamente precisa e útil para recuperação ativa. Priorize, conforme o conteúdo permitir: regra e exceção; requisito; prazo; competência; conceito; consequência jurídica; distinção; condição; vedação; número ou literalidade relevante. A resposta deve responder diretamente à pergunta, sem introduções, sem inventar informação e preservando ressalvas essenciais. NÃO repita nem parafraseie de modo trivial perguntas anteriores. Quando houver perguntas anteriores, explore OUTRO ângulo factual do mesmo trecho. raciocine silenciosamente em cinco etapas e critique a pergunta antes de devolver: (1) a resposta está integralmente sustentada pelo trecho? (2) a pergunta é específica? (3) há apenas um núcleo de cobrança? (4) pergunta e resposta são diferentes das anteriores? Se qualquer resposta for não, reescreva. Retorne somente JSON válido no formato {"question":"...","answer":"..."}.`;
  const avoid = previousQuestions.length ? previousQuestions.map((q,i)=>`${i+1}. ${q}`).join("\n") : "nenhuma";
  const userPrompt = `GERAÇÃO: ${generationIndex}\nMATÉRIA (contexto opcional): ${materia || "não informada"}\nASSUNTO (contexto opcional): ${assunto || "não informado"}\nPERGUNTA ATUAL A NÃO REPETIR: ${existingQuestion || "nenhuma"}\nPERGUNTAS JÁ GERADAS A NÃO REPETIR NEM PARAFRASEAR:\n${avoid}\n\nTRECHO-FONTE — única fonte de verdade:\n${text}`;
  const errors = [];
  for (let index = 0; index < candidates.length; index++) {
    const key = candidates[index];
    const model = FLASHCARD_AI_MODELS[key];
    try {
      const parsed = model.provider === "gemini"
        ? await runGeminiFlashcard(env, model, systemPrompt, userPrompt)
        : parseFlashcardAIResponse(await withTimeout(env.AI.run(model.id, { messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.1, max_tokens: 700 }), 2500, model.label));
      const question = cleanText(parsed?.question, 500), answer = cleanText(parsed?.answer, 4000);
      if (!question || !answer) throw new Error("Resposta incompleta da IA");
      return json({ question, answer, model: `${model.provider === "gemini" ? "Google Gemini" : "Workers AI"} · ${model.label}`, modelKey: key, fallbackUsed: requested === "auto" && index > 0 });
    } catch (error) {
      errors.push(`${model.label}: ${error?.message || error}`);
      console.warn("Flashcard AI model failed", model.id, error);
    }
  }
  console.error("Flashcard AI exhausted candidates", errors);
  return json({ error: "Não foi possível gerar a pergunta com IA agora. O modo manual continua disponível." }, 503);
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


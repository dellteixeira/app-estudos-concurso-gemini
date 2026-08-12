const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const MAX_TEXT_CHARS = 110000;

const prioritySchema = {
  type: "object",
  properties: {
    materias: {
      type: "array",
      items: {
        type: "object",
        properties: {
          materia: { type: "string" },
          prioridade: { type: "integer", minimum: 1, maximum: 3 },
          peso: { type: "number", minimum: 0 }
        },
        required: ["materia", "prioridade", "peso"]
      }
    }
  },
  required: ["materias"]
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
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

  for (const item of items) {
    const materia = String(item?.materia || "").trim();
    if (!materia) continue;

    const assuntos = [];
    const topicSeen = new Set();
    for (const value of (Array.isArray(item?.assuntos) ? item.assuntos : [])) {
      const assunto = String(value || "").trim();
      const key = fold(assunto);
      if (!assunto || topicSeen.has(key)) continue;
      topicSeen.add(key);
      assuntos.push(assunto);
    }
    if (!assuntos.length) continue;

    const key = fold(materia);
    if (seen.has(key)) continue;
    seen.add(key);

    clean.push({
      materia,
      prioridade: Math.min(3, Math.max(1, Number.parseInt(item?.prioridade, 10) || 2)),
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
      prioridade: Math.min(3, Math.max(1, Number.parseInt(item?.prioridade, 10) || 2)),
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
  const user = await authenticateSupabaseUser(request, env);
  if (!user?.id) return json({ error: "Sessão inválida ou expirada." }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Corpo JSON inválido." }, 400);
  }

  const concurso = String(body?.concurso || "").trim();
  const banca = String(body?.banca || "").trim();
  const fileName = String(body?.fileName || "Edital.pdf").trim();
  const cargoLabel = String(body?.cargo?.label || body?.cargo || "").trim();
  const rawText = String(body?.text || "").trim();
  const lockedMaterias = sanitizeLockedMaterias(body?.lockedMaterias);

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
7. Sua única tarefa é atribuir prioridade 1, 2 ou 3 e peso numérico às matérias usando SOMENTE sinais existentes no edital recebido.
8. Se o texto não permitir diferenciar, use prioridade 2.
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
    analysis: {
      concurso,
      materias: finalMaterias
    },
    model: MODEL,
    aiUsed,
    extractionLocked: true
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ai/analisar-edital") {
      if (request.method !== "POST") {
        return json({ error: "Método não permitido." }, 405);
      }
      return analyzeEdital(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

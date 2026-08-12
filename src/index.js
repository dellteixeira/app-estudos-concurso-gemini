const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const MAX_TEXT_CHARS = 110000;

const editalSchema = {
  type: "object",
  properties: {
    concurso: { type: "string" },
    materias: {
      type: "array",
      items: {
        type: "object",
        properties: {
          materia: { type: "string" },
          prioridade: { type: "integer", minimum: 1, maximum: 3 },
          peso: { type: "number", minimum: 0 },
          assuntos: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["materia", "prioridade", "peso", "assuntos"]
      }
    }
  },
  required: ["concurso", "materias"]
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


function foldLabel(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isAdministrativeMateriaName(value) {
  const name = foldLabel(value);
  if (!name) return true;

  const exactOrStarts = [
    "disposicoes preliminares", "das disposicoes preliminares", "dos cargos",
    "das inscricoes", "da inscricao", "inscricoes para candidatos",
    "candidatos com deficiencia", "candidatos negros", "candidatos indigenas",
    "candidatos quilombolas", "das provas", "da prestacao das provas",
    "prestacao das provas", "dos recursos", "resultado", "do resultado",
    "classificacao", "da classificacao", "nomeacao", "da nomeacao",
    "cronograma", "isencao", "atendimento especial", "conteudo programatico",
    "conteudos programaticos", "programa de provas"
  ];

  return exactOrStarts.some(term => name === term || name.startsWith(`${term} `));
}

function isGenericMateriaName(value) {
  const name = foldLabel(value).replace(/[:;.-]+$/g, "").trim();
  return [
    "conhecimentos", "conhecimentos gerais", "conhecimentos especificos",
    "direito", "legislacao", "nocao de direito", "nocoes de direito",
    "programa", "conteudo programatico", "conteudos programaticos"
  ].includes(name);
}

function looksLikeDisciplineName(value) {
  const name = foldLabel(value);
  const patterns = [
    "lingua portuguesa", "redacao", "raciocinio logico", "matematica", "informatica",
    "direito constitucional", "direito administrativo", "direito civil", "direito penal",
    "direito processual civil", "direito processual penal", "direito do trabalho",
    "direito processual do trabalho", "direito tributario", "direito financeiro",
    "direito previdenciario", "direito eleitoral", "direito empresarial", "direito ambiental",
    "direitos humanos", "administracao publica", "contabilidade", "auditoria", "arquivologia",
    "estatistica", "economia", "legislacao especifica", "organizacao judiciaria"
  ];
  return patterns.some(p => name === p || name.startsWith(p + " "));
}

function analysisNeedsRepair(analysis) {
  const materias = Array.isArray(analysis?.materias) ? analysis.materias : [];
  if (!materias.length) return true;

  let generic = 0;
  let disciplineNamesAsTopics = 0;
  let totalTopics = 0;
  for (const item of materias) {
    if (isGenericMateriaName(item?.materia)) generic++;
    const assuntos = Array.isArray(item?.assuntos) ? item.assuntos : [];
    totalTopics += assuntos.length;
    disciplineNamesAsTopics += assuntos.filter(looksLikeDisciplineName).length;
  }

  // Sinais inequívocos do erro observado: "Direito" como matéria ou nomes
  // de disciplinas aparecendo como assuntos, além de baixa densidade temática.
  return generic > 0 || disciplineNamesAsTopics >= 2 || totalTopics < materias.length * 2;
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

  // Primeiro tenta o conteúdo inteiro.
  try {
    return JSON.parse(source);
  } catch {}

  // Fallback defensivo: localiza o primeiro objeto JSON balanceado,
  // respeitando strings e caracteres escapados.
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        const candidate = source.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          start = -1;
        }
      }
    }
  }

  return null;
}

function parseStructuredAIResponse(result) {
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
      // Objeto já estruturado no formato esperado.
      if (Array.isArray(candidate.materias)) return candidate;

      // Alguns envelopes podem conter o objeto em outra chave.
      if (candidate.analysis && typeof candidate.analysis === "object") {
        if (Array.isArray(candidate.analysis.materias)) return candidate.analysis;
      }

      // Evita JSON.stringify de objetos muito complexos quando não necessário.
      continue;
    }

    if (typeof candidate === "string") {
      const parsed = extractFirstJsonObject(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        if (Array.isArray(parsed.materias)) return parsed;
        if (parsed.analysis && Array.isArray(parsed.analysis.materias)) return parsed.analysis;
      }
    }
  }

  return null;
}

function sanitizeAnalysis(analysis) {
  const materias = Array.isArray(analysis?.materias) ? analysis.materias : [];
  const clean = materias
    .filter(item => !isAdministrativeMateriaName(item?.materia) && !isGenericMateriaName(item?.materia))
    .map(item => ({
      materia: String(item?.materia || "").trim(),
      prioridade: Math.min(3, Math.max(1, Number.parseInt(item?.prioridade, 10) || 2)),
      peso: Number.isFinite(Number(item?.peso)) && Number(item?.peso) >= 0 ? Number(item.peso) : 1.0,
      assuntos: Array.isArray(item?.assuntos)
        ? [...new Set(item.assuntos.map(v => String(v || "").trim()).filter(Boolean))]
        : []
    }))
    .filter(item => item.materia && item.assuntos.length > 0);

  return {
    concurso: String(analysis?.concurso || "").trim(),
    materias: clean
  };
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
  const rawText = String(body?.text || "").trim();

  if (rawText.length < 500) {
    return json({ error: "Texto do edital insuficiente para análise." }, 400);
  }

  if (rawText.length > MAX_TEXT_CHARS) {
    return json({ error: "Recorte do edital excedeu o limite de segurança desta versão. O Painel deve reduzir automaticamente o texto antes do envio." }, 413);
  }

  const systemPrompt = `
Você é um especialista em verticalização de editais de concursos públicos brasileiros.

OBJETIVO ÚNICO:
Ler APENAS o conteúdo programático/disciplinas da prova e transformá-lo em matérias de estudo e assuntos do edital verticalizado.

NÃO CONFUNDA CAPÍTULOS ADMINISTRATIVOS DO EDITAL COM DISCIPLINAS.
É TERMINANTEMENTE PROIBIDO criar matérias como:
- Disposições Preliminares
- Dos Cargos
- Das Inscrições
- Candidatos com Deficiência
- Candidatos Negros, Indígenas ou Quilombolas
- Das Provas
- Da Prestação das Provas
- Recursos
- Resultado
- Classificação
- Nomeação
- Cronograma
- Isenção
- Atendimento Especial
- Conteúdo Programático (isto é apenas um título de seção, nunca uma matéria)
- qualquer outro título meramente administrativo do edital.

Considere como matéria somente disciplina/conhecimento exigido para estudo, por exemplo:
Língua Portuguesa, Raciocínio Lógico, Informática, Direito Constitucional, Direito Administrativo, Direito Civil, Direito Penal, Direito Processual Civil, Direito Processual Penal, Direito do Trabalho, legislação específica, conhecimentos especializados etc., conforme EXISTIREM no texto recebido.

REGRAS DE HIERARQUIA (CRÍTICAS):
1. A matéria deve ser a DISCIPLINA ESPECÍFICA. Exemplos corretos: "Direito Penal", "Direito Constitucional", "Direito Administrativo".
2. NUNCA use cabeçalhos agrupadores como matéria: "Direito", "Conhecimentos", "Conhecimentos Gerais", "Conhecimentos Específicos" ou "Legislação" quando o texto contiver disciplinas específicas abaixo deles.
3. NUNCA coloque nomes de disciplinas dentro de "assuntos". Exemplo ERRADO: matéria "Direito" com assuntos ["Direito Penal", "Direito Constitucional"].
4. Em "assuntos", coloque os CONTEÚDOS A ESTUDAR pertencentes à disciplina. Exemplo: matéria "Direito Penal" → ["Aplicação da lei penal", "Crimes contra a pessoa", "Crimes contra a Administração Pública", ...], somente se esses itens estiverem no texto recebido.
5. Preserve os nomes das disciplinas e dos assuntos conforme o edital.
6. Extraia TODOS os assuntos efetivamente listados no conteúdo programático das disciplinas encontradas no recorte; não resuma uma disciplina inteira em um único rótulo genérico.
7. Não invente assunto, disciplina, lei, súmula, jurisprudência ou peso.
8. Se o edital informar número de questões, pontuação ou peso da disciplina, use isso para definir o campo "peso".
9. Se o edital NÃO informar peso, use 1.0.
10. prioridade: 1 = alta, 2 = média, 3 = baixa.
11. A prioridade deve usar apenas dados do edital recebido: peso, quantidade de questões, pontuação, extensão e especificidade para o cargo.
12. Se não houver informação suficiente para diferenciar prioridades, use 2.
13. Os assuntos devem ser ordenados do mais relevante para o menos relevante segundo os sinais existentes no edital.
14. NÃO alegue que um assunto é "mais cobrado pela banca" sem dados históricos fornecidos na entrada.
15. O histórico da banca NÃO está disponível nesta Fase 1. Portanto não invente frequência histórica.
16. Se o recorte contiver apenas regras administrativas e nenhum conteúdo programático real, retorne "materias": [].
17. Retorne SOMENTE JSON válido no schema solicitado, sem comentários e sem Markdown.

Formato lógico obrigatório:
{
  "concurso": "Nome do Concurso",
  "materias": [
    {
      "materia": "Nome da Matéria",
      "prioridade": 1,
      "peso": 2.0,
      "assuntos": [
        "Assunto 1",
        "Assunto 2"
      ]
    }
  ]
}
`;

  const userPrompt = `
Analise o edital/conteúdo programático abaixo.

Concurso atual no Painel: ${concurso || "não informado"}
Banca informada: ${banca || "não informada"}
Arquivo: ${fileName}

ATENÇÃO: localize o conteúdo programático REAL das disciplinas. Ignore sumário, capítulos administrativos, inscrições, cotas, regras de prova e demais seções que não sejam conteúdo de estudo.

RECORTE DO EDITAL:
${rawText}
`;

  try {
    const runModel = async (messages) => {
      const result = await env.AI.run(MODEL, {
        messages,
        response_format: {
          type: "json_schema",
          json_schema: editalSchema
        },
        temperature: 0,
        max_tokens: 12000
      });
      return parseStructuredAIResponse(result);
    };

    let rawAnalysis = await runModel([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]);

    if (!rawAnalysis || !Array.isArray(rawAnalysis.materias)) {
      return json({ error: "O modelo não retornou um JSON estruturado válido com matérias e assuntos." }, 502);
    }

    // Segunda passagem automática somente quando a primeira resposta apresenta
    // o erro de hierarquia detectado no teste real (ex.: matéria "Direito" com
    // "Direito Penal" como assunto). A reparação usa o MESMO texto do edital;
    // não acrescenta conhecimento externo.
    let repaired = false;
    if (analysisNeedsRepair(rawAnalysis)) {
      const repairPrompt = `
A resposta anterior apresentou hierarquia inadequada ou poucos assuntos.
REFAÇA A EXTRAÇÃO DO ZERO usando APENAS o recorte original abaixo.

Regras obrigatórias:
- cada matéria deve ser uma disciplina específica (ex.: Direito Penal);
- "Direito", "Conhecimentos", "Conhecimentos Gerais" e "Conhecimentos Específicos" são agrupadores, NÃO matérias;
- nomes de disciplinas jamais podem aparecer como assuntos;
- assuntos devem ser os tópicos efetivos listados depois/debaixo de cada disciplina;
- extraia todos os tópicos explicitamente presentes no recorte, sem inventar e sem resumir demais;
- retorne somente o JSON do schema.

RECORTE ORIGINAL:
${rawText}`;

      const second = await runModel([
        { role: "system", content: systemPrompt },
        { role: "user", content: repairPrompt }
      ]);
      if (second && Array.isArray(second.materias)) {
        rawAnalysis = second;
        repaired = true;
      }
    }

    const analysis = sanitizeAnalysis(rawAnalysis);
    if (!analysis.materias.length) {
      return json({ error: "A IA não conseguiu separar disciplinas específicas e seus assuntos. O resultado foi bloqueado para evitar importação incorreta." }, 422);
    }

    return json({ analysis, model: MODEL, repaired });
  } catch (error) {
    console.error("Workers AI error", error);
    return json({ error: "Não foi possível concluir a análise no Workers AI." }, 502);
  }
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

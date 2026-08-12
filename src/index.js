const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const MAX_TEXT_CHARS = 90000;

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
    return json({ error: "Recorte do edital excedeu o limite de segurança desta versão." }, 413);
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

REGRAS:
1. Preserve os nomes das disciplinas e dos assuntos conforme o edital.
2. Extraia TODOS os assuntos efetivamente listados no conteúdo programático das disciplinas encontradas no recorte.
3. Não invente assunto, disciplina, lei, súmula, jurisprudência ou peso.
4. Se o edital informar número de questões, pontuação ou peso da disciplina, use isso para definir o campo "peso".
5. Se o edital NÃO informar peso, use 1.0.
6. prioridade: 1 = alta, 2 = média, 3 = baixa.
7. A prioridade deve usar apenas dados do edital recebido: peso, quantidade de questões, pontuação, extensão e especificidade para o cargo.
8. Se não houver informação suficiente para diferenciar prioridades, use 2.
9. Os assuntos devem ser ordenados do mais relevante para o menos relevante segundo os sinais existentes no edital.
10. NÃO alegue que um assunto é "mais cobrado pela banca" sem dados históricos fornecidos na entrada.
11. O histórico da banca NÃO está disponível nesta Fase 1. Portanto não invente frequência histórica.
12. Se o recorte contiver apenas regras administrativas e nenhum conteúdo programático real, retorne "materias": [].
13. Retorne SOMENTE JSON válido no schema solicitado, sem comentários e sem Markdown.

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
    const result = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: editalSchema
      },
      temperature: 0,
      max_tokens: 12000
    });

    const analysis = result?.response ?? result;

    if (!analysis || typeof analysis !== "object") {
      return json({ error: "O modelo não retornou um JSON estruturado válido." }, 502);
    }

    if (!Array.isArray(analysis.materias)) {
      return json({ error: "A resposta da IA não contém a lista de matérias esperada." }, 502);
    }

    return json({ analysis, model: MODEL });
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

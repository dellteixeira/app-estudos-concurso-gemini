const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const MAX_TEXT_CHARS = 90000;

const editalSchema = {
  type: "object",
  properties: {
    concurso: { type: "string" },
    banca: { type: "string" },
    cargo: { type: "string" },
    criterio_prioridade: { type: "string" },
    materias: {
      type: "array",
      items: {
        type: "object",
        properties: {
          materia: { type: "string" },
          prioridade: { type: "integer", minimum: 1, maximum: 3 },
          assuntos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                assunto: { type: "string" },
                prioridade: { type: "integer", minimum: 1, maximum: 3 }
              },
              required: ["assunto", "prioridade"]
            }
          }
        },
        required: ["materia", "prioridade", "assuntos"]
      }
    }
  },
  required: ["concurso", "banca", "cargo", "criterio_prioridade", "materias"]
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

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      authorization,
      apikey: env.SUPABASE_ANON_KEY
    }
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function analyzeEdital(request, env) {
  const user = await authenticateSupabaseUser(request, env);

  if (!user?.id) {
    return json(
      {
        error: "Sessão inválida ou expirada."
      },
      401
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        error: "Corpo JSON inválido."
      },
      400
    );
  }

  const concurso = String(body?.concurso || "").trim();
  const fileName = String(body?.fileName || "Edital.pdf").trim();
  const rawText = String(body?.text || "").trim();

  if (rawText.length < 500) {
    return json(
      {
        error: "Texto do edital insuficiente para análise."
      },
      400
    );
  }

  if (rawText.length > MAX_TEXT_CHARS) {
    return json(
      {
        error: "Recorte do edital excedeu o limite de segurança desta versão."
      },
      413
    );
  }

  const systemPrompt = `
Você é um analisador de editais de concursos públicos brasileiros.

Sua tarefa é EXTRAIR e ORGANIZAR o conteúdo programático fornecido,
sem inventar disciplinas, assuntos, leis, pesos ou exigências que
não estejam sustentados pelo texto recebido.

Regras obrigatórias:

1. Preserve, sempre que possível, a terminologia literal do edital
   para nomes de matérias e assuntos.

2. Identifique concurso, banca e cargo somente quando houver
   evidência no recorte.

   Se não houver, use string vazia, exceto concurso, que pode usar
   o nome de contexto fornecido.

3. Agrupe tópicos sob a disciplina correta e elimine duplicidades
   evidentes.

4. Não transforme instruções administrativas, cronogramas,
   documentos de inscrição ou regras de recursos em matérias
   de estudo.

5. Prioridade da matéria e do assunto:

   1 = alta
   2 = média
   3 = baixa

6. Nesta Fase 1, a prioridade deve ser estimada SOMENTE por sinais
   internos do edital, como:

   - peso ou pontuação explícita;
   - quantidade e centralidade do conteúdo;
   - especificidade para o cargo;
   - estrutura da prova.

   NÃO alegue frequência histórica da banca.

   NÃO use conhecimento externo para inventar incidência.

7. Se o edital não trouxer pesos ou sinais suficientes,
   use prioridade 2, evitando falsa precisão.

8. Retorne somente a estrutura JSON exigida pelo schema.
`;

  const userPrompt = `
Concurso atual no Painel:
${concurso || "não informado"}

Arquivo:
${fileName}

RECORTE DO EDITAL
(com marcações de páginas):

${rawText}
`;

  try {
    const result = await env.AI.run(MODEL, {
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],

      response_format: {
        type: "json_schema",
        json_schema: editalSchema
      },

      temperature: 0.1,

      max_tokens: 10000
    });

    const analysis = result?.response ?? result;

    if (!analysis || typeof analysis !== "object") {
      return json(
        {
          error:
            "O modelo não retornou uma análise estruturada válida."
        },
        502
      );
    }

    return json({
      analysis,
      model: MODEL
    });

  } catch (error) {
    console.error("Workers AI error", error);

    const message = String(
      error?.message ||
      error ||
      "Erro desconhecido"
    );

    if (message.toLowerCase().includes("json mode")) {
      return json(
        {
          error:
            "A IA não conseguiu cumprir o formato estruturado nesta tentativa. Tente novamente."
        },
        502
      );
    }

    return json(
      {
        error:
          "Não foi possível concluir a análise no Workers AI."
      },
      502
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ai/analisar-edital") {

      if (request.method !== "POST") {
        return json(
          {
            error: "Método não permitido."
          },
          405
        );
      }

      return analyzeEdital(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

import fs from 'node:fs';

const indexPath='src/index.js';
let source=fs.readFileSync(indexPath,'utf8');

const start=source.indexOf('async function runGeminiFlashcard(env, model, systemPrompt, userPrompt) {');
const end=source.indexOf('\nfunction withTimeout(promise, ms, label) {', start);
if(start<0||end<0) throw new Error('Bloco runGeminiFlashcard não encontrado');

const replacement=`function isValidFlashcardObject(value) {
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
    .replace(/([{,]\\s*)(question|answer)\\s*:/gi, '$1"$2":')
    .replace(/,\\s*([}\\]])/g, '$1')
    .trim();

  if (relaxed.startsWith('{') && !relaxed.endsWith('}')) relaxed += '}';
  const normalized = extractFirstJsonObject(relaxed);
  if (isValidFlashcardObject(normalized)) return { flashcard: normalized, mode: "relaxed-json" };

  const readField = field => {
    const doubleQuoted = relaxed.match(new RegExp('(?:["\\\\\']?'+field+'["\\\\\']?)\\\\s*:\\s*"((?:\\\\\\\\.|[^"\\\\\\\\])*)"', 'i'));
    if (doubleQuoted) {
      try { return JSON.parse('"' + doubleQuoted[1] + '"'); } catch { return doubleQuoted[1]; }
    }
    const singleQuoted = relaxed.match(new RegExp("(?:[\\\"']?"+field+"[\\\"']?)\\\\s*:\\s*'([^']*)'", 'i'));
    if (singleQuoted) return singleQuoted[1];
    const plain = relaxed.match(new RegExp('(?:^|[\\\\n,{])\\\\s*["\\\\\']?'+field+'["\\\\\']?\\\\s*:\\s*([^\\\\n}]+)', 'i'));
    return plain ? plain[1].replace(/,\\s*$/, '').trim() : '';
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
      const recovered = recoverGeminiFlashcardText(texts.join('\\n'));
      if (recovered) return { ...recovered, candidateIndex };
    }
  }
  return null;
}

async function runGeminiFlashcard(env, model, systemPrompt, userPrompt) {
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
  console.info(\`Flashcard Gemini response model=\${model.id} status=200 candidates=\${summary.candidates} parts=\${summary.parts} textParts=\${summary.textParts} textChars=\${summary.textChars} finishReasons=\${summary.finishReasons}\`);

  const recovered = parseGeminiFlashcardPayload(payload);
  if (!recovered?.flashcard) {
    const parseError = new Error("Resposta incompleta do Gemini");
    parseError.provider = "gemini";
    parseError.model = model.id;
    parseError.status = 200;
    parseError.reason = \`incomplete JSON response finishReasons=\${summary.finishReasons} candidates=\${summary.candidates} textParts=\${summary.textParts} textChars=\${summary.textChars}\`;
    parseError.durationMs = Date.now() - startedAt;
    throw parseError;
  }

  if (recovered.mode !== "json" || recovered.candidateIndex > 0) {
    console.info(\`Flashcard Gemini recovered model=\${model.id} mode=\${recovered.mode} candidate=\${recovered.candidateIndex} finishReasons=\${summary.finishReasons}\`);
  }
  return recovered.flashcard;
}
`;

source=source.slice(0,start)+replacement+source.slice(end);
source=source.replace('const APP_VERSION = "10.25.5";','const APP_VERSION = "10.25.6";');
fs.writeFileSync(indexPath,source);

for (const path of ['package.json','public/version.json','public/sw.js']) {
  let text=fs.readFileSync(path,'utf8');
  text=text.replaceAll('10.25.5','10.25.6');
  fs.writeFileSync(path,text);
}

for (const name of fs.readdirSync('tests').filter(name=>name.endsWith('.test.cjs'))) {
  const path='tests/'+name;
  let text=fs.readFileSync(path,'utf8');
  if (text.includes('10.25.5')) {
    text=text.replaceAll('10.25.5','10.25.6');
    fs.writeFileSync(path,text);
  }
}

const testPath='tests/v10-25-6-gemini-parser.test.cjs';
fs.writeFileSync(testPath,`const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const worker=fs.readFileSync('src/index.js','utf8');

test('v10.25.6 percorre múltiplos candidates e parts do Gemini',()=>{
  assert.match(worker,/function parseGeminiFlashcardPayload\\(payload\\)/);
  assert.match(worker,/for \\(let candidateIndex = 0; candidateIndex < candidates\\.length; candidateIndex\\+\\+\\)/);
  assert.match(worker,/texts\\.join\\('\\\\n'\\)/);
});

test('v10.25.6 recupera JSON simples malformado sem inventar conteúdo',()=>{
  assert.match(worker,/function recoverGeminiFlashcardText\\(value\\)/);
  assert.match(worker,/mode: "relaxed-json"/);
  assert.match(worker,/mode: "field-recovery"/);
  assert.match(worker,/isValidFlashcardObject/);
});

test('v10.25.6 registra estrutura segura e finishReason sem conteúdo bruto',()=>{
  assert.match(worker,/function summarizeGeminiFlashcardPayload\\(payload\\)/);
  assert.match(worker,/finishReasons=\\$\\{summary\\.finishReasons\\}/);
  assert.match(worker,/textChars=\\$\\{summary\\.textChars\\}/);
  assert.doesNotMatch(worker,/console\\.(?:info|warn)\\([^\\n]*payload\\)/);
});

test('v10.25.6 mantém hedge e fallbacks existentes',()=>{
  assert.match(worker,/FLASHCARD_HEDGE_DELAY_MS = 4500/);
  assert.match(worker,/runFlashcardProvidersHedged/);
  assert.match(worker,/buildDeterministicFlashcard/);
  assert.match(worker,/const APP_VERSION = "10\\.25\\.6"/);
});
`);

const normalWorkflow=`name: Quality Check\n\non:\n  push:\n    branches: [main]\n  pull_request:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n\njobs:\n  test-and-audit:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n      - name: Testes automatizados\n        run: node --test tests/*.test.cjs\n      - name: Auditoria estrutural\n        env:\n          AUDIT_ALLOW_ANY_ROOT: '1'\n        run: node scripts/audit-release.mjs\n`;
fs.writeFileSync('.github/workflows/quality-check.yml',normalWorkflow);
fs.rmSync(new URL(import.meta.url),{force:true});

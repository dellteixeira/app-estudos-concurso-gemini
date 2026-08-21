from pathlib import Path

INDEX = Path('src/index.js')
READER = Path('public/js/pdf/pdf-reader.js')
TEST = Path('tests/v10-25-1-gemini-flashcards.test.cjs')

s = INDEX.read_text(encoding='utf-8')
if 'gemini: { id: "gemini-2.5-flash"' not in s:
    old = '''const FLASHCARD_AI_MODELS = Object.freeze({
  gemma: { id: "@cf/google/gemma-4-26b-a4b-it", label: "Gemma 4 26B" },'''
    new = '''const FLASHCARD_AI_MODELS = Object.freeze({
  gemini: { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" },
  gemma: { id: "@cf/google/gemma-4-26b-a4b-it", label: "Gemma 4 26B" },'''
    assert old in s, 'Bloco FLASHCARD_AI_MODELS não encontrado'
    s = s.replace(old, new, 1)
    old_chain = 'const FLASHCARD_AUTO_CHAIN = ["gemma", "glm", "llama"];'
    new_chain = 'const FLASHCARD_AUTO_CHAIN = ["gemini", "gemma", "glm", "llama"];'
    assert old_chain in s, 'FLASHCARD_AUTO_CHAIN não encontrado'
    s = s.replace(old_chain, new_chain, 1)

    marker = 'async function generateFlashcard(request, env) {'
    helper = '''async function runGeminiFlashcard(env, model, systemPrompt, userPrompt) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.id)}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1600,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: { question: { type: "STRING" }, answer: { type: "STRING" } },
          required: ["question", "answer"]
        }
      }
    })
  });
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

'''
    assert marker in s, 'generateFlashcard não encontrado'
    s = s.replace(marker, helper + marker, 1)

    oldrun = '''      const result = await env.AI.run(model.id, { messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.1, max_tokens: 1600 });
      const parsed = parseFlashcardAIResponse(result);'''
    newrun = '''      const parsed = model.provider === "gemini"
        ? await runGeminiFlashcard(env, model, systemPrompt, userPrompt)
        : parseFlashcardAIResponse(await env.AI.run(model.id, { messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.1, max_tokens: 1600 }));'''
    assert oldrun in s, 'Bloco env.AI.run do flashcard não encontrado'
    s = s.replace(oldrun, newrun, 1)

    oldreturn = 'return json({ question, answer, model: `Workers AI · ${model.label}`, modelKey: key, fallbackUsed: requested === "auto" && index > 0 });'
    newreturn = 'return json({ question, answer, model: `${model.provider === "gemini" ? "Google Gemini" : "Workers AI"} · ${model.label}`, modelKey: key, fallbackUsed: requested === "auto" && index > 0 });'
    assert oldreturn in s, 'Retorno do modelo flashcard não encontrado'
    s = s.replace(oldreturn, newreturn, 1)
    s = s.replace('console.warn("Workers AI flashcard model failed", model.id, error);', 'console.warn("Flashcard AI model failed", model.id, error);', 1)
    s = s.replace('console.error("Workers AI flashcard exhausted candidates", errors);', 'console.error("Flashcard AI exhausted candidates", errors);', 1)
    INDEX.write_text(s, encoding='utf-8')

r = READER.read_text(encoding='utf-8')
if 'Gemini 2.5 Flash — melhor qualidade' not in r:
    old = "const FLASHCARD_AI_MODEL_OPTIONS=[['auto','Automático — recomendado'],['gemma','Gemma 4 26B — equilíbrio'],['nemotron','Nemotron 3 120B — elaborado'],['glm','GLM-4.7 Flash — rápido'],['llama','Llama 3.1 8B Fast — econômico']];"
    new = "const FLASHCARD_AI_MODEL_OPTIONS=[['auto','Automático — Gemini + fallback'],['gemini','Gemini 2.5 Flash — melhor qualidade'],['gemma','Gemma 4 26B — equilíbrio'],['nemotron','Nemotron 3 120B — elaborado'],['glm','GLM-4.7 Flash — rápido'],['llama','Llama 3.1 8B Fast — econômico']];"
    assert old in r, 'FLASHCARD_AI_MODEL_OPTIONS não encontrado'
    READER.write_text(r.replace(old, new, 1), encoding='utf-8')

TEST.write_text("""const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const worker=fs.readFileSync('src/index.js','utf8');
const reader=fs.readFileSync('public/js/pdf/pdf-reader.js','utf8');

test('Gemini é a IA principal dos flashcards com fallback seguro',()=>{
  assert.ok(worker.includes('GEMINI_API_KEY'));
  assert.ok(worker.includes('gemini-2.5-flash'));
  assert.ok(worker.includes('const FLASHCARD_AUTO_CHAIN = [\"gemini\", \"gemma\", \"glm\", \"llama\"]'));
  assert.ok(worker.includes('responseMimeType: \"application/json\"'));
  assert.ok(worker.includes('x-goog-api-key'));
  assert.ok(worker.includes('model.provider === \"gemini\"'));
  assert.ok(reader.includes('Gemini 2.5 Flash'));
  assert.ok(reader.includes('Automático — Gemini + fallback'));
});

test('a chave Gemini não é exposta no frontend',()=>{
  assert.ok(!reader.includes('GEMINI_API_KEY'));
  assert.ok(!reader.includes('x-goog-api-key'));
});
""", encoding='utf-8')

for name in ['.trigger-gemini-final','.noop','.noop2','.noop3','.noop4','.noop5','.noop6']:
    p = Path('docs') / name
    if p.exists():
        p.unlink()

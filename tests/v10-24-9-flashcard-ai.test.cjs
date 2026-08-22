const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const reader=fs.readFileSync('public/js/pdf/pdf-reader.js','utf8');
const worker=fs.readFileSync('src/index.js','utf8');
test('flashcard manual abre sem clipboard',()=>{const open=reader.match(/async function openFlashcardComposer\(\)\{[\s\S]*?\}\nfunction closeFlashcardComposer/)?.[0]||'';assert.match(open,/captureDirectSelection\(\)/);assert.doesNotMatch(open,/ensureSelection\(\)/);assert.doesNotMatch(open,/useClipboardSelection\(\)/);assert.match(open,/modo manual/)});
test('IA é explícita e usa trecho ou resposta manual',()=>{assert.match(reader,/✨ Gerar pergunta com IA/);assert.match(reader,/flashcardDraft\.text\|\|answerEl\?\.value/)});
test('Workers AI mantém parser próprio como fallback do Gemini',()=>{assert.match(worker,/function parseFlashcardAIResponse\(result\)/);assert.match(worker,/model\?\.provider === "gemini"/);assert.match(worker,/runGeminiFlashcard\(env, model, systemPrompt, userPrompt(?:, \{ groundingRetry \})?\)/);assert.match(worker,/parseFlashcardAIResponse\(await withTimeout\(env\.AI\.run\(model\.id/);assert.match(worker,/url\.pathname === "\/api\/ai\/flashcard"/)})
from pathlib import Path
import json
import re
from datetime import datetime, timezone

TARGET_VERSION = '10.25.1'


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'pattern not found: {label}')
    return text.replace(old, new, 1)


version = json.loads(Path('public/version.json').read_text()).get('version')
if version == TARGET_VERSION:
    print('Hotfix already applied.')
    raise SystemExit(0)

p = Path('src/index.js')
s = p.read_text()
s = replace_once(s, 'gemini: { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" },', 'gemini: { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", provider: "gemini" },', 'gemini model')
s = replace_once(s, 'const FLASHCARD_AUTO_CHAIN = ["gemini", "gemma", "glm", "llama"];', 'const FLASHCARD_AUTO_CHAIN = ["gemini", "llama"];', 'auto chain')
s = replace_once(s, 'const APP_VERSION = "10.25.0";', 'const APP_VERSION = "10.25.1";', 'worker version')
s = replace_once(s, 'maxOutputTokens: 1600,', 'maxOutputTokens: 700,', 'gemini output limit')
s = replace_once(s, 'const text = cleanText(body?.text, 12000);', 'const text = cleanText(body?.text, 7000);', 'flashcard input limit')

old = '''async function runGeminiFlashcard(env, model, systemPrompt, userPrompt) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.id)}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({'''
new = '''async function runGeminiFlashcard(env, model, systemPrompt, userPrompt) {
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
      body: JSON.stringify({'''
s = replace_once(s, old, new, 'gemini timeout start')
idx = s.index('async function runGeminiFlashcard')
tail = s[idx:]
old = '''    })
  });
  if (!response.ok) {'''
new = '''      })
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Gemini excedeu o limite de 4 segundos");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {'''
if old not in tail:
    raise SystemExit('pattern not found: gemini timeout close')
s = s[:idx] + tail.replace(old, new, 1)

marker = 'async function generateFlashcard(request, env) {'
helper = '''function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} excedeu o limite de ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

'''
s = replace_once(s, marker, helper + marker, 'timeout helper')
start = s.find('  const systemPrompt = `Você é um especialista sênior em aprendizagem ativa')
end_marker = 'Retorne somente JSON válido no formato {"question":"...","answer":"..."}.`;'
if start < 0:
    raise SystemExit('system prompt start not found')
end = s.find(end_marker, start)
if end < 0:
    raise SystemExit('system prompt end not found')
end += len(end_marker)
s = s[:start] + '  const systemPrompt = `Crie UM flashcard atômico para concurso usando SOMENTE o trecho-fonte. Faça pergunta autossuficiente, específica e sem pistas; preserve regra, exceções, requisitos, números, prazos e termos jurídicos essenciais. Não invente nem complemente fatos. Retorne somente JSON válido no formato {"question":"...","answer":"..."}.`;' + s[end:]
old = 'parseFlashcardAIResponse(await env.AI.run(model.id, { messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.1, max_tokens: 1600 }));'
new = 'parseFlashcardAIResponse(await withTimeout(env.AI.run(model.id, { messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.1, max_tokens: 700 }), 2500, model.label));'
s = replace_once(s, old, new, 'workers timeout')
p.write_text(s)

p = Path('public/js/pdf/pdf-reader.js')
s = p.read_text()
s = replace_once(s, "const FLASHCARD_AI_MODEL_OPTIONS=[['auto','Automático — Gemini + fallback'],['gemini','Gemini 2.5 Flash — melhor qualidade'],['gemma','Gemma 4 26B — equilíbrio'],['nemotron','Nemotron 3 120B — elaborado'],['glm','GLM-4.7 Flash — rápido'],['llama','Llama 3.1 8B Fast — econômico']];", "const FLASHCARD_AI_MODEL_OPTIONS=[['auto','Automático — rápido (Gemini + fallback)'],['gemini','Gemini 2.5 Flash-Lite — mais rápido'],['gemma','Gemma 4 26B — equilíbrio'],['nemotron','Nemotron 3 120B — elaborado'],['glm','GLM-4.7 Flash — rápido'],['llama','Llama 3.1 8B Fast — fallback rápido']];", 'reader model options')
pat = r'async function enhanceFlashcardWithAI\(\)\{.*?\}\n\nasync function openFlashcardComposer'
repl = '''async function enhanceFlashcardWithAI(){if(!flashcardDraft)return;ensureFlashcardAiModelSelector();const statusEl=$('pdfFlashcardAiStatus'),button=$('pdfFlashcardAiButton'),answerEl=$('pdfFlashcardAnswer'),questionEl=$('pdfFlashcardQuestion'),model=$('pdfFlashcardAiModel')?.value||'auto';const source=String(flashcardDraft.text||answerEl?.value||'').replace(/\\s+/g,' ').trim().slice(0,5000);if(!source){if(statusEl)statusEl.textContent='Selecione um trecho no PDF ou escreva o conteúdo-base na resposta antes de gerar com IA.';answerEl?.focus();return}if(statusEl)statusEl.textContent='Gerando flashcard com IA rápida…';if(button)button.disabled=true;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7500);try{const client=core().getSupabaseClient(),{data}=await client.auth.getSession(),token=data?.session?.access_token;if(!token)throw new Error('Sessão indisponível');const response=await fetch('/api/ai/flashcard',{method:'POST',signal:controller.signal,cache:'no-store',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({text:source,existingQuestion:questionEl?.value||'',model,materia:$('pdfFlashcardMateria')?.value||'',assunto:$('pdfFlashcardAssunto')?.value||''})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||`IA indisponível (HTTP ${response.status})`);if(!flashcardDraft)return;if(result.question&&questionEl)questionEl.value=result.question;if(result.answer&&answerEl)answerEl.value=result.answer;if(statusEl)statusEl.textContent=`Gerado · ${result.model||'IA'}${result.fallbackUsed?' · fallback rápido utilizado':''}. Revise antes de salvar.`}catch(e){const msg=e?.name==='AbortError'?'A geração ultrapassou 7,5 s e foi cancelada para não travar o app. Tente novamente.':(e?.message||'Falha de conexão com a IA.');if(statusEl)statusEl.textContent=`Não foi possível gerar com IA agora: ${msg} Você pode continuar criando o flashcard manualmente.`}finally{clearTimeout(timeout);if(button)button.disabled=false}}

async function openFlashcardComposer'''
s2, n = re.subn(pat, repl, s, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'reader patch count={n}')
p.write_text(s2)

p = Path('public/js/pdf/pdf-library-ui.js')
s = p.read_text()
old = "async function activateLibrary(){ensureLibraryViewToggle();applyLibraryViewMode();if(activationPromise)return activationPromise;const now=Date.now();if(now-lastActivationAt<220)return;lastActivationAt=now;activationPromise=initialize(false).finally(()=>{activationPromise=null;ensureLibraryViewToggle();applyLibraryViewMode()});return activationPromise}"
new = "function resetLibraryToGlobalView(){state.scope='global';state.activeWorkspace='';state.activeMateria='';state.activeAssunto='';state.search='';if($('pdfLibraryScope'))$('pdfLibraryScope').value='global';if($('pdfWorkspaceFilter'))$('pdfWorkspaceFilter').value='';if($('pdfMateriaFilter'))$('pdfMateriaFilter').value='';if($('pdfAssuntoFilter'))$('pdfAssuntoFilter').value='';if($('pdfLibrarySearch'))$('pdfLibrarySearch').value=''}\nasync function activateLibrary(){ensureLibraryViewToggle();applyLibraryViewMode();resetLibraryToGlobalView();if(activationPromise)return activationPromise;const now=Date.now();if(now-lastActivationAt<220){render();return}lastActivationAt=now;activationPromise=initialize(false).finally(()=>{activationPromise=null;ensureLibraryViewToggle();applyLibraryViewMode()});return activationPromise}"
s = replace_once(s, old, new, 'library activation')
p.write_text(s)

p = Path('public/sw.js')
s = replace_once(p.read_text(), "const APP_VERSION = '10.25.0';", "const APP_VERSION = '10.25.1';", 'sw version')
p.write_text(s)

p = Path('package.json')
data = json.loads(p.read_text())
data['version'] = TARGET_VERSION
p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

p = Path('public/version.json')
data = json.loads(p.read_text())
data['version'] = TARGET_VERSION
data['build'] = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

p = Path('tests/v10-25-1-gemini-flashcards.test.cjs')
s = p.read_text()
s = s.replace('gemini-2.5-flash', 'gemini-2.5-flash-lite')
s = s.replace('const FLASHCARD_AUTO_CHAIN = ["gemini", "gemma", "glm", "llama"]', 'const FLASHCARD_AUTO_CHAIN = ["gemini", "llama"]')
s = s.replace('Gemini 2.5 Flash', 'Gemini 2.5 Flash-Lite')
s = s.replace('Automático — Gemini + fallback', 'Automático — rápido (Gemini + fallback)')
p.write_text(s)

p = Path('tests/library-activation.test.cjs')
s = p.read_text()
s = s.replace("  assert.match(ui,/activationPromise=initialize\\(false\\)/);", "  assert.match(ui,/resetLibraryToGlobalView\\(\\)/);\n  assert.match(ui,/state\\.scope='global'/);\n  assert.match(ui,/activationPromise=initialize\\(false\\)/);")
s = s.replace("test('reabrir Biblioteca no mesmo concurso preserva filtros e apenas recarrega documentos',()=>{", "test('reabrir Biblioteca sempre volta ao acervo global e recarrega documentos',()=>{")
p.write_text(s)

Path('tests/v10-25-1-ai-library-hotfix.test.cjs').write_text("""const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const worker=fs.readFileSync('src/index.js','utf8');
const reader=fs.readFileSync('public/js/pdf/pdf-reader.js','utf8');
const library=fs.readFileSync('public/js/pdf/pdf-library-ui.js','utf8');

test('IA de flashcard tem caminho rápido e limites rígidos de latência',()=>{
  assert.ok(worker.includes('gemini-2.5-flash-lite'));
  assert.ok(worker.includes('const FLASHCARD_AUTO_CHAIN = ["gemini", "llama"]'));
  assert.ok(worker.includes('controller.abort(), 4000'));
  assert.ok(worker.includes('2500, model.label'));
  assert.ok(reader.includes('controller.abort(),7500'));
  assert.ok(reader.includes('.slice(0,5000)'));
});

test('Biblioteca abre no escopo global sem filtros antigos',()=>{
  assert.ok(library.includes('function resetLibraryToGlobalView()'));
  assert.ok(library.includes("state.scope='global'"));
  assert.ok(library.includes("state.activeWorkspace=''"));
  assert.ok(library.includes('resetLibraryToGlobalView();'));
});
""")

print('Hotfix applied to working tree.')

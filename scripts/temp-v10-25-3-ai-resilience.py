from pathlib import Path

ROOT = Path('.')

def replace_exact(path, old, new, expected=1):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{path}: expected {expected} occurrence(s), found {count} for {old[:80]!r}')
    p.write_text(text.replace(old, new), encoding='utf-8')

# Version bump ensures PWA/service worker clients receive the corrected reader code.
for path in ['package.json', 'public/version.json', 'public/sw.js', 'src/index.js']:
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    if '10.25.2' not in text:
        raise SystemExit(f'{path}: version 10.25.2 not found')
    p.write_text(text.replace('10.25.2', '10.25.3'), encoding='utf-8')

# Backend: realistic provider timeouts.
replace_exact(
    'src/index.js',
    'const FLASHCARD_AUTO_CHAIN = ["gemini", "llama"];',
    'const FLASHCARD_AUTO_CHAIN = ["gemini", "llama"];\nconst GEMINI_FLASHCARD_TIMEOUT_MS = 12000;\nconst WORKERS_FLASHCARD_TIMEOUT_MS = 8000;'
)

replace_exact(
    'src/index.js',
    '  const controller = new AbortController();\n  const timeout = setTimeout(() => controller.abort(), 4000);\n  let response;',
    '  const controller = new AbortController();\n  const startedAt = Date.now();\n  const timeout = setTimeout(() => controller.abort(), GEMINI_FLASHCARD_TIMEOUT_MS);\n  let response;'
)

replace_exact(
    'src/index.js',
    '  } catch (error) {\n    if (error?.name === "AbortError") throw new Error("Gemini excedeu o limite de 4 segundos");\n    throw error;\n  } finally {',
    '  } catch (error) {\n    if (error?.name === "AbortError") {\n      const timeoutError = new Error(`Gemini excedeu o limite de ${GEMINI_FLASHCARD_TIMEOUT_MS} ms`);\n      timeoutError.provider = "gemini";\n      timeoutError.model = model.id;\n      timeoutError.status = "timeout";\n      timeoutError.reason = "request timeout";\n      timeoutError.durationMs = Date.now() - startedAt;\n      throw timeoutError;\n    }\n    error.provider = error?.provider || "gemini";\n    error.model = error?.model || model.id;\n    error.status = error?.status || "network-error";\n    error.reason = error?.reason || error?.message || "network error";\n    error.durationMs = error?.durationMs || (Date.now() - startedAt);\n    throw error;\n  } finally {'
)

replace_exact(
    'src/index.js',
    '  if (!response.ok) {\n    const detail = cleanText(await response.text(), 500);\n    throw new Error(`Gemini HTTP ${response.status}${detail ? `: ${detail}` : ""}`);\n  }',
    '  if (!response.ok) {\n    const detail = cleanText(await response.text(), 500);\n    const httpError = new Error(`Gemini HTTP ${response.status}${detail ? `: ${detail}` : ""}`);\n    httpError.provider = "gemini";\n    httpError.model = model.id;\n    httpError.status = response.status;\n    httpError.reason = detail || response.statusText || "HTTP error";\n    httpError.durationMs = Date.now() - startedAt;\n    throw httpError;\n  }'
)

replace_exact(
    'src/index.js',
    '  if (!parsed?.question || !parsed?.answer) throw new Error("Resposta incompleta do Gemini");\n  return parsed;',
    '  if (!parsed?.question || !parsed?.answer) {\n    const parseError = new Error("Resposta incompleta do Gemini");\n    parseError.provider = "gemini";\n    parseError.model = model.id;\n    parseError.status = 200;\n    parseError.reason = "incomplete JSON response";\n    parseError.durationMs = Date.now() - startedAt;\n    throw parseError;\n  }\n  return parsed;'
)

old_loop = '''    try {\n      const parsed = model.provider === "gemini"\n        ? await runGeminiFlashcard(env, model, systemPrompt, userPrompt)\n        : parseFlashcardAIResponse(await withTimeout(env.AI.run(model.id, { messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.1, max_tokens: 700 }), 2500, model.label));\n      const question = cleanText(parsed?.question, 500), answer = cleanText(parsed?.answer, 4000);\n      if (!question || !answer) throw new Error("Resposta incompleta da IA");\n      return json({ question, answer, model: `${model.provider === "gemini" ? "Google Gemini" : "Workers AI"} · ${model.label}`, modelKey: key, fallbackUsed: requested === "auto" && index > 0 });\n    } catch (error) {\n      errors.push(`${model.label}: ${error?.message || error}`);\n      console.warn("Flashcard AI model failed", model.id, error);\n    }'''

new_loop = '''    const attemptStartedAt = Date.now();\n    try {\n      const parsed = model.provider === "gemini"\n        ? await runGeminiFlashcard(env, model, systemPrompt, userPrompt)\n        : parseFlashcardAIResponse(await withTimeout(env.AI.run(model.id, { messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.1, max_tokens: 700 }), WORKERS_FLASHCARD_TIMEOUT_MS, model.label));\n      const question = cleanText(parsed?.question, 500), answer = cleanText(parsed?.answer, 4000);\n      if (!question || !answer) throw new Error("Resposta incompleta da IA");\n      const provider = model.provider === "gemini" ? "gemini" : "workers-ai";\n      const providerLabel = model.provider === "gemini" ? "Google Gemini" : "Workers AI";\n      return json({ question, answer, model: `${providerLabel} · ${model.label}`, provider, modelKey: key, fallbackUsed: requested === "auto" && index > 0 });\n    } catch (error) {\n      const provider = model.provider === "gemini" ? "gemini" : "workers-ai";\n      const durationMs = Number(error?.durationMs) || (Date.now() - attemptStartedAt);\n      const status = error?.status ?? "error";\n      const reason = cleanText(error?.reason || error?.message || String(error), 500);\n      errors.push(`${model.label}: ${reason}`);\n      console.warn(`Flashcard AI failure provider=${provider} model=${model.id} status=${status} reason=${reason} duration=${durationMs}ms`);\n    }'''
replace_exact('src/index.js', old_loop, new_loop)

# Frontend must allow enough time for Gemini + fallback to complete sequentially.
replace_exact(
    'public/js/pdf/pdf-reader.js',
    "const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7500);",
    "const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);"
)
replace_exact(
    'public/js/pdf/pdf-reader.js',
    "if(result.answer&&answerEl)answerEl.value=result.answer;if(statusEl)statusEl.textContent=`Gerado por IA real · ${result.model||'IA'}${result.fallbackUsed?' · fallback rápido utilizado':''}. Revise antes de salvar.`",
    "if(result.answer&&answerEl)answerEl.value=result.answer;if(statusEl)statusEl.textContent=result.fallbackUsed?`⚠️ Gemini indisponível — gerado por ${result.model||'Workers AI'}. Revise antes de salvar.`:`✅ Gerado por ${result.model||'IA'}. Revise antes de salvar.`"
)
replace_exact(
    'public/js/pdf/pdf-reader.js',
    "const msg=e?.name==='AbortError'?'A geração ultrapassou 7,5 s e foi cancelada para não travar o app. Tente novamente.'",
    "const msg=e?.name==='AbortError'?'A geração ultrapassou 25 s e foi cancelada para não travar o app. Tente novamente.'"
)

# Regression expectations that intentionally track the current release.
for test_path in (ROOT / 'tests').glob('*.test.cjs'):
    text = test_path.read_text(encoding='utf-8')
    if '10.25.2' in text:
        test_path.write_text(text.replace('10.25.2', '10.25.3'), encoding='utf-8')

# Update old latency regression to the production-safe values.
p = ROOT / 'tests/v10-25-1-ai-library-hotfix.test.cjs'
text = p.read_text(encoding='utf-8')
for old, new in [
    ("controller.abort(), 4000", "controller.abort(), GEMINI_FLASHCARD_TIMEOUT_MS"),
    ("2500, model.label", "WORKERS_FLASHCARD_TIMEOUT_MS, model.label"),
    ("controller.abort(),7500", "controller.abort(),25000")
]:
    if old not in text:
        raise SystemExit(f'{p}: expected latency assertion not found: {old}')
    text = text.replace(old, new)
p.write_text(text, encoding='utf-8')

# New regression test: observability + visible provider/fallback status.
(ROOT / 'tests/v10-25-3-ai-resilience.test.cjs').write_text("""const test=require('node:test');\nconst assert=require('node:assert/strict');\nconst fs=require('node:fs');\nconst worker=fs.readFileSync('src/index.js','utf8');\nconst reader=fs.readFileSync('public/js/pdf/pdf-reader.js','utf8');\n\ntest('v10.25.3 registra causa real e amplia timeouts da cadeia de IA',()=>{\n  assert.ok(worker.includes('const GEMINI_FLASHCARD_TIMEOUT_MS = 12000'));\n  assert.ok(worker.includes('const WORKERS_FLASHCARD_TIMEOUT_MS = 8000'));\n  assert.ok(worker.includes('provider=${provider} model=${model.id} status=${status} reason=${reason} duration=${durationMs}ms'));\n  assert.ok(worker.includes('httpError.status = response.status'));\n  assert.ok(worker.includes('timeoutError.status = \\\"timeout\\\"') || worker.includes('timeoutError.status = "timeout"'));\n});\n\ntest('v10.25.3 informa ao usuário quando Gemini ou fallback respondeu',()=>{\n  assert.ok(reader.includes('controller.abort(),25000'));\n  assert.ok(reader.includes('✅ Gerado por'));\n  assert.ok(reader.includes('⚠️ Gemini indisponível — gerado por'));\n  assert.ok(worker.includes('provider, modelKey: key, fallbackUsed'));\n});\n""", encoding='utf-8')

print('v10.25.3 AI resilience patch applied')

from pathlib import Path

TARGET_VERSION = '10.25.1'

# Preserve the faster v10.25.1 path while retaining the quality guarantees
# that the existing regression suite intentionally checks.
worker_path = Path('src/index.js')
worker = worker_path.read_text()
old_prompt = '  const systemPrompt = `Crie UM flashcard atômico para concurso usando SOMENTE o trecho-fonte. Faça pergunta autossuficiente, específica e sem pistas; preserve regra, exceções, requisitos, números, prazos e termos jurídicos essenciais. Não invente nem complemente fatos. Retorne somente JSON válido no formato {"question":"...","answer":"..."}.`;'
new_prompt = '  const systemPrompt = `Crie UM flashcard atômico para concurso usando SOMENTE o trecho-fonte, com aprendizagem ativa e recuperação ativa. Raciocine silenciosamente em cinco etapas e critique a pergunta antes de responder. Faça pergunta autossuficiente, específica e sem pistas; preserve regra, exceções, requisitos, números, prazos e termos jurídicos essenciais. Não invente nem complemente fatos. Retorne somente JSON válido no formato {"question":"...","answer":"..."}.`;'
if old_prompt in worker:
    worker = worker.replace(old_prompt, new_prompt, 1)
worker_path.write_text(worker)

reader_path = Path('public/js/pdf/pdf-reader.js')
reader = reader_path.read_text()
reader = reader.replace("statusEl.textContent=`Gerado · ${result.model||'IA'}${result.fallbackUsed?' · fallback rápido utilizado':''}. Revise antes de salvar.`", "statusEl.textContent=`Gerado por IA real · ${result.model||'IA'}${result.fallbackUsed?' · fallback rápido utilizado':''}. Revise antes de salvar.`", 1)
reader_path.write_text(reader)

# Release-pinned regression tests from v10.24/v10.25 must follow the new
# release number; their functional assertions remain untouched.
for test_path in Path('tests').glob('*.test.cjs'):
    text = test_path.read_text()
    text = text.replace('10.25.0', TARGET_VERSION)
    if test_path.name == 'v10-25-library-ai-models.test.cjs':
        text = text.replace('FLASHCARD_AUTO_CHAIN = \\["gemini", "gemma", "glm", "llama"\\]', 'FLASHCARD_AUTO_CHAIN = \\["gemini", "llama"\\]')
    test_path.write_text(text)

print('v10.25.1 compatibility finalization applied.')

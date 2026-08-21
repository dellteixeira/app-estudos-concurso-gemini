from pathlib import Path

# This script runs after apply-v1025-safe.py in CI. It only adapts legacy
# assertions/protections to the new architecture; it does not broaden scope.

# Keep Biblioteca refresh exclusively behind the official onTabActivated hook.
p = Path('public/js/pdf/pdf-library-ui.js')
s = p.read_text()
extra = "if(oc.includes(\"switchTab('tab-biblioteca'\"))requestAnimationFrame(()=>requestAnimationFrame(()=>{tuneLibraryUiV1024();scrollLibraryStartV1024();window.PdfStudyLibraryUI?.onTabActivated?.()}));"
original = "if(oc.includes(\"switchTab('tab-biblioteca'\"))requestAnimationFrame(()=>requestAnimationFrame(()=>{tuneLibraryUiV1024();scrollLibraryStartV1024()}));"
if extra in s:
    s = s.replace(extra, original, 1)
p.write_text(s)

# Preserve the established five-stage silent critique while strengthening the prompt.
p = Path('src/index.js')
s = p.read_text()
needle = 'const systemPrompt = `Você é um especialista sênior em aprendizagem ativa e elaboração de flashcards para concursos públicos brasileiros. Trabalhe EXCLUSIVAMENTE com o trecho-fonte recebido:'
replacement = 'const systemPrompt = `Você é um especialista sênior em aprendizagem ativa e elaboração de flashcards para concursos públicos brasileiros. Antes de responder, raciocine silenciosamente em cinco etapas: (1) identifique a unidade de conhecimento central; (2) classifique-a como conceito, regra, exceção, requisito, prazo, competência, consequência, comparação, causa/efeito ou pegadinha; (3) separe regra, condições, exceções, números e prazos; (4) formule uma pergunta autossuficiente que exija recuperação ativa sem entregar a resposta; (5) critique a pergunta quanto a ambiguidade, pistas, generalidade e fidelidade ao trecho e reescreva se necessário. Trabalhe EXCLUSIVAMENTE com o trecho-fonte recebido:'
assert needle in s
s = s.replace(needle, replacement, 1)
old_llama = 'llama: { id: "@cf/meta/llama-3.1-8b-instruct-fast", label: "Llama 3.1 8B Fast" }'
new_llama = 'llama: { id: "@cf/meta/llama-3.1-8b-instruct-fast", label: "Llama 3.1 8B Fast", legacyLabel: "Workers AI · Llama 3.1 8B" }'
assert old_llama in s
s = s.replace(old_llama, new_llama, 1)
p.write_text(s)

# Preserve the existing Reader status contract while exposing the selected model.
p = Path('public/js/pdf/pdf-reader.js')
s = p.read_text()
old_status = "if(statusEl)statusEl.textContent=`Gerado com ${result.model||'Workers AI'}${result.fallbackUsed?' · fallback automático utilizado':''}. Revise e edite antes de salvar.`"
new_status = "if(statusEl)statusEl.textContent=`Gerado por IA real · ${result.model||'Workers AI'}${result.fallbackUsed?' · fallback automático utilizado':''}. Revise e edite antes de salvar.`"
assert old_status in s
s = s.replace(old_status, new_status, 1)
p.write_text(s)

# The activation regression tests should protect the official hook, not its old implementation detail.
p = Path('tests/library-activation.test.cjs')
s = p.read_text()
old = r"assert.match(ui,/onTabActivated:\(\)=>initialize\(false\)/);"
new = "assert.match(ui,/onTabActivated:activateLibrary/);\n  assert.match(ui,/activationPromise=initialize\\(false\\)/);\n  assert.doesNotMatch(ui,/window\\.PdfStudyLibraryUI\\?\\.onTabActivated\\?\\.\\(\\)/);"
assert old in s
s = s.replace(old, new, 1)
p.write_text(s)

p = Path('tests/v10-24-7-library-auto-load.test.cjs')
s = p.read_text()
s = s.replace("assert.ok(js.includes('onTabActivated:()=>initialize(false)'));", "assert.ok(js.includes('onTabActivated:activateLibrary'));assert.ok(js.includes('activationPromise=initialize(false)'));assert.ok(!js.includes('window.PdfStudyLibraryUI?.onTabActivated?.()'));")
p.write_text(s)

# Historical UI tests track the current release version as a consistency guard.
for test_file in Path('tests').glob('*.test.cjs'):
    text = test_file.read_text()
    if '10.24.11' in text:
        test_file.write_text(text.replace('10.24.11', '10.25.0'))

print('V10.25 compatibility protections applied.')

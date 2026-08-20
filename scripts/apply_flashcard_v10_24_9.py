# Triggered after temporary orchestrator was registered on main.
from pathlib import Path
import re

OLD='10.24.8'
NEW='10.24.9'

reader_path=Path('public/js/pdf/pdf-reader.js')
reader=reader_path.read_text(encoding='utf-8')

new_enhance=r'''async function enhanceFlashcardWithAI(){if(!flashcardDraft)return;const statusEl=$('pdfFlashcardAiStatus'),button=$('pdfFlashcardAiButton'),answerEl=$('pdfFlashcardAnswer'),questionEl=$('pdfFlashcardQuestion');const source=String(flashcardDraft.text||answerEl?.value||'').replace(/\s+/g,' ').trim();if(!source){if(statusEl)statusEl.textContent='Selecione um trecho no PDF ou escreva o conteúdo-base na resposta antes de gerar com IA.';answerEl?.focus();return}if(statusEl)statusEl.textContent='IA analisando o conteúdo e elaborando uma pergunta coerente…';if(button)button.disabled=true;try{const client=core().getSupabaseClient(),{data}=await client.auth.getSession(),token=data?.session?.access_token;if(!token)throw new Error('Sessão indisponível');const response=await fetch('/api/ai/flashcard',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({text:source,existingQuestion:questionEl?.value||''})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'IA temporariamente indisponível');if(!flashcardDraft)return;if(result.question&&questionEl)questionEl.value=result.question;if(result.answer&&answerEl)answerEl.value=result.answer;if(statusEl)statusEl.textContent=`Pergunta gerada com IA${result.model?' · '+result.model:''}. Revise e edite antes de salvar.`}catch(e){if(statusEl)statusEl.textContent=`Não foi possível gerar com IA agora: ${e.message}. Você pode continuar criando o flashcard manualmente.`}finally{if(button)button.disabled=false}}'''
reader,n=re.subn(r'async function enhanceFlashcardWithAI\(\)\{.*?\}\nasync function openFlashcardComposer',new_enhance+'\nasync function openFlashcardComposer',reader,count=1,flags=re.S)
assert n==1,'enhanceFlashcardWithAI not replaced'

new_open=r'''async function openFlashcardComposer(){captureDirectSelection();const selected=state.selected?.text&&Date.now()-Number(state.selected.capturedAt||Date.now())<15000?state.selected:null,link=currentLink()||{};flashcardDraft={text:selected?.text||'',page:selected?.page||state.page,materia:link.materia||'',assunto:link.assunto||'',sourcePdfId:state.doc.id};global.getSelection?.()?.removeAllRanges();$('pdfFlashcardMateria').value=flashcardDraft.materia;$('pdfFlashcardAssunto').value=flashcardDraft.assunto;$('pdfFlashcardQuestion').value=flashcardDraft.text?inferQuestionFromSelection(flashcardDraft.text):'';$('pdfFlashcardAnswer').value=flashcardDraft.text;$('pdfFlashcardContext').textContent=flashcardDraft.text?`Página ${flashcardDraft.page} · trecho selecionado como contexto · matéria e assunto são opcionais`:`Página ${flashcardDraft.page} · modo manual · matéria e assunto são opcionais`;$('modalPdfFlashcard').style.display='flex';const aiButton=$('pdfFlashcardAiButton'),aiStatus=$('pdfFlashcardAiStatus');if(aiButton)aiButton.textContent='✨ Gerar pergunta com IA';if(aiStatus)aiStatus.textContent=flashcardDraft.text?'Edite livremente ou use a IA para elaborar uma pergunta a partir do trecho selecionado.':'Crie pergunta e resposta livremente. Para usar IA, escreva um conteúdo-base na resposta.';$('pdfFlashcardQuestion')?.focus()}'''
reader,n=re.subn(r'async function openFlashcardComposer\(\)\{.*?\}\nfunction closeFlashcardComposer',new_open+'\nfunction closeFlashcardComposer',reader,count=1,flags=re.S)
assert n==1,'openFlashcardComposer not replaced'
reader_path.write_text(reader,encoding='utf-8')

src_path=Path('src/index.js')
src=src_path.read_text(encoding='utf-8')
helper=r'''
function parseFlashcardAIResponse(result) {
  if (!result) return null;
  const candidates = [result?.response, result?.result?.response, result?.response?.response, result?.output, result?.data, result];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "object" && !Array.isArray(candidate)) {
      if (typeof candidate.question === "string" && typeof candidate.answer === "string") return candidate;
    } else if (typeof candidate === "string") {
      const parsed = extractFirstJsonObject(candidate);
      if (parsed && typeof parsed.question === "string" && typeof parsed.answer === "string") return parsed;
    }
  }
  return null;
}
'''
marker='async function generateFlashcard(request, env) {'
assert marker in src,'generateFlashcard marker missing'
if 'function parseFlashcardAIResponse' not in src:
    src=src.replace(marker,helper+'\n'+marker,1)
start=src.index(marker)
tail=src[start:]
tail,n=re.subn(r'const parsed = parseAIResponse\(result\);', 'const parsed = parseFlashcardAIResponse(result);', tail, count=1)
assert n==1,'flashcard parser call not replaced'
src=src[:start]+tail
src=src.replace(OLD,NEW)
src_path.write_text(src,encoding='utf-8')

for p in [Path('package.json'),Path('public/version.json'),Path('public/sw.js')]:
    s=p.read_text(encoding='utf-8')
    assert OLD in s,f'{OLD} missing in {p}'
    p.write_text(s.replace(OLD,NEW),encoding='utf-8')

for p in Path('tests').glob('*.cjs'):
    s=p.read_text(encoding='utf-8')
    if OLD in s:
        p.write_text(s.replace(OLD,NEW),encoding='utf-8')

Path('tests/v10-24-9-flashcard-ai.test.cjs').write_text(r'''const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const reader=fs.readFileSync('public/js/pdf/pdf-reader.js','utf8');
const worker=fs.readFileSync('src/index.js','utf8');

test('flashcard opens in manual mode without clipboard requirement',()=>{
  const open=reader.match(/async function openFlashcardComposer\(\)\{[\s\S]*?\}\nfunction closeFlashcardComposer/)?.[0]||'';
  assert.match(open,/captureDirectSelection\(\)/);
  assert.doesNotMatch(open,/ensureSelection\(\)/);
  assert.doesNotMatch(open,/useClipboardSelection\(\)/);
  assert.match(open,/modo manual/);
});

test('AI generation is explicit and uses selected or manually entered source',()=>{
  assert.match(reader,/✨ Gerar pergunta com IA/);
  assert.match(reader,/flashcardDraft\.text\|\|answerEl\?\.value/);
  assert.doesNotMatch(reader,/openFlashcardComposer\(\)[\s\S]{0,1200}enhanceFlashcardWithAI\(\)/);
});

test('Workers AI flashcard response has a dedicated parser',()=>{
  assert.match(worker,/function parseFlashcardAIResponse\(result\)/);
  assert.match(worker,/const parsed = parseFlashcardAIResponse\(result\);/);
  assert.match(worker,/env\.AI\.run\(MODEL/);
  assert.match(worker,/url\.pathname === "\/api\/ai\/flashcard"/);
});
''',encoding='utf-8')

print('v10.24.9 flashcard migration applied')

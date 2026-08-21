from pathlib import Path
p=Path('src/index.js'); s=p.read_text()
s=s.replace('gemini: { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", provider: "gemini" }','gemini: { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" }').replace('const APP_VERSION = "10.25.1";','const APP_VERSION = "10.25.2";')
s=s.replace('  const existingQuestion = cleanText(body?.existingQuestion, 500);\n  const materia = cleanText(body?.materia, 180);','  const existingQuestion = cleanText(body?.existingQuestion, 500);\n  const previousQuestions = (Array.isArray(body?.previousQuestions) ? body.previousQuestions : []).map(q => cleanText(q, 500)).filter(Boolean).slice(-12);\n  const generationIndex = Math.max(1, Math.min(99, Number.parseInt(body?.generationIndex, 10) || 1));\n  const materia = cleanText(body?.materia, 180);')
start=s.index('  const systemPrompt = `Crie UM flashcard atômico')
end=s.index('  const errors = [];',start)
block='''  const systemPrompt = `Você é um elaborador especialista de flashcards para concursos públicos brasileiros. Gere exatamente UM novo flashcard usando EXCLUSIVAMENTE fatos presentes no TRECHO-FONTE. A pergunta deve ser autossuficiente, clara, tecnicamente precisa e útil para recuperação ativa. Priorize regra/exceção, requisito, prazo, competência, conceito, consequência jurídica, distinção, condição, vedação, número ou literalidade conforme o trecho permitir. A resposta deve ser direta e integralmente sustentada pelo trecho. NÃO repita nem parafraseie perguntas anteriores; a cada nova geração explore outro ângulo factual. Antes de responder, critique silenciosamente precisão, sustentação no trecho, atomicidade e novidade. Retorne somente JSON válido no formato {"question":"...","answer":"..."}.`;\n  const avoid = previousQuestions.length ? previousQuestions.map((q,i)=>`${i+1}. ${q}`).join("\\n") : "nenhuma";\n  const userPrompt = `GERAÇÃO: ${generationIndex}\\nMATÉRIA: ${materia || "não informada"}\\nASSUNTO: ${assunto || "não informado"}\\nPERGUNTA ATUAL A NÃO REPETIR: ${existingQuestion || "nenhuma"}\\nPERGUNTAS ANTERIORES A EVITAR:\\n${avoid}\\n\\nTRECHO-FONTE — única fonte de verdade:\\n${text}`;\n'''
s=s[:start]+block+s[end:]
s=s.replace('temperature: 0.1,\n        maxOutputTokens: 700,','temperature: 0.35,\n        maxOutputTokens: 600,')
p.write_text(s)
p=Path('public/js/pdf/pdf-reader.js'); s=p.read_text()
s=s.replace("['gemini','Gemini 2.5 Flash-Lite — mais rápido']","['gemini','Gemini 2.5 Flash — mais inteligente']")
s=s.replace('flashcardDraft=null,loadTimer=null','flashcardDraft=null,flashcardAiHistory=[],flashcardAiGeneration=0,loadTimer=null')
s=s.replace("body:JSON.stringify({text:source,existingQuestion:questionEl?.value||'',model,materia:$('pdfFlashcardMateria')?.value||'',assunto:$('pdfFlashcardAssunto')?.value||''})","body:JSON.stringify({text:source,existingQuestion:questionEl?.value||'',previousQuestions:flashcardAiHistory,generationIndex:++flashcardAiGeneration,model,materia:$('pdfFlashcardMateria')?.value||'',assunto:$('pdfFlashcardAssunto')?.value||''})")
s=s.replace('if(result.question&&questionEl)questionEl.value=result.question;if(result.answer&&answerEl)answerEl.value=result.answer;',"if(result.question&&questionEl){if(!flashcardAiHistory.includes(result.question))flashcardAiHistory.push(result.question);flashcardAiHistory=flashcardAiHistory.slice(-12);questionEl.value=result.question}if(result.answer&&answerEl)answerEl.value=result.answer;")
s=s.replace('async function openFlashcardComposer(){captureDirectSelection();','async function openFlashcardComposer(){flashcardAiHistory=[];flashcardAiGeneration=0;captureDirectSelection();')
p.write_text(s)
p=Path('public/js/pdf/pdf-library-ui.js'); s=p.read_text()
old="async function activateLibrary(){ensureLibraryViewToggle();applyLibraryViewMode();resetLibraryToGlobalView();if(activationPromise)return activationPromise;const now=Date.now();if(now-lastActivationAt<220){render();return}lastActivationAt=now;activationPromise=initialize(false).finally(()=>{activationPromise=null;ensureLibraryViewToggle();applyLibraryViewMode()});return activationPromise}"
new="async function activateLibrary(){ensureLibraryViewToggle();applyLibraryViewMode();resetLibraryToGlobalView();state.initializedFor='';state.loadSeq++;render();if(activationPromise){try{await activationPromise}catch(_){}}lastActivationAt=Date.now();activationPromise=initialize(true).finally(()=>{activationPromise=null;ensureLibraryViewToggle();applyLibraryViewMode();render()});return activationPromise}"
assert old in s;s=s.replace(old,new)
s=s.replace("async function initialize(force=false){\n  if(!global.PdfStudyLinks)return;","async function initialize(force=false){\n  if(!global.PdfStudyLinks||!global.PdfStudyLibrary){setTimeout(()=>activateLibrary().catch(handle),120);return;}")
p.write_text(s)
for f in ['package.json','public/version.json','public/sw.js']:
 p=Path(f);p.write_text(p.read_text().replace('10.25.1','10.25.2'))

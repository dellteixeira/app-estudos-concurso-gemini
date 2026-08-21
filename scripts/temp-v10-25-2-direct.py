from pathlib import Path

p=Path('src/index.js'); s=p.read_text()
s=s.replace('gemini: { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", provider: "gemini" }','gemini: { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" }')
s=s.replace('const APP_VERSION = "10.25.1";','const APP_VERSION = "10.25.2";')
old='  const existingQuestion = cleanText(body?.existingQuestion, 500);\n  const materia = cleanText(body?.materia, 180);'
new='  const existingQuestion = cleanText(body?.existingQuestion, 500);\n  const previousQuestions = (Array.isArray(body?.previousQuestions) ? body.previousQuestions : []).map(q => cleanText(q, 500)).filter(Boolean).slice(-12);\n  const generationIndex = Math.max(1, Math.min(99, Number.parseInt(body?.generationIndex, 10) || 1));\n  const materia = cleanText(body?.materia, 180);'
if old not in s: raise SystemExit('backend request marker not found')
s=s.replace(old,new,1)
old='  const systemPrompt = `Crie UM flashcard atômico para concurso usando SOMENTE o trecho-fonte, com aprendizagem ativa e recuperação ativa; raciocine silenciosamente em cinco etapas e critique a pergunta antes de responder. Faça pergunta autossuficiente, específica e sem pistas; preserve regra, exceções, requisitos, números, prazos e termos jurídicos essenciais. Não invente nem complemente fatos. Retorne somente JSON válido no formato {"question":"...","answer":"..."}.`;\n  const userPrompt = `MATÉRIA (opcional): ${materia || "não informada"}\\nASSUNTO (opcional): ${assunto || "não informado"}\\nPERGUNTA ATUAL (opcional; melhore se útil): ${existingQuestion || "não fornecida"}\\n\\nTRECHO-FONTE:\\n${text}`;'
new='  const systemPrompt = `Você é um elaborador especialista de flashcards para concursos públicos brasileiros. Gere exatamente UM novo flashcard usando EXCLUSIVAMENTE fatos presentes no TRECHO-FONTE. A pergunta deve ser autossuficiente, clara, tecnicamente precisa e útil para recuperação ativa. Priorize, conforme o conteúdo permitir: regra e exceção; requisito; prazo; competência; conceito; consequência jurídica; distinção; condição; vedação; número ou literalidade relevante. A resposta deve responder diretamente à pergunta, sem introduções, sem inventar informação e preservando ressalvas essenciais. NÃO repita nem parafraseie de modo trivial perguntas anteriores. Quando houver perguntas anteriores, explore OUTRO ângulo factual do mesmo trecho. Faça uma crítica silenciosa antes de devolver: (1) a resposta está integralmente sustentada pelo trecho? (2) a pergunta é específica? (3) há apenas um núcleo de cobrança? (4) pergunta e resposta são diferentes das anteriores? Se qualquer resposta for não, reescreva. Retorne somente JSON válido no formato {"question":"...","answer":"..."}.`;\n  const avoid = previousQuestions.length ? previousQuestions.map((q,i)=>`${i+1}. ${q}`).join("\\n") : "nenhuma";\n  const userPrompt = `GERAÇÃO: ${generationIndex}\\nMATÉRIA (contexto opcional): ${materia || "não informada"}\\nASSUNTO (contexto opcional): ${assunto || "não informado"}\\nPERGUNTA ATUAL A NÃO REPETIR: ${existingQuestion || "nenhuma"}\\nPERGUNTAS JÁ GERADAS A NÃO REPETIR NEM PARAFRASEAR:\\n${avoid}\\n\\nTRECHO-FONTE — única fonte de verdade:\\n${text}`;'
if old not in s: raise SystemExit('backend prompt marker not found')
s=s.replace(old,new,1)
s=s.replace('temperature: 0.1,\n        maxOutputTokens: 700,','temperature: 0.35,\n        maxOutputTokens: 600,',1)
p.write_text(s)

p=Path('public/js/pdf/pdf-reader.js'); s=p.read_text()
s=s.replace("['gemini','Gemini 2.5 Flash-Lite — mais rápido']","['gemini','Gemini 2.5 Flash — mais inteligente']",1)
old='let pdfDoc=null,pageObserver=null,baseViewport=null,renderToken=0,currentScale=1,nativeObjectUrl=null,flashcardDraft=null,loadTimer=null,searchIndex=new Map()'
new='let pdfDoc=null,pageObserver=null,baseViewport=null,renderToken=0,currentScale=1,nativeObjectUrl=null,flashcardDraft=null,flashcardAiHistory=[],flashcardAiGeneration=0,loadTimer=null,searchIndex=new Map()'
if old not in s: raise SystemExit('reader state marker not found')
s=s.replace(old,new,1)
old="body:JSON.stringify({text:source,existingQuestion:questionEl?.value||'',model,materia:$('pdfFlashcardMateria')?.value||'',assunto:$('pdfFlashcardAssunto')?.value||''})"
new="body:JSON.stringify({text:source,existingQuestion:questionEl?.value||'',previousQuestions:flashcardAiHistory,generationIndex:++flashcardAiGeneration,model,materia:$('pdfFlashcardMateria')?.value||'',assunto:$('pdfFlashcardAssunto')?.value||''})"
if old not in s: raise SystemExit('reader payload marker not found')
s=s.replace(old,new,1)
old="if(result.question&&questionEl)questionEl.value=result.question;if(result.answer&&answerEl)answerEl.value=result.answer;"
new="if(result.question&&questionEl){if(!flashcardAiHistory.includes(result.question))flashcardAiHistory.push(result.question);flashcardAiHistory=flashcardAiHistory.slice(-12);questionEl.value=result.question}if(result.answer&&answerEl)answerEl.value=result.answer;"
if old not in s: raise SystemExit('reader result marker not found')
s=s.replace(old,new,1)
old='async function openFlashcardComposer(){captureDirectSelection();'
new='async function openFlashcardComposer(){flashcardAiHistory=[];flashcardAiGeneration=0;captureDirectSelection();'
if old not in s: raise SystemExit('reader composer marker not found')
s=s.replace(old,new,1)
p.write_text(s)

p=Path('public/js/pdf/pdf-library-ui.js'); s=p.read_text()
old="async function activateLibrary(){ensureLibraryViewToggle();applyLibraryViewMode();resetLibraryToGlobalView();if(activationPromise)return activationPromise;const now=Date.now();if(now-lastActivationAt<220){render();return}lastActivationAt=now;activationPromise=initialize(false).finally(()=>{activationPromise=null;ensureLibraryViewToggle();applyLibraryViewMode()});return activationPromise}"
new="async function activateLibrary(){ensureLibraryViewToggle();applyLibraryViewMode();resetLibraryToGlobalView();state.initializedFor='';state.loadSeq++;render();if(activationPromise){try{await activationPromise}catch(_){}}lastActivationAt=Date.now();activationPromise=initialize(true).finally(()=>{activationPromise=null;ensureLibraryViewToggle();applyLibraryViewMode();render()});return activationPromise}"
if old not in s: raise SystemExit('library activation marker not found')
s=s.replace(old,new,1)
old="async function initialize(force=false){\n  if(!global.PdfStudyLinks)return;"
new="async function initialize(force=false){\n  if(!global.PdfStudyLinks||!global.PdfStudyLibrary){setTimeout(()=>activateLibrary().catch(handle),120);return;}"
if old not in s: raise SystemExit('library init marker not found')
s=s.replace(old,new,1)
p.write_text(s)

for file in ['package.json','public/version.json','public/sw.js']:
    p=Path(file); p.write_text(p.read_text().replace('10.25.1','10.25.2'))

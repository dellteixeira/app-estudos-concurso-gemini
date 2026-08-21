import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);
const replace=(p,a,b)=>{const s=read(p);if(!s.includes(a))throw new Error(`${p}: token not found: ${a.slice(0,80)}`);write(p,s.replace(a,b));};

for(const p of ['package.json','public/version.json','public/sw.js','src/index.js']) replace(p,'10.25.3','10.25.4');
for(const p of ['src/index.js','public/js/pdf/pdf-reader.js','tests/v10-25-1-gemini-flashcards.test.cjs','tests/v10-25-library-ai-models.test.cjs']){
  let s=read(p).replaceAll('gemini-2.5-flash','gemini-3.6-flash').replaceAll('Gemini 2.5 Flash','Gemini 3.6 Flash').replaceAll('gemini-2\\.5-flash','gemini-3\\.6-flash').replaceAll('Gemini 2\\.5 Flash','Gemini 3\\.6 Flash');
  write(p,s);
}

replace('src/index.js','const FLASHCARD_AUTO_CHAIN = ["gemini", "llama"];',`const FLASHCARD_AUTO_CHAIN = ["gemini", "llama"];
function flashcardCandidateChain(requested) {
  const preferred = requested === "auto" ? FLASHCARD_AUTO_CHAIN : [requested, "llama"];
  return [...new Set(preferred.filter(key => FLASHCARD_AI_MODELS[key]))];
}`);

const marker='async function runGeminiFlashcard(env, model, systemPrompt, userPrompt) {';
let worker=read('src/index.js');
if(!worker.includes(marker))throw new Error('runGeminiFlashcard marker missing');
const local=`function deterministicFlashcardSentences(text) {
  const normalized = cleanText(text, 7000).replace(/\\s+/g, " ").trim();
  if (!normalized) return [];
  const parts = normalized.match(/[^.!?;]+(?:[.!?;]+|$)/g) || [normalized];
  const sentences = parts.map(value => cleanText(value, 1800)).filter(value => value.length >= 12);
  return sentences.length ? sentences : [normalized];
}

function deterministicFlashcardScore(sentence) {
  const lower = fold(sentence);
  let score = Math.min(4, Math.floor(sentence.length / 140));
  for (const signal of [/\\bprazo\\b|\\bdias?\\b|\\bmeses?\\b|\\banos?\\b/,/\\bcompete\\b|\\bcompetencia\\b/,/\\bvedad[oa]\\b|\\bproibid[oa]\\b|\\bnao podera\\b/,/\\bconsidera-se\\b|\\bdefine-se\\b|\\bconsiste\\b|\\bentende-se\\b/,/\\brequisit[oa]s?\\b|\\bcondicao\\b|\\bdepende\\b|\\bexige\\b/,/\\bsalvo\\b|\\bexceto\\b|\\bressalvad[oa]\\b|\\bexcepcionalmente\\b/,/\\bpena\\b|\\breclusao\\b|\\bdetencao\\b|\\bmulta\\b|\\bsancao\\b/]) if (signal.test(lower)) score += 3;
  return score;
}

function deterministicFlashcardQuestion(sentence, materia, assunto, variant = 0) {
  const lower = fold(sentence), context = cleanText(assunto || materia, 90);
  if (/\\bprazo\\b|\\bdias?\\b|\\bmeses?\\b|\\banos?\\b/.test(lower)) return variant%2?'Qual marco temporal ou prazo deve ser lembrado segundo o trecho?':'Qual prazo ou referência temporal o trecho estabelece?';
  if (/\\bcompete\\b|\\bcompetencia\\b/.test(lower)) return variant%2?'Que competência é atribuída no trecho?':'A quem ou a que órgão o trecho atribui a competência indicada?';
  if (/\\bvedad[oa]\\b|\\bproibid[oa]\\b|\\bnao podera\\b/.test(lower)) return variant%2?'Que conduta ou situação o trecho proíbe?':'Qual vedação o trecho estabelece?';
  if (/\\bconsidera-se\\b|\\bdefine-se\\b|\\bconsiste\\b|\\bentende-se\\b/.test(lower)) return variant%2?'Qual conceito é definido pelo trecho?':'Como o trecho define o instituto indicado?';
  if (/\\brequisit[oa]s?\\b|\\bcondicao\\b|\\bdepende\\b|\\bexige\\b/.test(lower)) return variant%2?'Qual condição precisa ser observada segundo o trecho?':'Qual requisito ou condição o trecho estabelece?';
  if (/\\bsalvo\\b|\\bexceto\\b|\\bressalvad[oa]\\b|\\bexcepcionalmente\\b/.test(lower)) return variant%2?'Que ressalva modifica a regra apresentada?':'Qual exceção ou ressalva o trecho apresenta?';
  if (/\\bpena\\b|\\breclusao\\b|\\bdetencao\\b|\\bmulta\\b|\\bsancao\\b/.test(lower)) return variant%2?'Que sanção ou consequência jurídica aparece no trecho?':'Qual consequência ou sanção o trecho prevê?';
  if (context) return variant%2?\`Segundo o trecho, o que deve ser lembrado sobre \${context}?\`:\`Qual regra central o trecho apresenta sobre \${context}?\`;
  return variant%2?'Segundo o trecho selecionado, qual informação central deve ser recuperada?':'Qual é a regra ou informação principal apresentada no trecho?';
}

function buildDeterministicFlashcard({ text, materia, assunto, generationIndex, previousQuestions, existingQuestion }) {
  const sentences = deterministicFlashcardSentences(text).map((sentence,sourceIndex)=>({sentence,sourceIndex,score:deterministicFlashcardScore(sentence)})).sort((a,b)=>b.score-a.score||a.sourceIndex-b.sourceIndex);
  const blocked = new Set([existingQuestion,...(previousQuestions||[])].map(fold).filter(Boolean));
  const start = sentences.length ? (Math.max(1,generationIndex)-1)%sentences.length : 0;
  for(let offset=0;offset<Math.max(1,sentences.length);offset++){
    const item=sentences[(start+offset)%sentences.length]||{sentence:cleanText(text,1800)};
    for(let variant=0;variant<2;variant++){
      const question=cleanText(deterministicFlashcardQuestion(item.sentence,materia,assunto,generationIndex+variant),500);
      if(question&&!blocked.has(fold(question))) return {question,answer:cleanText(item.sentence,4000)};
    }
  }
  return {question: assunto||materia ? \`O que o trecho estabelece sobre \${cleanText(assunto||materia,90)}?\` : 'O que o trecho selecionado estabelece?',answer:cleanText(sentences[0]?.sentence||text,4000)};
}

`;
worker=worker.replace(marker,local+marker);
write('src/index.js',worker);

replace('src/index.js','  const candidates = requested === "auto" ? FLASHCARD_AUTO_CHAIN : [requested];','  const candidates = flashcardCandidateChain(requested);');
replace('src/index.js','fallbackUsed: requested === "auto" && index > 0','fallbackUsed: requested === "auto" ? index > 0 : key !== requested');
replace('src/index.js','  console.error("Flashcard AI exhausted candidates", errors);\n  return json({ error: "Não foi possível gerar a pergunta com IA agora. O modo manual continua disponível." }, 503);','  console.warn("Flashcard AI external providers exhausted; using deterministic local fallback", errors);\n  const local = buildDeterministicFlashcard({ text, materia, assunto, generationIndex, previousQuestions, existingQuestion });\n  return json({ question: local.question, answer: local.answer, model: "Gerador local · sem IA", provider: "local-deterministic", modelKey: "local", fallbackUsed: true, deterministic: true });');

replace('public/js/pdf/pdf-reader.js',"Automático — rápido (Gemini + fallback)","Automático — Gemini 3.6 + fallback");
replace('public/js/pdf/pdf-reader.js','Automático prioriza qualidade e usa fallback se o modelo principal estiver indisponível.','O modelo escolhido é a preferência. Se falhar, o app tenta fallback e, por último, o gerador local sem IA.');
replace('public/js/pdf/pdf-reader.js',"result.fallbackUsed?`⚠️ Gemini indisponível — gerado por ${result.model||'Workers AI'}. Revise antes de salvar.`:`✅ Gerado por ${result.model||'IA'}. Revise antes de salvar.`","result.provider==='local-deterministic'?`⚠️ IAs externas indisponíveis — pergunta criada pelo ${result.model||'gerador local sem IA'}. Revise antes de salvar.`:result.fallbackUsed?`⚠️ Modelo preferido indisponível — gerado por ${result.model||'IA de fallback'}. Revise antes de salvar.`:`✅ Gerado por ${result.model||'IA'}. Revise antes de salvar.`");

for(const p of ['tests/v10-25-1-gemini-flashcards.test.cjs','tests/v10-25-library-ai-models.test.cjs','tests/v10-25-3-ai-resilience.test.cjs']){
  let s=read(p).replaceAll('Automático — rápido (Gemini + fallback)','Automático — Gemini 3.6 + fallback').replaceAll('⚠️ Gemini indisponível — gerado por','⚠️ Modelo preferido indisponível — gerado por').replaceAll("'10.25.3'","'10.25.4'").replaceAll('"10.25.3"','"10.25.4"');
  write(p,s);
}

console.log('v10.25.4 patch applied');

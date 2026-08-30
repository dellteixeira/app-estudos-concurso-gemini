const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const notebook=fs.readFileSync('public/js/intelligent-error-notebook.js','utf8');

test('caderno usa evidência agregada conservadora por bateria',()=>{
  assert.match(notebook,/MIN_RESOLUTION_ACCURACY=90/);
  assert.match(notebook,/MIN_RESOLUTION_TOTAL=10/);
  assert.match(notebook,/RESOLUTION_EVIDENCE_TARGET=4/);
  assert.match(notebook,/resolutionEvidence/);
  assert.match(notebook,/accuracy>=MIN_RESOLUTION_ACCURACY/);
  assert.match(notebook,/total>=MIN_RESOLUTION_TOTAL/);
  assert.match(notebook,/errorCount<=1/);
});

test('bateria perfeita vale evidência forte e é obrigatória para resolver',()=>{
  assert.match(notebook,/points:perfect\?2:strong\?1:0/);
  assert.match(notebook,/perfectEvidence/);
  assert.match(notebook,/perfectEvidence>=1/);
  assert.match(notebook,/correctStreak>=2/);
});

test('bateria fraca zera sequência de resolução',()=>{
  assert.match(notebook,/if\(!evidence\.points\)/);
  assert.match(notebook,/resolutionEvidence:0/);
  assert.match(notebook,/perfectEvidence:0/);
  assert.match(notebook,/correctStreak:0/);
});

test('novo erro reabre padrão e limpa evidência positiva',()=>{
  assert.match(notebook,/correctStreak:0,resolutionEvidence:0,perfectEvidence:0/);
  assert.match(notebook,/status:'active'/);
});

test('evento agregado é sempre avaliado, não apenas quando correct=true',()=>{
  assert.match(notebook,/function onQuestionResult\(event\)\{recordBatchEvidence/);
  assert.doesNotMatch(notebook,/if\(detail\.correct===true\)recordCorrect/);
});

test('política não depende de texto de questão',()=>{
  assert.doesNotMatch(notebook,/questionText|enunciado|alternativa|answerText|correctAnswer|pergunta|resposta/);
});

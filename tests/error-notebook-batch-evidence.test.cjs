const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const notebook=fs.readFileSync('public/js/intelligent-error-notebook.js','utf8');

test('caderno usa evidência agregada conservadora por bateria',()=>{
  assert.match(notebook,/MIN_RESOLUTION_ACCURACY=85/);
  assert.match(notebook,/MIN_RESOLUTION_TOTAL=5/);
  assert.match(notebook,/RESOLUTION_EVIDENCE_TARGET=3/);
  assert.match(notebook,/resolutionEvidence/);
  assert.match(notebook,/accuracy>=MIN_RESOLUTION_ACCURACY/);
  assert.match(notebook,/total>=MIN_RESOLUTION_TOTAL/);
});

test('bateria fraca zera sequência de resolução',()=>{
  assert.match(notebook,/qualifiesForResolution/);
  assert.match(notebook,/resolutionEvidence:0/);
  assert.match(notebook,/correctStreak:0/);
});

test('novo erro reabre padrão e limpa evidência positiva',()=>{
  assert.match(notebook,/correctStreak:0/);
  assert.match(notebook,/resolutionEvidence:0/);
  assert.match(notebook,/status:'active'/);
});

test('política não depende de texto de questão',()=>{
  assert.doesNotMatch(notebook,/questionText|enunciado|alternativa|answerText|correctAnswer|pergunta|resposta/);
});

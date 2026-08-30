const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const intelligence=fs.readFileSync('public/js/question-performance-intelligence.js','utf8');
const notebook=fs.readFileSync('public/js/intelligent-error-notebook.js','utf8');
const weakness=fs.readFileSync('public/js/weakness-map-v2.js','utf8');

test('bateria agregada sem sinais específicos não inventa causa conceitual',()=>{
  assert.match(intelligence,/unclassified/);
  assert.match(intelligence,/detail\.source==='core-question-performance'.*return 'unclassified'/s);
});

test('volume de erros da bateria é preservado no perfil',()=>{
  assert.match(intelligence,/occurrencesFrom/);
  assert.match(intelligence,/errorCount/);
  assert.match(intelligence,/counts\[row\.type\]\+=Math\.max\(1/);
  assert.match(intelligence,/eventCount:rows\.length/);
});

test('caderno acumula ocorrências reais sem armazenar conteúdo',()=>{
  assert.match(notebook,/detail\.occurrences/);
  assert.match(notebook,/\+occurrences/);
  assert.match(notebook,/activeOccurrences/);
  assert.doesNotMatch(notebook,/questionText|enunciado|alternativa|answerText|correctAnswer/);
});

test('weakness map apresenta erro agregado com rótulo humano',()=>{
  assert.match(weakness,/unclassified:'Não classificado'/);
});

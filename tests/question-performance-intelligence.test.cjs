const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const intelligence=fs.readFileSync('public/js/question-performance-intelligence.js','utf8');
const weakness=fs.readFileSync('public/js/weakness-map-v2.js','utf8');

test('classifica cinco tipos de erro sem armazenar conteúdo da questão',()=>{
  for(const type of ['knowledge','application','interpretation','distraction','recurrence'])assert.match(intelligence,new RegExp(type));
  assert.doesNotMatch(intelligence,/questionText|enunciado|answerText|respostaTexto|correctAnswer/);
});

test('desempenho em questões permanece diagnóstico',()=>{
  assert.match(intelligence,/authority:'diagnostic-only'/);
  assert.doesNotMatch(intelligence,/\.sort\s*\(/);
  assert.doesNotMatch(intelligence,/priorityIndex\s*=/);
  assert.doesNotMatch(intelligence,/nextReviewDate\s*=/);
  assert.doesNotMatch(intelligence,/autoSchedule\s*=\s*true/);
});

test('weakness map consome perfil de erro sem reordenar candidatos',()=>{
  assert.match(weakness,/getTopicProfile/);
  assert.match(weakness,/question-performance-classified/);
  assert.match(weakness,/Erro dominante/);
  assert.doesNotMatch(weakness,/\.sort\s*\(/);
});

test('evento de integração é explícito e conteúdo mínimo',()=>{
  assert.match(intelligence,/adaptive-question-result/);
  assert.match(intelligence,/topicId,type,confidence/);
  assert.match(intelligence,/responseSeconds/);
});

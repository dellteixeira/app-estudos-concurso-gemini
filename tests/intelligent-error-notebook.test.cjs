const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const notebook=fs.readFileSync('public/js/intelligent-error-notebook.js','utf8');
const question=fs.readFileSync('public/js/question-performance-intelligence.js','utf8');

test('caderno registra recorrência e resolução por sequência de acertos',()=>{
  assert.match(notebook,/const RESOLUTION_STREAK=3/);
  assert.match(notebook,/status:'active'/);
  assert.match(notebook,/status:resolved\?'resolved':'active'/);
  assert.match(notebook,/correctStreak>=RESOLUTION_STREAK/);
});

test('novo erro reabre o padrão e zera sequência correta',()=>{
  assert.match(notebook,/status:'active',correctStreak:0/);
  assert.match(notebook,/lastSeenAt:nowIso\(\)/);
});

test('caderno é carregado pela inteligência de questões',()=>{
  assert.match(question,/intelligent-error-notebook\.js/);
  assert.match(question,/ensureErrorNotebook\(\)/);
  assert.match(notebook,/question-performance-classified/);
  assert.match(notebook,/adaptive-question-result/);
});

test('caderno mantém apenas metadados diagnósticos',()=>{
  assert.match(notebook,/topicId/);
  assert.match(notebook,/type/);
  assert.match(notebook,/authority:'diagnostic-only'/);
  assert.doesNotMatch(notebook,/enunciado/);
  assert.doesNotMatch(notebook,/alternativa/);
  assert.doesNotMatch(notebook,/questionText/);
  assert.doesNotMatch(notebook,/answerText/);
});

test('caderno não assume prioridade ou cronograma',()=>{
  assert.doesNotMatch(notebook,/\.sort\(/);
  assert.doesNotMatch(notebook,/priorityIndex\s*=/);
  assert.doesNotMatch(notebook,/nextReviewDate\s*=/);
  assert.doesNotMatch(notebook,/autoSchedule\s*=\s*true/);
  assert.doesNotMatch(notebook,/collectCandidates/);
});

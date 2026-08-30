const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const source=fs.readFileSync('public/js/progress-forecast.js','utf8');

test('forecast usa janela explícita de evidência recente',()=>{
  assert.match(source,/EVIDENCE_WINDOW_DAYS=30/);
  assert.match(source,/function recentEvidence/);
  assert.match(source,/const recent=recentEvidence\(timeline,reference\)/);
  assert.match(source,/feedback=recent\.filter/);
  assert.match(source,/executions=recent\.filter/);
});

test('confiança não pode depender de atividade histórica fora da janela',()=>{
  assert.match(source,/feedback\.length>=6&&executions\.length>=6/);
  assert.match(source,/feedback\.length>=3&&executions\.length>=3/);
  assert.match(source,/evidenceAgeDays/);
});

test('forecast continua observacional e sem promessa de aprovação',()=>{
  assert.match(source,/authority:'forecast-only'/);
  assert.match(source,/não estima chance de aprovação/);
  assert.doesNotMatch(source,/priorityIndex\s*=/);
  assert.doesNotMatch(source,/nextReviewDate\s*=/);
});

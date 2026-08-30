const fs=require('fs');const path=require('path');const test=require('node:test');const assert=require('node:assert/strict');
const file=fs.readFileSync(path.join(__dirname,'../public/js/explainable-recommendations.js'),'utf8');

test('explicações são somente explicativas',()=>{
  assert.match(file,/authority:'explanation-only'/);
  assert.doesNotMatch(file,/\.sort\s*\(/);
  assert.doesNotMatch(file,/nextReviewDate\s*=/);
  assert.doesNotMatch(file,/prioridade\s*=/);
  assert.doesNotMatch(file,/priorityIndex\s*=/);
  assert.doesNotMatch(file,/recommendedAction\s*=/);
  assert.doesNotMatch(file,/suggestedMinutes\s*=/);
});

test('explicações usam evidências existentes',()=>{
  assert.match(file,/getTopicProfile/);
  assert.match(file,/getTopicEntries/);
  assert.match(file,/getEntries/);
  assert.match(file,/retention/);
  assert.match(file,/accuracy/);
  assert.match(file,/lapseCount/);
});

test('explicações não persistem conteúdo de estudo',()=>{
  assert.doesNotMatch(file,/localStorage\.setItem/);
  assert.doesNotMatch(file,/front\s*:/i);
  assert.doesNotMatch(file,/back\s*:/i);
  assert.doesNotMatch(file,/questionText\s*:/i);
  assert.doesNotMatch(file,/answerText\s*:/i);
});

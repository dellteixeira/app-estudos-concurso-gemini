const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const confidence=fs.readFileSync('public/js/adaptive-confidence.js','utf8');

test('confiança conta somente execuções realmente concluídas',()=>{
  assert.match(confidence,/execution_finished'&&item\?\.status==='completed'/);
  assert.match(confidence,/execução concluída recente/);
  assert.doesNotMatch(confidence,/const executions=timeline\.filter\(item=>item\?\.type==='execution_finished'\);/);
});

test('feedback só conta quando possui score numérico atribuído',()=>{
  assert.match(confidence,/function numericScore\(value\)\{return typeof value==='number'&&Number\.isFinite\(value\)\}/);
  assert.match(confidence,/item\?\.type==='feedback'&&numericScore\(item\?\.score\)/);
  assert.match(confidence,/recentAttributedFeedback/);
});

test('camada de confiança continua sem autoridade operacional',()=>{
  assert.match(confidence,/authority:'confidence-only'/);
  assert.doesNotMatch(confidence,/recommendedAction\s*=/);
  assert.doesNotMatch(confidence,/suggestedMinutes\s*=/);
  assert.doesNotMatch(confidence,/nextReviewDate\s*=/);
  assert.doesNotMatch(confidence,/priorityIndex\s*=/);
});

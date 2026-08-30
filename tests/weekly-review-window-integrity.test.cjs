const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const weekly=fs.readFileSync('public/js/adaptive-weekly-review.js','utf8');

test('revisão semanal conta resoluções apenas dentro da janela de 7 dias',()=>{
  assert.match(weekly,/resolvedThisWeek=rows\.filter\(item=>item\?\.type==='error_state'&&item\?\.status==='resolved'\)\.length/);
  assert.match(weekly,/resolvidos na semana/);
  assert.doesNotMatch(weekly,/Number\(notebook\.resolved\)>0\)wins\.push/);
});

test('estado atual e resultado semanal ficam semanticamente separados',()=>{
  assert.match(weekly,/activeErrors:Number\(notebook\.active\)\|\|0/);
  assert.match(weekly,/resolvedThisWeek/);
  assert.match(weekly,/totalResolvedErrors:Number\(notebook\.resolved\)\|\|0/);
});

test('revisão continua observacional',()=>{
  assert.match(weekly,/authority:'review-only'/);
  assert.doesNotMatch(weekly,/nextReviewDate\s*=/);
  assert.doesNotMatch(weekly,/priorityIndex\s*=/);
  assert.doesNotMatch(weekly,/recommendedAction\s*=/);
});

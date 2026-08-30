const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const timeline=fs.readFileSync('public/js/study-evidence-timeline.js','utf8');
const weekly=fs.readFileSync('public/js/adaptive-weekly-review.js','utf8');

test('timeline preserva ocorrências agregadas sem conteúdo textual',()=>{
  assert.match(timeline,/occurrences/);
  assert.match(timeline,/questionErrorOccurrences/);
  assert.match(timeline,/question-performance-classified/);
  assert.doesNotMatch(timeline,/questionText|enunciado|alternativa|answerText|correctAnswer|front:|back:/);
});

test('revisão semanal distingue ocorrências de padrões ativos',()=>{
  assert.match(weekly,/questionErrorOccurrences/);
  assert.match(weekly,/padrão/);
  assert.match(weekly,/erros? em questões/);
});

test('ocorrências não alteram autoridade das camadas observacionais',()=>{
  assert.match(timeline,/authority:'observational-only'/);
  assert.match(weekly,/authority:'review-only'/);
  for(const source of [timeline,weekly]){
    assert.doesNotMatch(source,/priorityIndex\s*=/);
    assert.doesNotMatch(source,/nextReviewDate\s*=/);
    assert.doesNotMatch(source,/autoSchedule\s*=\s*true/);
  }
});

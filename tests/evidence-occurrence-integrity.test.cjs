const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const timeline=fs.readFileSync('public/js/study-evidence-timeline.js','utf8');

test('timeline preserva ocorrências agregadas sem conteúdo textual',()=>{
  assert.match(timeline,/occurrences/);
  assert.match(timeline,/questionErrorOccurrences/);
  assert.match(timeline,/question-performance-classified/);
  assert.doesNotMatch(timeline,/questionText|enunciado|alternativa|answerText|correctAnswer|front:|back:/);
});

test('ocorrências não alteram autoridade da timeline',()=>{
  assert.match(timeline,/authority:'observational-only'/);
  assert.doesNotMatch(timeline,/priorityIndex\s*=/);
  assert.doesNotMatch(timeline,/nextReviewDate\s*=/);
  assert.doesNotMatch(timeline,/autoSchedule\s*=\s*true/);
});

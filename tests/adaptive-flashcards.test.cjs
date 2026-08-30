const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const source=fs.readFileSync('public/js/adaptive-flashcards.js','utf8');
const weakness=fs.readFileSync('public/js/weakness-map-v2.js','utf8');

test('flashcards usam sinais pedagógicos conservadores',()=>{
  assert.match(source,/const RETENTION_THRESHOLD=60/);
  assert.match(source,/activeErrors/);
  assert.match(source,/diagnosisType==='persistent'/);
  assert.match(source,/lowRetention/);
});

test('flashcards preservam a ordem canônica e não criam prioridade',()=>{
  assert.match(source,/collectCandidates\?\.\(MAX_SUGGESTIONS\)/);
  assert.doesNotMatch(source,/\.sort\s*\(/);
  assert.doesNotMatch(source,/priorityIndex\s*=/);
  assert.doesNotMatch(source,/nextReviewDate\s*=/);
  assert.doesNotMatch(source,/autoSchedule\s*=\s*true/);
});

test('flashcards não persistem conteúdo textual',()=>{
  assert.doesNotMatch(source,/localStorage/);
  assert.doesNotMatch(source,/front\s*:/);
  assert.doesNotMatch(source,/back\s*:/);
  assert.doesNotMatch(source,/questionText\s*:/);
  assert.doesNotMatch(source,/answerText\s*:/);
});

test('fluxo usa recuperação ativa existente',()=>{
  assert.match(source,/openActiveRecallGuide/);
  assert.match(source,/method:'flashcards_adaptativos'/);
  assert.match(source,/authority:'pedagogical-method-only'/);
});

test('weakness map carrega flashcards sem duplicar script',()=>{
  assert.match(weakness,/data-adaptive-flashcards/);
  assert.match(weakness,/adaptive-flashcards\.js/);
  assert.match(weakness,/ensureAdaptiveFlashcards\(\)/);
});

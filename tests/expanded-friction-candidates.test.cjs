const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const provider=fs.readFileSync('public/js/diagnostic-candidate-provider.js','utf8');
const session=fs.readFileSync('public/js/session-orchestrator.js','utf8');
const daily=fs.readFileSync('public/js/daily-adaptive-planner.js','utf8');
const flashcards=fs.readFileSync('public/js/adaptive-flashcards.js','utf8');

test('provider replica ranking do Learning Advisor sem teto de cinco',()=>{
  assert.match(provider,/function collectByFriction/);
  assert.match(provider,/b\.frictionScore-a\.frictionScore\|\|a\.prioridade-b\.prioridade/);
  assert.match(provider,/MAX_LIMIT=80/);
  assert.match(provider,/rankingAuthority:'learning-advisor-friction-order'/);
});

test('sessão e plano diário usam ranking amplo com fallback compatível',()=>{
  assert.match(session,/collectByFriction\?\.\(limit\)/);
  assert.match(daily,/collectByFriction\?\.\(limit\)/);
  assert.match(session,/collectCandidates\?\.\(5\)/);
  assert.match(daily,/collectCandidates\?\.\(5\)/);
});

test('flashcards varrem até 40 candidatos e exibem no máximo cinco sugestões',()=>{
  assert.match(flashcards,/CANDIDATE_SCAN_LIMIT=40/);
  assert.match(flashcards,/MAX_SUGGESTIONS=5/);
  assert.match(flashcards,/currentSuggestions\.length>=MAX_SUGGESTIONS/);
});

test('expansão não assume autoridade de agenda',()=>{
  assert.match(session,/scheduleAuthority:'retention-engine'/);
  assert.match(daily,/scheduleAuthority:'retention-engine'/);
  assert.doesNotMatch(flashcards,/nextReviewDate\s*=/);
  assert.doesNotMatch(provider,/autoSchedule\s*=\s*true/);
});

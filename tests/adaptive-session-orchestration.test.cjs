const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const orchestrator=fs.readFileSync('public/js/session-orchestrator.js','utf8');
const experience=fs.readFileSync('public/js/adaptive-ai-experience.js','utf8');

test('session orchestrator preserves Learning Advisor candidate ordering',()=>{
  assert.match(orchestrator,/collectCandidates\?\.\(5\)/);
  assert.match(orchestrator,/priorityIndex:blocks\.length/);
  assert.match(orchestrator,/authority:'learning-advisor-friction-order'/);
  assert.match(orchestrator,/scheduleAuthority:'retention-engine'/);
  assert.doesNotMatch(orchestrator,/\.sort\(/);
  assert.doesNotMatch(orchestrator,/prioridade\s*[+\-*/]?=/);
});

test('session budget only allocates time and never edits schedule',()=>{
  assert.match(orchestrator,/const BUDGETS=\[20,40,60\]/);
  assert.match(orchestrator,/Math\.min\(desired,remaining\)/);
  assert.doesNotMatch(orchestrator,/nextReviewAt|dataProva\s*=|cronograma\s*=|scheduleReview/);
});

test('promoting a block reuses the canonical adaptive plan surface',()=>{
  assert.match(orchestrator,/AppAdaptiveAIExperience\?\.setCurrentPlan/);
  assert.match(orchestrator,/source:'learning-advisor'/);
  assert.match(experience,/function setCurrentPlan\(plan\)/);
  assert.match(experience,/Object\.freeze\(\{refresh,renderPlan,setCurrentPlan,getCurrentPlan/);
});

test('orchestration remains downstream from method calibration',()=>{
  assert.match(orchestrator,/AppMethodCalibration\?\.calibrate/);
  assert.doesNotMatch(orchestrator,/GEMINI_API_KEY|generativelanguage\.googleapis\.com|fetch\(/);
});

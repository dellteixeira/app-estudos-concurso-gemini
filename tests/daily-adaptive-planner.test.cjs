const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const planner=fs.readFileSync('public/js/daily-adaptive-planner.js','utf8');
const orchestrator=fs.readFileSync('public/js/session-orchestrator.js','utf8');

test('planejador diário preserva a ordem do Learning Advisor',()=>{
  assert.match(planner,/AppDiagnosticCandidateProvider\?\.collectByFriction\?\.\(limit\)/);
  assert.match(planner,/AppLearningAdvisor\?\.collectCandidates\?\.\(5\)/);
  assert.doesNotMatch(planner,/\.sort\s*\(/);
  assert.match(planner,/priorityIndex:blocks\.length/);
  assert.match(planner,/authority:'learning-advisor-friction-order'/);
  assert.match(planner,/scheduleAuthority:'retention-engine'/);
});

test('planejador diário apenas empacota blocos dentro do orçamento',()=>{
  assert.match(planner,/const DAY_BUDGETS=\[60,120,180\]/);
  assert.match(planner,/const SESSION_SLICE=60/);
  assert.match(planner,/Math\.min\(desired,remaining\)/);
  assert.doesNotMatch(planner,/nextReviewDate\s*=/);
  assert.doesNotMatch(planner,/autoSchedule\s*=\s*true/);
  assert.doesNotMatch(planner,/prioridade\s*=/i);
});

test('orquestrador carrega planejador diário sem duplicar script',()=>{
  assert.match(orchestrator,/data-daily-adaptive-planner/);
  assert.match(orchestrator,/daily-adaptive-planner\.js\?v=20260830/);
  assert.match(orchestrator,/ensureDailyPlanner\(\)/);
});

const fs=require('fs');const test=require('node:test');const assert=require('node:assert/strict');
const advisor=fs.readFileSync('public/js/learning-advisor.js','utf8');
const orchestrator=fs.readFileSync('public/js/session-orchestrator.js','utf8');
const planner=fs.readFileSync('public/js/daily-adaptive-planner.js','utf8');
const experience=fs.readFileSync('public/js/adaptive-ai-experience.js','utf8');

test('Learning Advisor é a autoridade explícita do ranking de intervenção',()=>{
  assert.match(advisor,/\.sort\(\(a,b\)=>b\.frictionScore-a\.frictionScore\|\|a\.prioridade-b\.prioridade\)/);
  assert.match(orchestrator,/authority:'learning-advisor-friction-order'/);
  assert.match(planner,/authority:'learning-advisor-friction-order'/);
  assert.doesNotMatch(orchestrator,/authority:'retention-engine-order'/);
  assert.doesNotMatch(planner,/authority:'retention-engine-order'/);
});

test('Retention Engine continua explicitamente autoridade de agenda',()=>{
  assert.match(orchestrator,/scheduleAuthority:'retention-engine'/);
  assert.match(planner,/scheduleAuthority:'retention-engine'/);
  assert.doesNotMatch(orchestrator,/nextReviewDate\s*=/);
  assert.doesNotMatch(planner,/nextReviewDate\s*=/);
});

test('Dashboard identifica corretamente origem local e origem IA',()=>{
  assert.match(experience,/source:'learning-advisor'/);
  assert.match(experience,/source:result\?\.aiUsed\?'ai':'learning-advisor'/);
  assert.match(experience,/Learning Advisor · agenda Retention Engine/);
  assert.doesNotMatch(experience,/source:'retention-engine'/);
});

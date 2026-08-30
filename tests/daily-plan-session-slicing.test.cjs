const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const planner=fs.readFileSync('public/js/daily-adaptive-planner.js','utf8');

test('plano diário fraciona recomendações acima do slice máximo',()=>{
  assert.match(planner,/const SESSION_SLICE=60/);
  assert.match(planner,/function splitDuration/);
  assert.match(planner,/Math\.ceil\(total\/SESSION_SLICE\)/);
  assert.match(planner,/segmentIndex/);
  assert.match(planner,/segmentCount/);
  assert.match(planner,/totalRecommendedMinutes/);
});

test('nenhuma parte pode ser menor que o mínimo pedagógico',()=>{
  assert.match(planner,/const MIN_BLOCK_MINUTES=5/);
  assert.match(planner,/filter\(value=>value>=MIN_BLOCK_MINUTES\)/);
});

test('sessões continuam sem autoridade de agenda',()=>{
  assert.match(planner,/authority:'learning-advisor-friction-order'/);
  assert.match(planner,/scheduleAuthority:'retention-engine'/);
  assert.doesNotMatch(planner,/nextReviewDate\s*=/);
  assert.doesNotMatch(planner,/autoSchedule\s*=\s*true/);
});

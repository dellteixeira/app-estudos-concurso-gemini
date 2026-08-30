const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const strategy=fs.readFileSync('public/js/exam-proximity-strategy.js','utf8');
const planner=fs.readFileSync('public/js/daily-adaptive-planner.js','utf8');

test('estratégia define fases explícitas por dias até a prova',()=>{
  assert.match(strategy,/foundation:\{minDays:91/);
  assert.match(strategy,/consolidation:\{minDays:31/);
  assert.match(strategy,/intensification:\{minDays:8/);
  assert.match(strategy,/final:\{minDays:0/);
  assert.match(strategy,/daysUntilExam/);
});

test('proximidade altera apenas composição pedagógica',()=>{
  assert.match(strategy,/pedagogical-composition-only/);
  assert.match(strategy,/recommendedAction:preferred/);
  assert.doesNotMatch(strategy,/collectCandidates/);
  assert.doesNotMatch(strategy,/\.sort\(/);
  assert.doesNotMatch(strategy,/priorityIndex\s*=/);
  assert.doesNotMatch(strategy,/nextReviewDate\s*=/);
  assert.doesNotMatch(strategy,/autoSchedule\s*=\s*true/);
});

test('planejador preserva ranking do Advisor e aplica estratégia antes da calibração pessoal',()=>{
  assert.match(planner,/collectCandidates\?\.\(12\)/);
  assert.match(planner,/calibrate\(adaptToExam\(advisor\.localIntervention\(candidate\)\)\)/);
  assert.match(planner,/priorityIndex:blocks\.length/);
  assert.match(planner,/authority:'learning-advisor-friction-order'/);
  assert.match(planner,/scheduleAuthority:'retention-engine'/);
  assert.doesNotMatch(planner,/\.sort\(/);
});

test('data da prova é configuração local e não vira autoridade de prioridade',()=>{
  assert.match(strategy,/adaptive_exam_strategy_v1/);
  assert.match(strategy,/type=\"date\"/);
  assert.doesNotMatch(strategy,/prioridade\s*[+\-*/]?=/i);
  assert.doesNotMatch(strategy,/schedule/i);
});

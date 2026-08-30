const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const planner=fs.readFileSync('public/js/daily-adaptive-planner.js','utf8');
const orchestrator=fs.readFileSync('public/js/session-orchestrator.js','utf8');
const css=fs.readFileSync('public/css/session-orchestrator.css','utf8');

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

test('Plano do Dia tem estado executável próprio e persiste somente no dia corrente',()=>{
  assert.match(planner,/adaptive_daily_plan_execution_v1/);
  assert.match(planner,/todayKey\(\)/);
  assert.match(planner,/block\.completed/);
  assert.match(planner,/block\.active/);
  assert.match(planner,/activeBlockId/);
  assert.match(planner,/completedMinutes\(plan\)/);
  assert.match(planner,/remainingMinutes\(plan\)/);
});

test('início promove o bloco sem alterar autoridade de agenda',()=>{
  assert.match(planner,/function startBlock\(index\)/);
  assert.match(planner,/setCurrentPlan\?\.\(plan\)/);
  assert.match(planner,/executionOwner:'daily-plan'/);
  assert.match(planner,/adaptive-day-block-started/);
  assert.doesNotMatch(planner,/nextReviewDate\s*=/);
});

test('conclusão diária exige 70 por cento e avança apenas após evidência concluída',()=>{
  assert.match(planner,/const MIN_COMPLETION_RATIO=\.7/);
  assert.match(planner,/ratio>=MIN_COMPLETION_RATIO/);
  assert.match(planner,/AppAdaptiveSessionCompletion\?\.finish\?\.\('completed'/);
  assert.match(planner,/detail\.owner!=='daily-plan'/);
  assert.match(planner,/detail\.status!=='completed'/);
  assert.match(planner,/adaptive-day-block-completed/);
  assert.match(planner,/setTimeout\(startNext,0\)/);
});

test('interface expõe progresso, iniciar, concluir e próximo bloco',()=>{
  assert.match(planner,/dailyAdaptiveProgress/);
  assert.match(planner,/Concluir bloco atual/);
  assert.match(planner,/Iniciar próximo/);
  assert.match(planner,/data-day-block-index/);
  assert.match(planner,/Em andamento/);
  assert.match(planner,/Concluído/);
  assert.match(css,/\.daily-adaptive-progress/);
  assert.match(css,/\.daily-adaptive-block\.is-active/);
  assert.match(css,/\.daily-adaptive-block\.is-completed/);
  assert.match(css,/\.daily-adaptive-controls/);
});

test('orquestrador carrega planejador diário sem duplicar script',()=>{
  assert.match(orchestrator,/data-daily-adaptive-planner/);
  assert.match(orchestrator,/daily-adaptive-planner\.js\?v=20260830/);
  assert.match(orchestrator,/ensureDailyPlanner\(\)/);
});

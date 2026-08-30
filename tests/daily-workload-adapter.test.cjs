const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const adapter=fs.readFileSync('public/js/daily-workload-adapter.js','utf8');
const orchestrator=fs.readFileSync('public/js/session-orchestrator.js','utf8');

test('ajuste de carga usa somente evidência de execução do Plano do Dia',()=>{
  assert.match(adapter,/AppAdaptiveSessionCompletion\?\.getHistory\?\.\(\)/);
  assert.match(adapter,/item\?\.owner!=='daily-plan'/);
  assert.match(adapter,/LOOKBACK_DAYS=7/);
  assert.match(adapter,/MIN_ATTEMPTS=2/);
  assert.match(adapter,/execution-evidence-only/);
});

test('tempo escolhido pelo usuário é teto e ajuste nunca aumenta a carga',()=>{
  assert.match(adapter,/const PRESETS=\[60,120,180\]/);
  assert.match(adapter,/const effective=low&&index>0\?PRESETS\[index-1\]:requested/);
  assert.match(adapter,/adjusted:effective<requested/);
  assert.doesNotMatch(adapter,/PRESETS\[index\+1\]/);
  assert.match(adapter,/execution-load-cap-only/);
});

test('evidência insuficiente mantém o orçamento solicitado',()=>{
  assert.match(adapter,/evidence\.attempts<MIN_ATTEMPTS/);
  assert.match(adapter,/effectiveBudget:requested,adjusted:false,reason:'insufficient-prior-evidence'/);
});

test('aderência baixa considera conclusão, razão média, minutos e interrupções',()=>{
  assert.match(adapter,/evidence\.completionRate<75/);
  assert.match(adapter,/evidence\.averageCompletionRatio<\.75/);
  assert.match(adapter,/evidence\.executionAdherence<75/);
  assert.match(adapter,/evidence\.interruptions>=2/);
  assert.match(adapter,/interruptionRate>=\.5/);
});

test('adaptação intercepta orçamento diário e reconstrói plano no limite efetivo',()=>{
  assert.match(adapter,/\[data-day-budget\]/);
  assert.match(adapter,/event\.stopImmediatePropagation\(\)/);
  assert.match(adapter,/planner\.buildDay\(decision\.effectiveBudget\)/);
  assert.match(adapter,/plan\.requestedBudget=decision\.requestedBudget/);
  assert.match(adapter,/plan\.workloadAdjustment=decision/);
  assert.match(adapter,/adaptive-day-workload-adjusted/);
});

test('ajuste de carga não toma autoridade de agenda nem altera prioridade',()=>{
  assert.doesNotMatch(adapter,/nextReviewDate\s*=/);
  assert.doesNotMatch(adapter,/prioridade\s*=/i);
  assert.doesNotMatch(adapter,/autoSchedule\s*=\s*true/);
  assert.match(adapter,/agenda do Retention Engine não foi alterada/);
});

test('orquestrador carrega adaptador de carga sem duplicar script',()=>{
  assert.match(orchestrator,/data-daily-workload-adapter/);
  assert.match(orchestrator,/daily-workload-adapter\.js\?v=20260830/);
  assert.match(orchestrator,/ensureDailyWorkloadAdapter\(\)/);
});

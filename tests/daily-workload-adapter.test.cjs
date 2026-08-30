const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const adapter=fs.readFileSync('public/js/daily-workload-adapter.js','utf8');
const orchestrator=fs.readFileSync('public/js/session-orchestrator.js','utf8');
const css=fs.readFileSync('public/css/session-orchestrator.css','utf8');

test('ajuste de carga usa somente evidência de execução do Plano do Dia',()=>{
  assert.match(adapter,/AppAdaptiveSessionCompletion\?\.getHistory\?\.\(\)/);
  assert.match(adapter,/item\?\.owner!=='daily-plan'/);
  assert.match(adapter,/LOOKBACK_DAYS=7/);
  assert.match(adapter,/MIN_TREND_DAYS=3/);
  assert.match(adapter,/execution-evidence-only/);
});

test('tendência pondera mais os dias recentes e exige múltiplos dias',()=>{
  assert.match(adapter,/weightForAge\(age\)/);
  assert.match(adapter,/LOOKBACK_DAYS-Math\.max\(1,Number\(age\)\|\|1\)\+1/);
  assert.match(adapter,/dayCount>=MIN_TREND_DAYS/);
  assert.match(adapter,/requiredStressedDays=Math\.max\(2,Math\.ceil\(dayCount\/2\)\)/);
  assert.match(adapter,/stressedDays>=requiredStressedDays&&weightedLow/);
});

test('tempo escolhido pelo usuário é teto e ajuste nunca aumenta a carga',()=>{
  assert.match(adapter,/const PRESETS=\[60,120,180\]/);
  assert.match(adapter,/const effective=trend\.overloadProbable&&index>0\?PRESETS\[index-1\]:requested/);
  assert.match(adapter,/adjusted:effective<requested/);
  assert.doesNotMatch(adapter,/PRESETS\[index\+1\]/);
  assert.match(adapter,/execution-load-cap-only/);
});

test('evidência insuficiente mantém o orçamento solicitado',()=>{
  assert.match(adapter,/!trend\.enoughEvidence/);
  assert.match(adapter,/effectiveBudget:requested,adjusted:false,reason:'insufficient-prior-evidence'/);
  assert.match(adapter,/classification:'insufficient'/);
});

test('sobrecarga considera conclusão, execução, aderência e interrupções',()=>{
  assert.match(adapter,/weightedCompletionRate<HEALTHY_THRESHOLD/);
  assert.match(adapter,/weightedCompletionRatio<HEALTHY_THRESHOLD\/100/);
  assert.match(adapter,/weightedExecutionAdherence<HEALTHY_THRESHOLD/);
  assert.match(adapter,/weightedInterruptionRate>=INTERRUPTION_THRESHOLD/);
  assert.match(adapter,/classification=!enoughEvidence\?'insufficient':overloadProbable\?'overload-probable':'stable'/);
});

test('piso de 60 minutos não é confundido com tendência estável',()=>{
  assert.match(adapter,/trend\.overloadProbable&&index===0\?'minimum-load-floor':'adherence-sustained'/);
  assert.match(adapter,/Carga mantida no piso de/);
  assert.doesNotMatch(adapter,/PRESETS\[-1\]/);
});

test('API antiga de último dia permanece disponível por compatibilidade',()=>{
  assert.match(adapter,/function latestPriorDayEvidence\(\)/);
  assert.match(adapter,/latestPriorDayEvidence,applyRequestedBudget/);
});

test('adaptação intercepta orçamento diário e reconstrói plano no limite efetivo',()=>{
  assert.match(adapter,/\[data-day-budget\]/);
  assert.match(adapter,/event\.stopImmediatePropagation\(\)/);
  assert.match(adapter,/planner\.buildDay\(decision\.effectiveBudget\)/);
  assert.match(adapter,/plan\.requestedBudget=decision\.requestedBudget/);
  assert.match(adapter,/plan\.workloadAdjustment=decision/);
  assert.match(adapter,/adaptive-day-workload-adjusted/);
  assert.match(adapter,/trendDays:decision\.trend\?\.dayCount\|\|0/);
});

test('ajuste de carga não toma autoridade de agenda nem altera prioridade',()=>{
  assert.doesNotMatch(adapter,/nextReviewDate\s*=/);
  assert.doesNotMatch(adapter,/prioridade\s*=/i);
  assert.doesNotMatch(adapter,/autoSchedule\s*=\s*true/);
  assert.match(adapter,/agenda do Retention Engine não foi alterada/);
});

test('nota de carga usa CSS canônico e expõe estados de tendência',()=>{
  assert.match(css,/\.daily-adaptive-workload-note/);
  assert.match(css,/data-trend="stable"/);
  assert.match(css,/data-trend="overload-probable"/);
  assert.match(css,/data-trend="insufficient"/);
  assert.doesNotMatch(adapter,/createElement\('style'\)/);
  assert.doesNotMatch(adapter,/style\.textContent/);
});

test('orquestrador continua carregando o mesmo adaptador sem duplicar script',()=>{
  assert.match(orchestrator,/data-daily-workload-adapter/);
  assert.match(orchestrator,/daily-workload-adapter\.js\?v=20260830/);
  assert.match(orchestrator,/ensureDailyWorkloadAdapter\(\)/);
});

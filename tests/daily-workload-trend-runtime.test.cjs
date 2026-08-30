const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/daily-workload-adapter.js','utf8');

function stamp(daysAgo,hour=12){
  const date=new Date();
  date.setDate(date.getDate()-daysAgo);
  date.setHours(hour,0,0,0);
  return date.toISOString();
}
function record(daysAgo,{status='completed',planned=60,elapsed=55,ratio=.92}={}){
  return {owner:'daily-plan',status,plannedMinutes:planned,elapsedMinutes:elapsed,completionRatio:ratio,startedAt:stamp(daysAgo,10),finishedAt:stamp(daysAgo,12)};
}
function load(history){
  const window={
    AppAdaptiveSessionCompletion:{getHistory:()=>history},
    addEventListener(){},
    dispatchEvent(){},
    CustomEvent:function CustomEvent(type,init){this.type=type;this.detail=init?.detail}
  };
  const document={readyState:'complete',addEventListener(){},getElementById(){return null}};
  const context={window,document,console,setTimeout(){return 0},clearTimeout(){},Date,Math,Map,Set,Object,Number,String,Boolean,Array,JSON,Infinity,CustomEvent:window.CustomEvent};
  vm.runInNewContext(source,context,{filename:'daily-workload-adapter.js'});
  return window.AppDailyWorkloadAdapter;
}

test('três dias saudáveis mantêm a carga solicitada',()=>{
  const api=load([
    record(1),record(1,{elapsed:58,ratio:.97}),
    record(2),record(2,{elapsed:52,ratio:.87}),
    record(3),record(3,{elapsed:57,ratio:.95})
  ]);
  const decision=api.evaluate(180);
  assert.equal(decision.classification,'stable');
  assert.equal(decision.effectiveBudget,180);
  assert.equal(decision.adjusted,false);
  assert.equal(decision.trend.dayCount,3);
});

test('sobrecarga consistente em múltiplos dias reduz somente um degrau',()=>{
  const bad={status:'interrupted',planned:60,elapsed:25,ratio:.42};
  const history=[record(1,bad),record(1,bad),record(2,bad),record(2),record(3,bad),record(3,bad)];
  const api=load(history);
  const decision=api.evaluate(180);
  assert.equal(decision.classification,'overload-probable');
  assert.equal(decision.effectiveBudget,120);
  assert.equal(decision.adjusted,true);
  assert.ok(decision.trend.stressedDays>=decision.trend.requiredStressedDays);
});

test('um único dia ruim não derruba uma tendência majoritariamente saudável',()=>{
  const bad={status:'interrupted',planned:60,elapsed:20,ratio:.33};
  const history=[record(1,bad),record(1,bad),record(2),record(2),record(3),record(3),record(4),record(4)];
  const api=load(history);
  const decision=api.evaluate(120);
  assert.equal(decision.classification,'stable');
  assert.equal(decision.effectiveBudget,120);
  assert.equal(decision.adjusted,false);
  assert.equal(decision.trend.stressedDays,1);
});

test('menos de três dias preserva orçamento por evidência insuficiente',()=>{
  const api=load([record(1),record(1),record(2),record(2)]);
  const decision=api.evaluate(180);
  assert.equal(decision.classification,'insufficient');
  assert.equal(decision.effectiveBudget,180);
  assert.equal(decision.reason,'insufficient-prior-evidence');
});

test('piso de 60 minutos nunca é reduzido mesmo com sobrecarga provável',()=>{
  const bad={status:'interrupted',planned:60,elapsed:15,ratio:.25};
  const api=load([record(1,bad),record(1,bad),record(2,bad),record(2,bad),record(3,bad),record(3,bad)]);
  const decision=api.evaluate(60);
  assert.equal(decision.classification,'overload-probable');
  assert.equal(decision.effectiveBudget,60);
  assert.equal(decision.adjusted,false);
  assert.equal(decision.reason,'minimum-load-floor');
});

test('nenhum cenário aumenta automaticamente o orçamento escolhido',()=>{
  const api=load([record(1),record(1),record(2),record(2),record(3),record(3),record(4),record(4)]);
  for(const budget of [60,120,180]){
    const decision=api.evaluate(budget);
    assert.ok(decision.effectiveBudget<=budget);
  }
});

test('registros de outros owners e de hoje são ignorados na tendência',()=>{
  const today={...record(1),startedAt:new Date().toISOString(),finishedAt:new Date().toISOString()};
  const foreign={...record(1),owner:'adaptive-session'};
  const api=load([today,foreign,record(1),record(2),record(3)]);
  const trend=api.trendEvidence();
  assert.equal(trend.dayCount,3);
  assert.equal(trend.attempts,3);
});

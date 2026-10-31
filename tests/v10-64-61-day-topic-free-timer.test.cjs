const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const core=fs.readFileSync('public/js/app-core.js','utf8');
const css=fs.readFileSync('public/css/dashboard.css','utf8');

test('modal diario oferece cronometro livre por topico',()=>{
  assert.match(core,/Cronômetro livre/);
  assert.match(core,/startScheduledFreeTimer\(\$\{idx\}\)/);
  assert.match(core,/Parar e contabilizar/);
});

test('cronometro livre conta para cima usando Date.now',()=>{
  assert.match(core,/Date\.now\(\) - Number\(scheduledFreeTimerState\.startedAtMs\)/);
  assert.match(core,/accumulatedSeconds/);
});

test('pausa preserva tempo e retomada nao contabiliza',()=>{
  assert.match(core,/scheduledFreeTimerState\.accumulatedSeconds = syncScheduledFreeTimer\(\)/);
  assert.match(core,/scheduledFreeTimerState\.paused = true/);
  assert.match(core,/scheduledFreeTimerState\.startedAtMs = Date\.now\(\)/);
});

test('parada registra minutos no mesmo fluxo canonico',()=>{
  assert.match(core,/recordStudyMinutesForContext\(completedMinutes, context\)/);
  assert.match(core,/materia: scheduledFreeTimerState\.materia/);
  assert.match(core,/assunto: scheduledFreeTimerState\.assunto/);
  assert.match(core,/activityType: scheduledFreeTimerState\.activityType/);
});

test('somente um cronometro livre pode ficar ativo',()=>{
  assert.match(core,/Já existe outro cronômetro livre em andamento/);
});

test('layout do cronometro livre e responsivo',()=>{
  assert.match(css,/\.scheduled-free-timer\s*\{/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(max-width:480px\)/);
});

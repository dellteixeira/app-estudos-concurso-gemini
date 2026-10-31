const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const core=fs.readFileSync('public/js/app-core.js','utf8');
const css=fs.readFileSync('public/css/dashboard.css','utf8');

test('modal diario oferece Pomodoro livre integrado por topico',()=>{
  assert.match(core,/Pomodoro livre/);
  assert.match(core,/startScheduledFreeTimer\(\$\{idx\}\)/);
  assert.match(core,/Parar e contabilizar/);
  assert.match(core,/integrado/);
});

test('cronometro do modal usa o mesmo timerMode free do Pomodoro',()=>{
  assert.match(core,/timerMode = 'free'/);
  assert.match(core,/startTimer\(\)/);
  assert.match(core,/getCurrentTimerElapsedSeconds\(\)/);
  assert.doesNotMatch(core,/scheduledFreeTimerState/);
});

test('pausa e retomada reutilizam o controle canonico do Pomodoro',()=>{
  assert.match(core,/function toggleScheduledPomodoroPause\(\)[\s\S]*togglePauseTimer\(\)/);
});

test('parada reutiliza a conclusao canonica e atualiza painel Pomodoro',()=>{
  assert.match(core,/function stopScheduledPomodoroAndRecord\(\)[\s\S]*completeFocusSessionNow\(\)/);
  assert.match(core,/renderPomodoroDailyCounter\(\)/);
  assert.match(core,/recordStudyMinutesForContext\(completedMinutes, finalContext\)/);
});

test('contexto do topico alimenta o Pomodoro com materia assunto e atividade',()=>{
  assert.match(core,/source: 'cronograma-pomodoro-livre'/);
  assert.match(core,/materia: matched\.materia/);
  assert.match(core,/assunto: matched\.assunto/);
  assert.match(core,/activityType/);
});

test('layout integrado e responsivo',()=>{
  assert.match(css,/scheduled-free-timer-toolbar/);
  assert.match(css,/scheduled-timer-btn-start/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(max-width:480px\)/);
});

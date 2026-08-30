const fs=require('fs');const path=require('path');const test=require('node:test');const assert=require('node:assert/strict');
const bridge=fs.readFileSync(path.join(__dirname,'../public/js/adaptive-pomodoro-bridge.js'),'utf8');
const completion=fs.readFileSync(path.join(__dirname,'../public/js/session-completion.js'),'utf8');
const continuity=fs.readFileSync(path.join(__dirname,'../public/js/session-continuity.js'),'utf8');

test('ponte observa somente quando existe execução adaptativa ativa',()=>{
  assert.match(bridge,/getActiveExecution/);
  assert.match(bridge,/sameExecution/);
  assert.match(bridge,/adaptive-study-execution/);
  assert.match(bridge,/source:'pomodoro-runtime'/);
});

test('ponte cobre conclusão automática, manual e reset',()=>{
  assert.match(bridge,/completeElapsedTimerCycle/);
  assert.match(bridge,/completeFocusSessionNow/);
  assert.match(bridge,/resetTimer/);
  assert.match(bridge,/emit\('completed'/);
  assert.match(bridge,/before>=1\?'interrupted':'abandoned'/);
});

test('conclusão adaptativa carrega ponte com marcador estável',()=>{
  assert.match(completion,/data-adaptive-pomodoro-bridge/);
  assert.match(completion,/\.\/js\/adaptive-pomodoro-bridge\.js\?v=20260830/);
  assert.match(completion,/ensurePomodoroBridge\(\)/);
});

test('botão manual não ignora regra de setenta por cento',()=>{
  assert.match(continuity,/const MIN_COMPLETION_RATIO=\.7/);
  assert.match(continuity,/addEventListener\('click',finishActiveExecution\)/);
  assert.doesNotMatch(continuity,/addEventListener\('click',completeActive\)/);
  assert.match(continuity,/ratio>=MIN_COMPLETION_RATIO/);
  assert.match(continuity,/completion\.finish\('completed',\{elapsedMinutes:state\.elapsedMinutes\}\)/);
});

test('ponte não persiste conteúdo nem altera prioridade ou agenda',()=>{
  for(const file of [bridge,continuity]){
    assert.doesNotMatch(file,/nextReviewDate\s*=/);
    assert.doesNotMatch(file,/prioridade\s*=/);
    assert.doesNotMatch(file,/priorityIndex\s*=/);
    assert.doesNotMatch(file,/questionText\s*:/i);
    assert.doesNotMatch(file,/answerText\s*:/i);
  }
});

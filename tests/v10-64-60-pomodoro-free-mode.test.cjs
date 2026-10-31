const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const core=fs.readFileSync('public/js/app-core.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const pwa=fs.readFileSync('public/js/app-pwa.js','utf8');

test('pomodoro oferece modo livre ilimitado na interface',()=>{
  assert.match(html,/id="freeTimerBtn"[^>]+data-call="startFreeFocusTimer"[^>]*>Livre</);
  assert.match(html,/Modo <strong>Livre<\/strong>: conta o tempo para cima sem limite/);
});

test('modo livre usa relogio crescente e nao conclui automaticamente',()=>{
  assert.match(core,/timerMode === 'free'[\s\S]*freeTimerStartedAtMs/);
  assert.match(core,/if \(timerMode === 'free'\) return Math\.max\(0, Number\(timeLeft\) \|\| 0\)/);
  assert.match(core,/if \(timerMode !== 'free' && timeLeft <= 0\) void completeElapsedTimerCycle\(\)/);
});

test('pausa preserva acumulado e retomada aceita modo livre',()=>{
  assert.match(core,/freeTimerElapsedSeconds = Math\.max\(0, Number\(timeLeft\) \|\| 0\)/);
  assert.match(core,/timerMode === 'free' \|\| timeLeft > 0/);
});

test('parar modo livre registra sessao vinculada pelo fluxo existente',()=>{
  assert.match(core,/\['focus','free'\]\.includes\(timerMode\)/);
  assert.match(core,/recordStudyMinutesForContext\(completedMinutes, finalContext\)/);
  assert.match(core,/timerMode === 'free' \? 'Parar e registrar' : 'Concluir sessão'/);
});

test('acao do modo livre fica exposta para navegacao delegada',()=>{
  assert.match(pwa,/window\.startFreeFocusTimer = startFreeFocusTimer/);
});

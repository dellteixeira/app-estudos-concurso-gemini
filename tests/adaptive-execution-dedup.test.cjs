const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const completion=fs.readFileSync('public/js/session-completion.js','utf8');
const bridge=fs.readFileSync('public/js/adaptive-pomodoro-bridge.js','utf8');
const continuity=fs.readFileSync('public/js/session-continuity.js','utf8');

test('finish nunca cria implicitamente um novo bloco',()=>{
  assert.match(completion,/const execution=activeExecution;/);
  assert.doesNotMatch(completion,/activeExecution\|\|begin\(\)/);
  assert.match(completion,/if\(!execution\)return null/);
});

test('evento externo só finaliza a execução ativa correspondente',()=>{
  assert.match(completion,/const execution=activeExecution;if\(!execution\)return null/);
  assert.match(completion,/topicId&&topicId!==execution\.topicId/);
  assert.match(completion,/return finish\(status/);
});

test('histórico rejeita duplicidade pelo identificador natural da execução',()=>{
  assert.match(completion,/item\?\.topicId===record\.topicId&&item\?\.startedAt===record\.startedAt/);
  assert.match(completion,/if\(duplicate\)return null/);
});

test('begin é idempotente e não sobrescreve outra execução ativa',()=>{
  assert.match(completion,/if\(activeExecution\)return activeExecution\.topicId===topicId\?activeExecution:null/);
});

test('ponte Pomodoro protege wrappers e tenta instalação até runtime ficar pronto',()=>{
  assert.match(bridge,/original\[WRAPPED\]\)return true/);
  assert.match(bridge,/MAX_INSTALL_ATTEMPTS=40/);
  assert.match(bridge,/installUntilReady/);
  assert.match(bridge,/setTimeout\(tryInstall,100\)/);
  assert.match(bridge,/current\.startedAt===snapshot\.startedAt/);
});

test('conclusão manual continua exigindo pelo menos 70 por cento do bloco',()=>{
  assert.match(continuity,/MIN_COMPLETION_RATIO=\.7/);
  assert.match(continuity,/state\.eligible/);
  assert.match(continuity,/completion\.finish\('completed'/);
});

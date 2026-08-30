const fs=require('fs');
const path=require('path');
const test=require('node:test');
const assert=require('node:assert/strict');

const root=path.join(__dirname,'..');
const completion=fs.readFileSync(path.join(root,'public/js/session-completion.js'),'utf8');
const continuity=fs.readFileSync(path.join(root,'public/js/session-continuity.js'),'utf8');

test('classifica execução concluída, interrompida e abandonada',()=>{
  assert.match(completion,/completed/);
  assert.match(completion,/interrupted/);
  assert.match(completion,/abandoned/);
  assert.match(completion,/completionRatio/);
  assert.match(completion,/completionRatio<\.7\?'interrupted'/);
});

test('só conclui continuidade após execução efetivamente concluída',()=>{
  assert.match(completion,/effectiveStatus==='completed'/);
  assert.match(completion,/AppSessionContinuity\?\.completeActive/);
  assert.doesNotMatch(completion,/collectCandidates/);
  assert.doesNotMatch(completion,/\.sort\(/);
});

test('mantém histórico operacional sem conteúdo pedagógico sensível',()=>{
  assert.match(completion,/plannedMinutes/);
  assert.match(completion,/elapsedMinutes/);
  assert.match(completion,/action/);
  for(const forbidden of ['prompt','response','materia','assunto','email','userId']){
    assert.equal(completion.includes(forbidden),false,`não deve persistir ${forbidden}`);
  }
});

test('continuidade carrega detector sem tornar IA eager',()=>{
  assert.match(continuity,/session-completion\.js/);
  assert.match(continuity,/ensureCompletion\(\)/);
  assert.doesNotMatch(continuity,/loadBundle\(['"]ai['"]\)/);
});

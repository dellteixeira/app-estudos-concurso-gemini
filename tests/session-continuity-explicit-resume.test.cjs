const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const source=fs.readFileSync('public/js/session-continuity.js','utf8');

function functionBody(name){
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`${name} deve existir`);
  const next=source.indexOf('\nfunction ',start+1);
  return source.slice(start,next===-1?source.length:next);
}

test('restore recompõe estado sem promover bloco automaticamente',()=>{
  const restore=functionBody('restore');
  assert.match(restore,/applyState\(session\)/);
  assert.match(restore,/orchestrator\.render\?\.\(session\)/);
  assert.match(restore,/decorate\(session\)/);
  assert.doesNotMatch(restore,/promote\?\.\(/);
});

test('retomada explícita promove primeiro o tópico pausado salvo',()=>{
  const resume=functionBody('resumeNext');
  assert.match(resume,/activeTopicId\?session\.blocks\.findIndex/);
  assert.match(resume,/blockId\(block\)===activeTopicId&&!block\.completed/);
  assert.match(resume,/if\(index<0\)index=session\.blocks\.findIndex\(block=>!block\.completed\)/);
  assert.match(resume,/AppSessionOrchestrator\?\.promote\?\.\(index\)/);
});

test('estado restaurado é apresentado como pausado até ação do estudante',()=>{
  assert.match(source,/block\?\.active\?'Pausado':'Usar'/);
  assert.match(source,/id="adaptiveSessionResume"/);
  assert.match(source,/>Retomar próximo</);
});

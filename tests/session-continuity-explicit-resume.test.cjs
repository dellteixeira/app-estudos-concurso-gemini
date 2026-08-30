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
  assert.match(restore,/activeTopicId=''/);
  assert.match(restore,/applyState\(session\)/);
  assert.match(restore,/orchestrator\.render\?\.\(session\)/);
  assert.match(restore,/decorate\(session\)/);
  assert.doesNotMatch(restore,/promote\?\.\(/);
});

test('estado persistido é pausado, não ativo, até promoção explícita',()=>{
  const apply=functionBody('applyState');
  assert.match(apply,/const persistedResumeId=safe\(data\.activeTopicId,600\)/);
  assert.match(apply,/block\.active=Boolean\(activeTopicId&&id===activeTopicId&&!block\.completed\)/);
  assert.match(apply,/block\.paused=Boolean\(!activeTopicId&&persistedResumeId&&id===persistedResumeId&&!block\.completed\)/);
  assert.match(source,/classList\.toggle\('is-paused',Boolean\(block\?\.paused\)\)/);
  assert.match(source,/button\.setAttribute\('aria-pressed',block\?\.active\?'true':'false'\)/);
});

test('retomada explícita promove primeiro o tópico pausado salvo',()=>{
  const resume=functionBody('resumeNext');
  assert.match(resume,/const persistedResumeId=safe\(read\(\)\.activeTopicId,600\)/);
  assert.match(resume,/persistedResumeId\?session\.blocks\.findIndex/);
  assert.match(resume,/blockId\(block\)===persistedResumeId&&!block\.completed/);
  assert.match(resume,/if\(index<0\)index=session\.blocks\.findIndex\(block=>!block\.completed\)/);
  assert.match(resume,/AppSessionOrchestrator\?\.promote\?\.\(index\)/);
});

test('UI distingue em andamento de pausado',()=>{
  assert.match(source,/block\?\.active\?'Em andamento':block\?\.paused\?'Pausado':'Usar'/);
  assert.match(source,/id="adaptiveSessionResume"/);
  assert.match(source,/>Retomar próximo</);
});

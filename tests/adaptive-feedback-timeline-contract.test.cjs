const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const feedback=fs.readFileSync('public/js/adaptive-feedback-loop.js','utf8');
const timeline=fs.readFileSync('public/js/study-evidence-timeline.js','utf8');

test('feedback mantém um único evento por lote com itens mínimos',()=>{
  assert.match(feedback,/feedbackEventItems/);
  assert.match(feedback,/items:feedbackEventItems\(completed\)/);
  assert.match(feedback,/count:completed\.length/);
  assert.match(feedback,/attributed:true/);
});

test('itens do evento não expõem baseline ou conteúdo de estudo',()=>{
  const start=feedback.indexOf('function feedbackEventItems');
  const end=feedback.indexOf('function evaluatePending',start);
  const block=feedback.slice(start,end);
  assert.match(block,/topicId:/);
  assert.match(block,/score:/);
  assert.match(block,/outcome:/);
  assert.match(block,/action:/);
  assert.doesNotMatch(block,/baseline|materia|assunto|questionText|pergunta|resposta/);
});

test('timeline desdobra lote em uma entrada por tópico',()=>{
  assert.match(timeline,/function onFeedback/);
  assert.match(timeline,/Array\.isArray\(detail\.items\)/);
  assert.match(timeline,/items\.forEach\(item=>append\('feedback'/);
  assert.match(timeline,/topicId:item\?\.topicId/);
  assert.match(timeline,/score:item\?\.score/);
  assert.match(timeline,/status:item\?\.outcome/);
});

test('listener de feedback não usa mais mapper incompatível',()=>{
  assert.match(timeline,/addEventListener\('adaptive-feedback-evaluated',onFeedback\)/);
  assert.doesNotMatch(timeline,/bind\('adaptive-feedback-evaluated','feedback'/);
});

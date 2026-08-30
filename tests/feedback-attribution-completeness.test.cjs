const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const provider=fs.readFileSync('public/js/diagnostic-candidate-provider.js','utf8');
const feedback=fs.readFileSync('public/js/adaptive-feedback-loop.js','utf8');

test('provider encontra tópico mesmo abaixo do limiar de fricção',()=>{
  assert.match(provider,/function findByTopicId/);
  assert.match(provider,/enforceMinFriction:false/);
  assert.match(provider,/findByTopicId/);
});

test('feedback usa lookup por topicId antes do fallback top 5',()=>{
  assert.match(feedback,/provider\?\.findByTopicId\?\.\(entry\?\.topicId\)/);
  assert.match(feedback,/fallbackById\.get/);
});

test('feedback mantém um único agendador periódico de avaliação',()=>{
  assert.match(feedback,/setInterval\(evaluatePending,EVALUATION_INTERVAL_MS\)/);
  assert.doesNotMatch(feedback,/setTimeout\(evaluatePending,EVALUATION_DELAY_MS\)/);
});

test('atribuição continua somente após execução concluída',()=>{
  assert.match(feedback,/executionStatus!=='completed'/);
  assert.match(feedback,/EVALUATION_DELAY_MS/);
  assert.doesNotMatch(feedback,/questionText|enunciado|alternativa|answerText|correctAnswer/);
});

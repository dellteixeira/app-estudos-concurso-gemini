const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const source=fs.readFileSync('public/js/explainable-recommendations.js','utf8');

test('explicações não exibem códigos técnicos de erro sem tradução',()=>{
  assert.match(source,/unclassified:'Sem causa classificada'/);
  assert.match(source,/knowledge:'Conhecimento'/);
  assert.match(source,/recurrence:'Recorrência'/);
});

test('explicação preserva volume de ocorrências observado',()=>{
  assert.match(source,/errors\.count/);
  assert.match(source,/activeOccurrences/);
  assert.match(source,/ocorrência/);
});

test('camada continua apenas explicativa',()=>{
  assert.match(source,/authority:'explanation-only'/);
  assert.doesNotMatch(source,/priorityIndex\s*=/);
  assert.doesNotMatch(source,/nextReviewDate\s*=/);
});

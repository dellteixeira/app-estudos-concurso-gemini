const test = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../public/js/study-domain.js');

test('diagnóstico ignora tópicos removidos do edital ativo', () => {
  const states=[{key:'A::X',lastStudyAt:'2026-08-18'},{key:'A::Y',lastStudyAt:'2026-08-18'}];
  const result=domain.filterActiveRetentionStates(states,new Set(['A::X']));
  assert.deepEqual(result.map(x=>x.key),['A::X']);
});

test('domínio exige evidência objetiva suficiente', () => {
  assert.equal(domain.hasRetentionMasteryEvidence({questionStats:{total:2,averageAccuracy:100}}),false);
  assert.equal(domain.hasRetentionMasteryEvidence({questionStats:{total:12,averageAccuracy:80}}),true);
});

test('duas recuperações positivas também constituem evidência de domínio', () => {
  assert.equal(domain.hasRetentionMasteryEvidence({ratingCounts:{good:1,easy:1}}),true);
  assert.equal(domain.hasRetentionMasteryEvidence({ratingCounts:{good:1,easy:0}}),false);
});

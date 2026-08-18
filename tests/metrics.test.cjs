const test = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../public/js/study-domain.js');

test('questões não valem metade do progresso com um único registro', () => {
  assert.equal(domain.questionProgressFraction({total:1,accuracy:100}),0.10);
});

test('volume e desempenho elevam progressivamente a contribuição', () => {
  const q5=domain.questionProgressFraction({total:5,accuracy:75});
  const q10=domain.questionProgressFraction({total:10,accuracy:80});
  const q20=domain.questionProgressFraction({total:20,accuracy:100});
  assert.ok(q5 > 0.30 && q5 < q10);
  assert.ok(q10 < q20);
  assert.ok(q20 <= 1);
});

test('checkbox legado mantém contribuição mínima e não domínio artificial', () => {
  assert.equal(domain.questionProgressFraction({legacyChecked:true}),0.10);
});

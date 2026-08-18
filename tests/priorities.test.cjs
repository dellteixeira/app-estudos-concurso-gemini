const test = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../public/js/study-domain.js');

test('nomes seguem ordem canônica e desconhecidos ficam ao final alfabeticamente', () => {
  const result=domain.sortNamesByCanonicalOrder(['Informática','Penal','Civil','Zeta'],['Civil','Penal','Informática']);
  assert.deepEqual(result,['Civil','Penal','Informática','Zeta']);
});

test('ordenação remove duplicatas sem alterar prioridade', () => {
  assert.deepEqual(domain.sortNamesByCanonicalOrder(['B','A','B'],['A','B']),['A','B']);
});

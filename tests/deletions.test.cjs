const test = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../public/js/study-domain.js');

test('exclusão granular seleciona somente o assunto escolhido', () => {
  const items=[
    {id:1,materia:'Direito Civil',assunto:'Contratos'},
    {id:2,materia:'Direito Civil',assunto:'Responsabilidade'},
    {id:3,materia:'Direito Penal',assunto:'Crimes'}
  ];
  assert.deepEqual(domain.getTopicItemsForDeletion(items,'Direito Civil','Contratos').map(x=>x.id),[1]);
});

test('exclusão granular não remove assunto homônimo de outra matéria', () => {
  const items=[{id:1,materia:'A',assunto:'Geral'},{id:2,materia:'B',assunto:'Geral'}];
  assert.deepEqual(domain.getTopicItemsForDeletion(items,'A','Geral').map(x=>x.id),[1]);
});

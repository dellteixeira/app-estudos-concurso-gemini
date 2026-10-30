const test=require('node:test');
const assert=require('node:assert/strict');
const {shouldMergeSubjects,mergeSubjectTitles,buildCrossRows}=require('../public/js/edital-cross-tool.js');

test('reconhece topicos com mesmo nucleo e complementos diferentes',()=>{
  const a='Razões, proporções e divisão proporcional';
  const b='Razões, proporções, regra de três e porcentagem';
  assert.equal(shouldMergeSubjects(a,b),true);
});

test('funde complementos sem perder conteudo relevante',()=>{
  const merged=mergeSubjectTitles([
    'Razões, proporções e divisão proporcional',
    'Razões, proporções, regra de três e porcentagem'
  ]);
  assert.equal(merged,'Razões, proporções, divisão proporcional, regra de três e porcentagem');
});

test('buildCrossRows consolida assuntos similares em uma unica linha',()=>{
  const items=[
    {id:'1',concurso:'TRT-4',materia:'Raciocínio Lógico-Matemático',assunto:'Razões, proporções e divisão proporcional'},
    {id:'2',concurso:'TRT-8',materia:'Raciocínio Lógico-Matemático',assunto:'Razões, proporções, regra de três e porcentagem'}
  ];
  const rows=buildCrossRows(items,['TRT-4','TRT-8']);
  assert.equal(rows.length,1);
  assert.equal(rows[0].status,'related');
  assert.equal(rows[0].assunto,'Razões, proporções, divisão proporcional, regra de três e porcentagem');
  assert.deepEqual(rows[0].sources.sort(),['TRT-4','TRT-8']);
});

test('nao funde assuntos apenas por palavras genericas da materia',()=>{
  assert.equal(
    shouldMergeSubjects('Princípios da Administração Pública','Administração pública direta e indireta'),
    false
  );
});

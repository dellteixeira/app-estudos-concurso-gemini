const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeSubjectRelation,shouldMergeSubjects,canJoinSubjectCluster,mergeSubjectTitles,buildCrossRows}=require('../public/js/edital-cross-tool.js');

test('mantem fusao do exemplo razoes e proporcoes',()=>{
  const a='Razões, proporções e divisão proporcional';
  const b='Razões, proporções, regra de três e porcentagem';
  const rel=analyzeSubjectRelation(a,b);
  assert.equal(rel.merge,true);
  assert.ok(rel.score>=0.66);
});

test('funde variacoes por inclusao de conceitos',()=>{
  assert.equal(shouldMergeSubjects('Licitações e contratos','Licitações, contratos administrativos e fiscalização contratual'),true);
});

test('nao funde leis com marcadores numericos conflitantes',()=>{
  assert.equal(shouldMergeSubjects('Lei nº 8.112/1990 - provimento','Lei nº 14.133/2021 - provimento'),false);
});

test('nao funde topicos apenas vagamente relacionados',()=>{
  assert.equal(shouldMergeSubjects('Princípios da Administração Pública','Administração pública direta e indireta'),false);
  assert.equal(shouldMergeSubjects('Controle de constitucionalidade','Direitos e garantias fundamentais'),false);
});

test('cluster com tres itens exige consenso e evita efeito corrente',()=>{
  const cluster=[
    {assunto:'Razões, proporções e divisão proporcional'},
    {assunto:'Razões, proporções, regra de três e porcentagem'}
  ];
  assert.equal(canJoinSubjectCluster({assunto:'Porcentagem, juros simples e descontos'},cluster),false);
  assert.equal(canJoinSubjectCluster({assunto:'Razões, proporções e porcentagem'},cluster),true);
});

test('titulo consolidado remove repeticoes e preserva complementos',()=>{
  const merged=mergeSubjectTitles([
    'Razões, proporções e divisão proporcional',
    'Razões, proporções, regra de três e porcentagem',
    'Razões, proporções e porcentagem'
  ]);
  assert.equal(merged,'Razões, proporções, divisão proporcional, regra de três e porcentagem');
});

test('buildCrossRows forma cluster coerente e nao absorve topico lateral',()=>{
  const items=[
    {id:'1',concurso:'TRT-4',materia:'Raciocínio Lógico-Matemático',assunto:'Razões, proporções e divisão proporcional'},
    {id:'2',concurso:'TRT-8',materia:'Raciocínio Lógico-Matemático',assunto:'Razões, proporções, regra de três e porcentagem'},
    {id:'3',concurso:'TRT-2',materia:'Raciocínio Lógico-Matemático',assunto:'Razões, proporções e porcentagem'},
    {id:'4',concurso:'TRT-15',materia:'Raciocínio Lógico-Matemático',assunto:'Porcentagem, juros simples e descontos'}
  ];
  const rows=buildCrossRows(items,['TRT-4','TRT-8','TRT-2','TRT-15']);
  assert.equal(rows.length,2);
  const merged=rows.find(r=>r.sources.length===3);
  assert.ok(merged);
  assert.match(merged.assunto,/divisão proporcional/);
  assert.match(merged.assunto,/regra de três/);
  assert.match(merged.assunto,/porcentagem/);
});

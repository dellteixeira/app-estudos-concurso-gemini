const test=require('node:test');
const assert=require('node:assert/strict');
const {canonicalMateria,buildCrossRows,groupRowsByMateria}=require('../public/js/edital-cross-tool.js');

test('consolida aliases de materia em um unico grupo',()=>{
  assert.equal(canonicalMateria('Português'),'Língua Portuguesa');
  assert.equal(canonicalMateria('Língua Portuguesa'),'Língua Portuguesa');
  assert.equal(canonicalMateria('Noções de Direito Administrativo'),'Direito Administrativo');
});

test('nao duplica assunto identico do mesmo edital',()=>{
  const items=[
    {id:'1',concurso:'TRT-4',materia:'Português',assunto:'Interpretação de textos'},
    {id:'2',concurso:'TRT-4',materia:'Língua Portuguesa',assunto:'Interpretação de textos'},
    {id:'3',concurso:'TRT-8',materia:'Língua Portuguesa',assunto:'Interpretação de textos'}
  ];
  const rows=buildCrossRows(items,['TRT-4','TRT-8']);
  assert.equal(rows.length,1);
  assert.equal(rows[0].materia,'Língua Portuguesa');
  assert.equal(rows[0].status,'common');
  assert.deepEqual(rows[0].sources.sort(),['TRT-4','TRT-8']);
});

test('agrupa assuntos sob uma unica materia para a interface',()=>{
  const rows=[
    {id:'a',materia:'Português',assunto:'Ortografia',status:'common',sources:['TRT-4','TRT-8'],included:true},
    {id:'b',materia:'Língua Portuguesa',assunto:'Redação oficial',status:'related',sources:['TRT-4'],included:true}
  ];
  const groups=groupRowsByMateria(rows);
  assert.equal(groups.length,1);
  assert.equal(groups[0].materia,'Língua Portuguesa');
  assert.equal(groups[0].rows.length,2);
  assert.equal(groups[0].counts.common,1);
  assert.equal(groups[0].counts.related,1);
});

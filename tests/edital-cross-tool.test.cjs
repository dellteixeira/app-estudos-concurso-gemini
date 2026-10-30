const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeText,similarity,buildCrossRows}=require('../public/js/edital-cross-tool.js');

test('normalização ignora acentos, caixa e pontuação',()=>{
  assert.equal(normalizeText('Direito Administrativo — Atos!'),'direito administrativo atos');
});

test('cruzamento classifica conteúdo idêntico, relacionado e exclusivo',()=>{
  const items=[
    {id:'1',concurso:'TRT-4',materia:'Direito Administrativo',assunto:'Atos administrativos: conceito, requisitos e atributos',prioridade:2},
    {id:'2',concurso:'TRT-8',materia:'Direito Administrativo',assunto:'Atos administrativos: conceito, requisitos e atributos',prioridade:3},
    {id:'3',concurso:'TRT-4',materia:'Gestão de Pessoas',assunto:'Teorias da motivação: Vroom, Maslow e Herzberg'},
    {id:'4',concurso:'TRT-8',materia:'Gestão de Pessoas',assunto:'Teorias de motivação: Maslow, Herzberg e Vroom'},
    {id:'6',concurso:'TRT-15',materia:'Gestão de Pessoas',assunto:'Motivação: teorias de Maslow, Vroom e Herzberg'},
    {id:'5',concurso:'TRT-4',materia:'AFO',assunto:'Créditos adicionais'}
  ];
  const rows=buildCrossRows(items,['TRT-4','TRT-8','TRT-15']);
  assert.equal(rows.filter(r=>r.status==='common').length,1);
  assert.equal(rows.filter(r=>r.status==='related').length,1);
  assert.deepEqual(rows.find(r=>r.status==='related').sources.sort(),['TRT-15','TRT-4','TRT-8']);
  assert.equal(rows.filter(r=>r.status==='unique').length,1);
  assert.deepEqual(rows.find(r=>r.status==='common').sources.sort(),['TRT-4','TRT-8']);
});

test('similaridade textual é conservadora para assuntos desconexos',()=>{
  assert.ok(similarity('licitações e contratos administrativos','gestão estratégica de pessoas')<0.3);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const core=fs.readFileSync('public/js/app-core.js','utf8');
const ui=fs.readFileSync('public/js/edital-cross-ui.js','utf8');

test('runtime carrega o cruzador e sua interface',()=>{
  assert.match(core,/\.\/js\/edital-cross-tool\.js/);
  assert.match(core,/\.\/js\/edital-cross-ui\.js/);
  assert.match(ui,/Cruzar Editais \/ Plano Integrado/);
  assert.match(ui,/Criar plano e montar cronograma/);
});

test('plano integrado preserva origens e abre o construtor de cronograma',()=>{
  const start=core.indexOf('async function createIntegratedContestFromCrossEdital');
  const end=core.indexOf('async function confirmarNovoConcurso',start);
  assert.notEqual(start,-1);
  const fn=core.slice(start,end);
  assert.match(fn,/integratedPlan/);
  assert.match(fn,/sources:/);
  assert.match(fn,/origins/);
  assert.match(fn,/queueEditalUpsert\(item\)/);
  assert.match(fn,/AppNavigation\?\.navigateTo/);
  assert.match(fn,/openModalSelectCronogramaType\(\)/);
  assert.match(fn,/dateSchedule:\{\}/);
});

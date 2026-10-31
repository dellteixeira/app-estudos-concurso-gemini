const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const core=fs.readFileSync('public/js/app-core.js','utf8');
const css=fs.readFileSync('public/css/dashboard.css','utf8');

test('novo assunto do cronograma vira item canonico do edital',()=>{
  assert.match(core,/async function createCanonicalSubjectForMateria/);
  assert.match(core,/allEditalItems\.push\(newItem\)/);
  assert.match(core,/await saveEditalItemToCloud\(newItem\)/);
  assert.match(core,/concurso: currentConcurso/);
});

test('cadastro reaproveita assunto existente e evita duplicidade',()=>{
  assert.match(core,/function findCanonicalSubjectItem/);
  assert.match(core,/if \(existing\) return existing/);
  assert.match(core,/localeCompare\(normalizedAssunto, 'pt-BR', \{ sensitivity:'base' \}\)/);
});

test('novo assunto pode ser cadastrado diretamente pelo modal do cronograma',()=>{
  assert.match(core,/createAndAddCanonicalSubjectFromDay\(\)/);
  assert.match(core,/\+ Novo assunto/);
  assert.match(core,/\+ Cadastrar novo assunto/);
});

test('assunto canonico e vinculado ao dia selecionado',()=>{
  assert.match(core,/async function addCanonicalSubjectToSelectedDay/);
  assert.match(core,/contest\.dateSchedule\[activeSelectedDateKey\]\.push\(fullString\)/);
  assert.match(core,/await saveConcursosMetadata\(metadata\)/);
});

test('edicao manual antiga nao grava mais string solta',()=>{
  const start=core.indexOf('async function addManualTopicToDay');
  const end=core.indexOf('function updateEditAssuntoDropdown',start);
  const block=core.slice(start,end);
  assert.match(block,/promptCanonicalSubjectForMateria/);
  assert.match(block,/canonicalItem\.materia/);
  assert.match(block,/canonicalItem\.assunto/);
  assert.doesNotMatch(block,/prompt\(/);
});

test('interface explica o vinculo entre telas',()=>{
  assert.match(core,/Edital Verticalizado \+ cronograma \+ Pomodoro \+ demais seletores/);
  assert.match(css,/\.canonical-subject-link-hint/);
});

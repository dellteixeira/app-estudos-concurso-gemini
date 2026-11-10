const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const core=fs.readFileSync('public/js/app-core.js','utf8');
const css=fs.readFileSync('public/css/dashboard.css','utf8');

test('cronograma remove controles redundantes do card diario',()=>{
  const start=core.indexOf('function renderDayTopicsList()');
  const end=core.indexOf('let canonicalEditalIndexSource',start);
  const block=core.slice(start,end);
  assert.doesNotMatch(block,/study-status-checks/);
  assert.doesNotMatch(block,/study-launch-controls-primary/);
  assert.doesNotMatch(block,/Estudar Teoria/);
  assert.doesNotMatch(block,/Estudar Questões/);
});

test('Pomodoro livre oferece Lei Seca em materia juridica',()=>{
  assert.match(core,/isLegalStudyMateria\(matchedItem\.materia\) \? \[\['lei_seca','Lei Seca'\]\] : \[\]/);
  assert.match(core,/\['teoria','questoes','videoaula','lei_seca'\]\.includes/);
});

test('atividade e sessao numerica ficam no mesmo bloco integrado',()=>{
  assert.match(core,/scheduled-free-config/);
  assert.match(core,/scheduledFreeActivity_\$\{idx\}/);
  assert.match(core,/studyMinutes_\$\{idx\}/);
  assert.match(core,/saveScheduledSessionMinutesPreference\(\$\{idx\}, this\.value\)/);
});

test('preferencia de sessao e persistida por topico',()=>{
  assert.match(core,/topicSessionMinutes/);
  assert.match(core,/getStudyTopicKey\(item\.materia, item\.assunto\)/);
  assert.match(core,/await saveConcursosMetadata\(metadata\)/);
});

test('layout compacto coloca atividade e sessao lado a lado',()=>{
  assert.match(css,/\.scheduled-free-config\s*\{/);
  assert.match(css,/grid-template-columns:minmax\(150px,1fr\) 118px/);
  assert.match(css,/\.scheduled-free-session/);
  assert.match(css,/@media\(max-width:430px\)/);
});

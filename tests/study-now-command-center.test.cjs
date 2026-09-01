'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/core/study-now-command-center.js','utf8');

function loadModule(){
  const listeners=[];
  const window={addEventListener(type){listeners.push(type)},dispatchEvent(){}};
  const document={readyState:'loading',addEventListener(){}};
  vm.runInNewContext(source,{window,document,CustomEvent:function(){}});
  return {api:window.AppStudyNowCommandCenter,listeners};
}

test('view model preserva autoridade do Retention Engine e não agenda',()=>{
  const {api}=loadModule();
  const model=api.buildViewModel({
    topicId:'Direito Constitucional::Controle',
    materia:'Direito Constitucional',
    assunto:'Controle de constitucionalidade',
    priorityScore:87,
    editalPriority:1,
    topicPriority:4,
    method:'questions',
    methodLabel:'Questões',
    suggestedMinutes:35,
    reasons:['retenção 48%','2 lapsos'],
    alternatives:[]
  });
  assert.equal(model.authority,'retention-engine');
  assert.equal(model.autoSchedule,false);
  assert.equal(model.priorityScore,87);
  assert.equal(model.editalPriority,1);
  assert.equal(model.topicPriority,4);
  assert.equal(model.methodLabel,'Questões');
  assert.equal(model.suggestedMinutes,35);
});

test('evidência de banca mantém proveniência auditável',()=>{
  const {api}=loadModule();
  const model=api.buildViewModel({
    topicId:'x',materia:'Português',assunto:'Pontuação',priorityScore:80,method:'questions',methodLabel:'Questões',suggestedMinutes:25,
    boardEvidence:{board:'FCC',priority:72,confidence:84,questions:41,years:4,asOf:'2026-08-31',source:{title:'Histórico FCC Tribunais',type:'dataset',url:'https://example.test/fcc'}},
    alternatives:[]
  });
  assert.equal(model.boardEvidence.board,'FCC');
  assert.equal(model.boardEvidence.priority,72);
  assert.equal(model.boardEvidence.confidence,84);
  assert.equal(model.boardEvidence.source.title,'Histórico FCC Tribunais');
  assert.equal(model.boardEvidence.source.type,'dataset');
});

test('alternativas são limitadas a três e sanitizadas',()=>{
  const {api}=loadModule();
  const alternatives=Array.from({length:5},(_,i)=>({topicId:`t${i}`,materia:'Matéria',assunto:`Assunto ${i}`,score:70-i,methodLabel:'Revisão'}));
  const model=api.buildViewModel({topicId:'t',materia:'M',assunto:'A',priorityScore:90,method:'questions',methodLabel:'Questões',suggestedMinutes:30,alternatives});
  assert.equal(model.alternatives.length,3);
  assert.equal(model.alternatives[0].topicId,'t0');
});

test('superfície Prioridade cognitiva fica oculta e sem listeners quando desativada',()=>{
  const {api,listeners}=loadModule();
  assert.equal(api.uiEnabled,false);
  assert.equal(typeof api.buildViewModel,'function');
  assert.equal(typeof api.refresh,'function');
  assert.equal(typeof api.current,'function');
  assert.match(source,/const UI_ENABLED=false/);
  assert.doesNotMatch(source,/addEventListener\?\.\('app:cognitive-profile-updated'/);
  assert.deepEqual(listeners,[]);
});

test('painel preserva ações para futura reativação e integra Tutor Contextual',()=>{
  assert.match(source,/O que estudar agora\?/);
  assert.match(source,/Estudar agora/);
  assert.match(source,/Perguntar ao Tutor/);
  assert.match(source,/AppContextualAiTutor\.open/);
  assert.match(source,/app:study-now-requested/);
  assert.match(source,/data-action="retention-details"/);
});

test('painel não contém mutações diretas de cronograma',()=>{
  assert.doesNotMatch(source,/gerarCronogramaInteligente\s*\(/);
  assert.doesNotMatch(source,/gerarCronogramaMetodo2\s*\(/);
  assert.doesNotMatch(source,/scheduleReview\s*\(/);
  assert.doesNotMatch(source,/updateSchedule\s*\(/);
  assert.match(source,/authority:'retention-engine'/);
  assert.match(source,/autoSchedule:false/);
});

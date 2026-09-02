'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const ux=fs.readFileSync('public/js/ui/study-ux-phase.js','utf8');
const today=fs.readFileSync('public/js/ui/today-best-action.js','utf8');
const css=fs.readFileSync('public/css/study-ux-phase.css','utf8');
const nav=fs.readFileSync('public/js/ui/navigation.js','utf8');
const manifest=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));

test('fase UX cria Hoje como command center sem substituir o motor cognitivo',()=>{
  assert.match(ux,/tab-hoje/);
  assert.match(ux,/O que devo estudar agora\?/);
  assert.match(today,/AppStudyNowCommandCenter/);
  assert.match(today,/latestRecommendation/);
  assert.match(today,/Estudar agora —/);
  assert.doesNotMatch(today,/recommendationScore\s*=/);
});

test('Edital ganha resumo e cinco filtros sem reordenar a ordem importada',()=>{
  for(const label of ['Todos','Pendentes','Em risco','Revisar','Dominados'])assert.match(ux,new RegExp(label));
  assert.match(ux,/edital-summary-grid/);
  assert.doesNotMatch(ux,/editalPriority\s*=/);
  assert.doesNotMatch(ux,/topicPriority\s*=/);
  assert.doesNotMatch(ux,/\.sort\s*\(/);
});

test('Cronograma oferece Hoje Semana Mês, mobile prioriza Hoje e usa data exata',()=>{
  assert.match(ux,/data-calendar-view="today"/);
  assert.match(ux,/data-calendar-view="week"/);
  assert.match(ux,/data-calendar-view="month"/);
  assert.match(ux,/max-width:700px/);
  assert.match(ux,/setCalendarView\([^\n]*'today'/);
  assert.match(ux,/data-date-key/);
  assert.match(ux,/cellForDate\(date\)/);
  for(const label of ['Concluir','Adiar','Trocar'])assert.match(ux,new RegExp(label));
});

test('Retenção compacta mantém quatro métricas e limita pontos críticos a três na superfície',()=>{
  assert.match(ux,/index>=3/);
  assert.match(ux,/Ver todos os pontos críticos/);
  assert.match(css,/rd-metrics-v1077/);
  assert.match(css,/study-ux-critical-extra/);
});

test('Hoje não usa risco como quantidade fictícia de questões recomendadas',()=>{
  assert.match(ux,/method==='questions'\?1:'—'/);
  assert.doesNotMatch(ux,/risk\?risk/);
});

test('runtime e cache offline carregam a nova fase web',()=>{
  assert.match(nav,/\.\/js\/ui\/study-ux-phase\.js/);
  assert.match(nav,/\.\/js\/ui\/today-best-action\.js/);
  assert.doesNotMatch(nav,/android\//i);
  for(const asset of ['/css/study-ux-phase.css','/css/today-best-action.css','/js/ui/study-ux-phase.js','/js/ui/today-best-action.js']){
    assert.ok(manifest.optionalOfflineAssets.includes(asset),`asset offline ausente: ${asset}`);
  }
});

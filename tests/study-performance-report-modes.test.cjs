'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const loader=fs.readFileSync(path.join(root,'public/js/study-performance-report.js'),'utf8');
const core=fs.readFileSync(path.join(root,'public/js/study-performance-report-core.js'),'utf8');
const v2=fs.readFileSync(path.join(root,'public/js/study-performance-report-v2.js'),'utf8');

test('loader preserva o relatório base e carrega a camada avançada',()=>{
  assert.match(loader,/study-performance-report-core\.js/);
  assert.match(loader,/study-performance-report-v2\.js/);
  assert.match(core,/global\.StudyPerformanceReport/);
  assert.match(v2,/global\.StudyPerformanceReportV2/);
});

test('seletor oferece relatório completo, matéria e comparativo',()=>{
  assert.match(v2,/value="complete"/);
  assert.match(v2,/value="subject"/);
  assert.match(v2,/value="comparison"/);
  assert.match(v2,/Somente matéria selecionada/);
  assert.match(v2,/Comparativo de evolução/);
});

test('relatório por matéria filtra diagnóstico e reutiliza o gerador oficial',()=>{
  assert.match(v2,/buildSubjectReportData/);
  assert.match(v2,/r\?\.state\?\.materia===materia/);
  assert.match(v2,/StudyPerformanceReport\.buildPdf/);
  assert.match(v2,/StudyPerformanceReport\.collectReportData/);
});

test('comparativo usa janelas reais de 7, 30, 60 e 90 dias',()=>{
  assert.match(v2,/const PERIODS=\[7,30,60,90\]/);
  assert.match(v2,/sessionTime/);
  assert.match(v2,/studySessions/);
  assert.match(v2,/prevStart/);
  assert.match(v2,/período imediatamente anterior/);
});

test('comparativo mede tempo, questões, revisões, acurácia e cobertura',()=>{
  assert.match(v2,/minutes/);
  assert.match(v2,/questionTotal/);
  assert.match(v2,/isRevision/);
  assert.match(v2,/accuracy/);
  assert.match(v2,/coverage/);
  assert.match(v2,/Matérias mais estudadas no período/);
});

test('comparativo não inventa progresso histórico',()=>{
  assert.match(v2,/não um progresso histórico reconstruído/);
  assert.match(v2,/não guarda snapshots históricos/);
  assert.match(v2,/Cobertura/);
});

test('modal e ações são responsivos para mobile',()=>{
  assert.match(v2,/@media\(max-width:600px\)/);
  assert.match(v2,/@media\(max-width:390px\)/);
  assert.match(v2,/grid-template-columns:1fr 1fr/);
  assert.match(v2,/Gerar PDF/);
});

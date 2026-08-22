'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const report=fs.readFileSync(path.join(root,'public/js/study-performance-report.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'public/pwa-update.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');

test('relatório reutiliza métricas do app e estado de aquisição',()=>{
  assert.match(report,/buildRetentionDiagnostics/);
  assert.match(report,/getContentAcquisitionState/);
  assert.match(report,/studySessions/);
  assert.match(report,/questionTotal/);
  assert.match(report,/questionCorrect/);
  assert.match(report,/isRevision/);
});

test('relatório contém gráfico por matéria com cores da paleta do app',()=>{
  assert.match(report,/PALETA_SOLIDAS/);
  assert.match(report,/Progresso por matéria/);
  assert.match(report,/rect\(p,x,base,bw,bh,m\.color\)/);
  assert.match(report,/fmtPct\(m\.progress\)/);
});

test('relatório inclui diagnóstico completo e detalhamento por matéria',()=>{
  assert.match(report,/Horas totais/);
  assert.match(report,/Questões/);
  assert.match(report,/Acertos/);
  assert.match(report,/Revisões/);
  assert.match(report,/Retenção média/);
  assert.match(report,/Assuntos em risco/);
  assert.match(report,/Revisões vencidas/);
  assert.match(report,/Assuntos dominados/);
  assert.match(report,/Assuntos mais estudados/);
  assert.match(report,/Pontos críticos da matéria/);
});

test('botão Exportar dados é inserido ao lado de Estudar agora e é responsivo',()=>{
  assert.match(report,/retention-study-now-v1072/);
  assert.match(report,/retentionExportReportButton/);
  assert.match(report,/Exportar dados/);
  assert.match(report,/@media\(max-width:700px\)/);
  assert.match(report,/grid-template-columns:1fr 1fr/);
  assert.match(report,/@media\(max-width:430px\)/);
});

test('relatório é carregado pelo app e armazenado no PWA',()=>{
  assert.match(loader,/loadStudyPerformanceReport/);
  assert.match(loader,/\.\/js\/study-performance-report\.js/);
  assert.match(sw,/\.\/js\/study-performance-report\.js/);
});

test('exportação gera PDF diretamente no navegador',()=>{
  assert.match(report,/application\/pdf/);
  assert.match(report,/URL\.createObjectURL/);
  assert.match(report,/relatorio_desempenho/);
  assert.match(report,/Caderno de Anotações/,{message:'placeholder'});
});

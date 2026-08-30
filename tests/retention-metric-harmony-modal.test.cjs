const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const retentionCss = fs.readFileSync(path.join(root, 'public/css/components/retention.css'), 'utf8');
const polish = fs.readFileSync(path.join(root, 'public/css/responsive-polish-v10.64.19.css'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'public/js/app-ui.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

test('retention responsive contract has one component owner', () => {
  assert.match(polish, /@import\s+url\(['"]\.\/components\/retention\.css['"]\)/);
  assert.doesNotMatch(polish.replace(/@import[^;]+;/g, ''), /#retentionDiagnosticPanel|\.rd-metric(?:s|-)|#modalRetentionMetricDetails/);
});

test('retention metric labels are centered, smaller and protected against overflow', () => {
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*justify-self:\s*center\s*!important/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*text-align:\s*center\s*!important/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*max-inline-size:\s*13ch\s*!important/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*font-size:\s*clamp\(\.76rem,/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*text-wrap:\s*balance\s*!important/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*white-space:\s*normal\s*!important/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*word-break:\s*normal\s*!important/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-risk-v1077 \.rd-metric-label-v1077[\s\S]*max-inline-size:\s*11\.5ch\s*!important/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-card-v1077[\s\S]*overflow:\s*hidden\s*!important/);
});

test('mobile retention grid reserves real space between both rows', () => {
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metrics-v1077[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metrics-v1077[\s\S]*grid-auto-rows:\s*minmax\(166px,\s*auto\)\s*!important/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metrics-v1077[\s\S]*row-gap:\s*14px\s*!important/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-card-v1077,[\s\S]*height:\s*auto\s*!important[\s\S]*max-height:\s*none\s*!important/);
});

test('all diagnostic action metrics still use the same details modal contract', () => {
  assert.match(html, /data-metric="risk"/);
  assert.match(html, /data-metric="overdue"/);
  assert.match(html, /data-metric="mastered"/);
  assert.match(ui, /function getRetentionMetricConfig\(kind\)[\s\S]*risk:\s*\{\s*title:'Assuntos em risco'/);
  assert.match(ui, /overdue:\s*\{\s*title:'Revisões vencidas'/);
  assert.match(ui, /mastered:\s*\{\s*title:'Assuntos dominados'/);
  assert.match(ui, /function openRetentionMetricDetails\(kind\)[\s\S]*modalRetentionMetricDetails[\s\S]*buildRetentionDiagnostics\(\)/);
});

test('retention detail modal uses card layout and wraps long topic text safely', () => {
  assert.match(retentionCss, /#modalRetentionMetricDetails \.retention-metric-modal-content[\s\S]*width:\s*min\(1040px, calc\(100vw - 28px\)\)\s*!important/);
  assert.match(retentionCss, /#modalRetentionMetricDetails \.modal-header > div:first-child::before[\s\S]*RETENÇÃO E DIAGNÓSTICO/);
  assert.match(retentionCss, /#modalRetentionMetricDetails \.retention-metric-detail-row[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto\s*!important/);
  assert.match(retentionCss, /#modalRetentionMetricDetails \.retention-detail-copy strong[\s\S]*white-space:\s*normal\s*!important[\s\S]*overflow-wrap:\s*break-word\s*!important/);
  assert.match(retentionCss, /@media \(max-width:\s*700px\)[\s\S]*#modalRetentionMetricDetails \.retention-metric-detail-row[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)\s*!important/);
});

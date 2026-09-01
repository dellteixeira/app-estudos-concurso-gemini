const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const critical = fs.readFileSync(path.join(root, 'public/js/critical-points-actions.js'), 'utf8');
const advisor = fs.readFileSync(path.join(root, 'public/js/learning-advisor.js'), 'utf8');

test('overdue and mastered retention metrics are intercepted into the modern Learning Advisor dialog', () => {
  assert.match(critical, /function onMetricClick\(event\)/);
  assert.match(critical, /kind!==['"]overdue['"]&&kind!==['"]mastered['"]/);
  assert.match(critical, /event\.stopImmediatePropagation\(\)/);
  assert.match(critical, /function openModernRetentionMetric\(kind\)/);
  assert.match(critical, /AppLearningAdvisor\.openRiskView\(\)/);
  assert.match(critical, /learningAdvisorOverlay/);
});

test('modernized overdue and mastered rows reuse the exact risk-card visual language', () => {
  assert.match(critical, /class=\\?"learning-risk-list\\?"/);
  assert.match(critical, /class=\\?"learning-risk-card\\?"/);
  assert.match(critical, /learning-advisor-subject/);
  assert.match(critical, /learning-risk-metrics/);
  assert.match(critical, /Retenção <strong>\$\{retention\}%<\/strong>/);
  assert.match(critical, /Questões <strong>\$\{accuracy\}%<\/strong>/);
  assert.match(critical, /title:'Revisões vencidas'/);
  assert.match(critical, /title:'Assuntos dominados'/);
});

test('shared Learning Advisor dialog keeps X, backdrop and Escape close behavior', () => {
  assert.match(advisor, /id=\\?"learningAdvisorClose\\?"/);
  assert.match(advisor, /event\.target===overlay\)closeDialog\(\)/);
  assert.match(advisor, /event\.key===['"]Escape['"][\s\S]*closeDialog\(\)/);
});

test('legacy retention metric modal is explicitly closed before the modern dialog opens', () => {
  assert.match(critical, /function closeLegacyMetricModal\(\)/);
  assert.match(critical, /legacy\.classList\.remove\(['"]is-open['"]\)/);
  assert.match(critical, /legacy\.hidden=true/);
  assert.match(critical, /closeLegacyMetricModal\(\);[\s\S]*AppLearningAdvisor\.openRiskView\(\)/);
});

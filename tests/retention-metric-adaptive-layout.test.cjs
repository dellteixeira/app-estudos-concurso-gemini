const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const retentionCss = fs.readFileSync(path.join(root, 'public/css/components/retention.css'), 'utf8');
const canonicalCss = fs.readFileSync(path.join(root, 'public/css/canonical-ui.css'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'public/js/ui/navigation.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

test('cards de diagnóstico preservam estrutura responsiva sem ícones decorativos', () => {
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-card-v1077/);
  assert.match(retentionCss, /grid-template-rows:\s*minmax\(38px, auto\) minmax\(54px, 1fr\) 5px\s*!important/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-icon-v1077[\s\S]*display:\s*none\s*!important/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*grid-row:\s*1\s*!important[\s\S]*text-align:\s*center\s*!important/);
  assert.match(retentionCss, /white-space:\s*normal\s*!important/);
  assert.match(retentionCss, /overflow:\s*visible\s*!important/);
});

test('grade de retenção adapta para duas colunas no mobile sem altura máxima rígida', () => {
  assert.match(retentionCss, /@media \(max-width:\s*700px\)[\s\S]*#retentionDiagnosticPanel \.rd-metrics-v1077[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(retentionCss, /grid-auto-rows:\s*minmax\(166px, auto\)\s*!important/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-card-v1077,[\s\S]*max-height:\s*none\s*!important/);
  assert.doesNotMatch(retentionCss, /@container retentionMetrics/);
});

test('retention.css é a única camada canônica do componente', () => {
  assert.doesNotMatch(canonicalCss, /#retentionDiagnosticPanel|\.rd-metric(?:s|-)|#modalRetentionMetricDetails/);
});

test('camada canônica geral continua carregada e offline sem hotfixes legados', () => {
  assert.match(navigation, /canonical-ui\.css\?v=20260823-phase5/);
  assert.match(navigation, /data-canonical-ui|canonicalUi/);
  assert.doesNotMatch(navigation, /retention-metrics-fix|ui-text-safety|accessibility-baseline/);
  assert.match(sw, /\.\/css\/canonical-ui\.css/);
  assert.match(sw, /\/css\/canonical-ui\.css/);
});

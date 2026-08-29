const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/css/canonical-ui.css'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'public/js/ui/navigation.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

test('cards de diagnóstico preservam estrutura compacta sem ícones decorativos', () => {
  assert.match(css, /#retentionDiagnosticPanel \.rd-metric-card-v1077/);
  assert.match(css, /grid-template-rows:\s*minmax\(24px, auto\) 1fr 6px\s*!important/);
  assert.match(css, /#retentionDiagnosticPanel \.rd-metric-icon-v1077[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*grid-row:\s*1\s*!important[\s\S]*text-align:\s*center\s*!important/);
  assert.match(css, /font-size:\s*clamp\(13px/);
  assert.match(css, /white-space:\s*normal\s*!important/);
  assert.match(css, /overflow:\s*visible\s*!important/);
});

test('grade final mantém quatro métricas no desktop e adapta somente em mobile real', () => {
  assert.match(css, /#retentionDiagnosticPanel \.rd-metrics-v1077[\s\S]*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width:\s*600px\)[\s\S]*#retentionDiagnosticPanel \.rd-metrics-v1077[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width:\s*340px\)[\s\S]*#retentionDiagnosticPanel \.rd-metrics-v1077[\s\S]*grid-template-columns:\s*1fr\s*!important/);
  assert.doesNotMatch(css, /@container retentionMetrics/);
});

test('camada canônica é carregada e funciona offline sem hotfixes legados', () => {
  assert.match(navigation, /canonical-ui\.css\?v=20260823-phase5/);
  assert.match(navigation, /data-canonical-ui|canonicalUi/);
  assert.doesNotMatch(navigation, /retention-metrics-fix|ui-text-safety|accessibility-baseline/);
  assert.match(sw, /\.\/css\/canonical-ui\.css/);
  assert.match(sw, /\/css\/canonical-ui\.css/);
});

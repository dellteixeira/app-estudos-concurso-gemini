const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('header controls stay on one row with complete labels', () => {
  const css = read('public/css/ui-text-safety.css');
  assert.match(css, /\.concurso-selector-bar[\s\S]*display:\s*flex\s*!important/);
  assert.match(css, /\.concurso-selector-bar[\s\S]*flex-wrap:\s*nowrap\s*!important/);
  assert.match(css, /\.concurso-selector-bar[\s\S]*overflow-x:\s*auto\s*!important/);
  assert.match(css, /\.header-account-actions[\s\S]*display:\s*flex\s*!important/);
  assert.match(css, /\.header-account-actions[\s\S]*flex-wrap:\s*nowrap\s*!important/);
  assert.match(css, /\.header-account-actions \.btn[\s\S]*white-space:\s*nowrap\s*!important/);
  assert.match(css, /\.header-account-actions \.btn[\s\S]*font-size:\s*clamp\(/);
  assert.doesNotMatch(css, /\.header-account-actions \.btn[\s\S]{0,450}text-overflow:\s*ellipsis/);
});

test('retention metrics are compact and remain four-across outside real mobile', () => {
  const css = read('public/css/ui-text-safety.css');
  assert.match(css, /#retentionDiagnosticPanel \.rd-metrics-v1077[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /#retentionDiagnosticPanel \.rd-metrics-v1077[\s\S]*grid-auto-rows:\s*142px\s*!important/);
  assert.match(css, /#retentionDiagnosticPanel \.rd-metric-card-v1077[\s\S]*height:\s*142px\s*!important/);
  assert.match(css, /#retentionDiagnosticPanel \.rd-metric-icon-v1077[\s\S]*width:\s*36px\s*!important/);
  assert.match(css, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*font-size:\s*clamp\(\.54rem/);
  assert.match(css, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*white-space:\s*normal\s*!important/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*#retentionDiagnosticPanel \.rd-metrics-v1077[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 340px\)[\s\S]*#retentionDiagnosticPanel \.rd-metrics-v1077[\s\S]*grid-template-columns:\s*1fr\s*!important/);
  assert.doesNotMatch(css, /@container retentionMetrics/);
});

test('text-safety styles are cache-busted and available offline', () => {
  const nav = read('public/js/ui/navigation.js');
  const sw = read('public/sw.js');
  assert.match(nav, /retention-metrics-fix\.css\?v=20260823-final3/);
  assert.match(nav, /ui-text-safety\.css\?v=20260823-final3/);
  assert.match(nav, /data-ui-text-safety|dataset\.uiTextSafety/);
  assert.match(sw, /\.\/css\/ui-text-safety\.css/);
  assert.match(sw, /\/css\/ui-text-safety\.css/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('header controls stay on one row with complete labels', () => {
  const css = read('public/css/canonical-ui.css');
  assert.match(css, /\.concurso-selector-bar[\s\S]*display:\s*flex\s*!important/);
  assert.match(css, /\.concurso-selector-bar[\s\S]*flex-wrap:\s*nowrap\s*!important/);
  assert.match(css, /\.concurso-selector-bar[\s\S]*overflow-x:\s*auto\s*!important/);
  assert.match(css, /\.header-account-actions[\s\S]*display:\s*flex\s*!important/);
  assert.match(css, /\.header-account-actions[\s\S]*flex-wrap:\s*nowrap\s*!important/);
  assert.match(css, /\.header-account-actions \.btn[\s\S]*white-space:\s*nowrap\s*!important/);
  assert.match(css, /\.header-account-actions \.btn[\s\S]*font-size:\s*clamp\(/);
  assert.doesNotMatch(css, /\.header-account-actions \.btn[\s\S]{0,450}text-overflow:\s*ellipsis/);
});

test('retention metrics are compact, iconless and remain four-across outside real mobile', () => {
  const css = read('public/css/canonical-ui.css');
  assert.match(css, /#retentionDiagnosticPanel \.rd-metrics-v1077[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /#retentionDiagnosticPanel \.rd-metrics-v1077[\s\S]*grid-auto-rows:\s*142px\s*!important/);
  assert.match(css, /#retentionDiagnosticPanel \.rd-metric-card-v1077[\s\S]*height:\s*142px\s*!important/);
  assert.match(css, /#retentionDiagnosticPanel \.rd-metric-icon-v1077[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*font-size:\s*clamp\(\.82rem,/);
  assert.match(css, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*font-weight:\s*740\s*!important/);
  assert.match(css, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*white-space:\s*normal\s*!important/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*font-size:\s*\.82rem\s*!important/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*#retentionDiagnosticPanel \.rd-metrics-v1077[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 340px\)[\s\S]*#retentionDiagnosticPanel \.rd-metrics-v1077[\s\S]*grid-template-columns:\s*1fr\s*!important/);
  assert.doesNotMatch(css, /@container retentionMetrics/);
});

test('canonical UI styles are cache-busted and available offline', () => {
  const nav = read('public/js/ui/navigation.js');
  const sw = read('public/sw.js');
  assert.match(nav, /canonical-ui\.css\?v=20260823-phase5/);
  assert.match(nav, /data-canonical-ui|dataset\.canonicalUi/);
  assert.doesNotMatch(nav, /retention-metrics-fix|ui-text-safety|accessibility-baseline/);
  assert.match(sw, /\.\/css\/canonical-ui\.css/);
  assert.match(sw, /\/css\/canonical-ui\.css/);
});

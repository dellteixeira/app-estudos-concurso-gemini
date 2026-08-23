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

test('retention metrics stack icon and label vertically using container width', () => {
  const css = read('public/css/ui-text-safety.css');
  assert.match(css, /\.rd-center-v1077[\s\S]*container-type:\s*inline-size/);
  assert.match(css, /\.rd-center-v1077[\s\S]*container-name:\s*retentionMetrics/);
  assert.match(css, /\.rd-metric-card-v1077[\s\S]*flex-direction:\s*column\s*!important/);
  assert.match(css, /\.rd-metric-icon-v1077[\s\S]*position:\s*static\s*!important/);
  assert.match(css, /\.rd-metric-label-v1077[\s\S]*position:\s*static\s*!important/);
  assert.match(css, /\.rd-metric-label-v1077[\s\S]*white-space:\s*normal\s*!important/);
  assert.match(css, /@container retentionMetrics \(max-width: 760px\)[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@container retentionMetrics \(max-width: 380px\)[\s\S]*grid-template-columns:\s*1fr\s*!important/);
});

test('text-safety styles are cache-busted and available offline', () => {
  const nav = read('public/js/ui/navigation.js');
  const sw = read('public/sw.js');
  assert.match(nav, /retention-metrics-fix\.css\?v=20260823-final/);
  assert.match(nav, /ui-text-safety\.css\?v=20260823-final/);
  assert.match(nav, /data-ui-text-safety|dataset\.uiTextSafety/);
  assert.match(sw, /\.\/css\/ui-text-safety\.css/);
  assert.match(sw, /\/css\/ui-text-safety\.css/);
});

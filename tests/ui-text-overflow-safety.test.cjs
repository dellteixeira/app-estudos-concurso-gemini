const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('header controls preserve complete labels without clipping', () => {
  const css = read('public/css/ui-text-safety.css');
  assert.match(css, /\.header-account-actions[\s\S]*minmax\(112px, 1fr\)/);
  assert.match(css, /\.header-account-actions \.btn[\s\S]*white-space:\s*normal\s*!important/);
  assert.match(css, /\.btn-theme-header[\s\S]*min-width:\s*138px\s*!important/);
  assert.doesNotMatch(css, /\.header-account-actions \.btn[\s\S]{0,400}text-overflow:\s*ellipsis/);
});

test('retention metrics stack icon over full adaptive label', () => {
  const css = read('public/css/ui-text-safety.css');
  assert.match(css, /\.rd-metrics-v1077[\s\S]*repeat\(auto-fit, minmax\(150px, 1fr\)\)/);
  assert.match(css, /\.rd-metric-card-v1077[\s\S]*grid-template-rows:\s*auto auto 1fr auto/);
  assert.match(css, /\.rd-metric-label-v1077[\s\S]*white-space:\s*normal\s*!important/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.rd-metrics-v1077[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*\.rd-metrics-v1077[\s\S]*grid-template-columns:\s*1fr\s*!important/);
});

test('text-safety stylesheet is loaded late and cached offline', () => {
  const nav = read('public/js/ui/navigation.js');
  const sw = read('public/sw.js');
  assert.match(nav, /ui-text-safety\.css/);
  assert.match(nav, /data-ui-text-safety|dataset\.uiTextSafety/);
  assert.match(sw, /\.\/css\/ui-text-safety\.css/);
  assert.match(sw, /\/css\/ui-text-safety\.css/);
});

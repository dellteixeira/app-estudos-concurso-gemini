const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/css/retention-metrics-fix.css'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'public/js/ui/navigation.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

test('cards de diagnóstico usam ícone acima e rótulo adaptativo abaixo', () => {
  assert.match(css, /\.rd-metrics-v1077 \.rd-metric-card-v1077/);
  assert.match(css, /flex-direction:\s*column\s*!important/);
  assert.match(css, /\.rd-metrics-v1077 \.rd-metric-icon-v1077[\s\S]*align-self:\s*center\s*!important/);
  assert.match(css, /\.rd-metrics-v1077 \.rd-metric-label-v1077[\s\S]*text-align:\s*center\s*!important/);
  assert.match(css, /white-space:\s*normal\s*!important/);
  assert.match(css, /overflow:\s*visible\s*!important/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});

test('grade de métricas se adapta à largura sem esconder palavras', () => {
  assert.match(css, /repeat\(auto-fit,\s*minmax\(min\(100%,\s*150px\),\s*1fr\)\)/);
  assert.match(css, /@media \(max-width:\s*600px\)[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width:\s*340px\)[\s\S]*grid-template-columns:\s*1fr\s*!important/);
});

test('correção visual é carregada e funciona offline', () => {
  assert.match(navigation, /retention-metrics-fix\.css/);
  assert.match(navigation, /data-retention-metrics-fix|retentionMetricsFix/);
  assert.match(sw, /\.\/css\/retention-metrics-fix\.css/);
  assert.match(sw, /\/css\/retention-metrics-fix\.css/);
});

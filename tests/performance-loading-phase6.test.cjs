const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const performancePath = path.join(root, 'public/js/performance-loader.js');
const navigationPath = path.join(root, 'public/js/ui/navigation.js');

function source(file) {
  return fs.readFileSync(file, 'utf8');
}

test('phase 6 performance loader has valid syntax and adaptive contracts', () => {
  const code = source(performancePath);
  assert.doesNotThrow(() => new vm.Script(code));
  assert.match(code, /requestIdleCallback/);
  assert.match(code, /navigator\.connection/);
  assert.match(code, /saveData/);
  assert.match(code, /effectiveType/);
  assert.match(code, /contentVisibility/);
  assert.match(code, /containIntrinsicSize/);
  assert.match(code, /pointerenter/);
  assert.match(code, /touchstart/);
});

test('performance enhancement stays isolated from data/auth services', () => {
  const code = source(performancePath);
  assert.doesNotMatch(code, /supabase/i);
  assert.doesNotMatch(code, /service_role/i);
  assert.doesNotMatch(code, /auth\./i);
});

test('navigation loads performance layer as a non-critical enhancement', () => {
  const code = source(navigationPath);
  assert.match(code, /performance-loader\.js/);
  assert.match(code, /data-performance-loader|dataset\.performanceLoader/);
  assert.match(code, /Não foi possível carregar o otimizador de performance/);
});

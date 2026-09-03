const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('public/css/shell-modernization.css', 'utf8');
const nav = fs.readFileSync('public/js/ui/navigation.js', 'utf8');

test('shell 1.1 keeps runtime light and does not touch calendar selectors', () => {
  assert.doesNotMatch(css, /MutationObserver|setInterval\s*\(/);
  assert.doesNotMatch(nav, /new\s+MutationObserver|setInterval\s*\(/);
  assert.doesNotMatch(css, /#tab-calendario|\.calendar/);
});

test('shell 1.1 exposes one primary contest action and moves management actions to menu', () => {
  assert.match(nav, /function organizeShellChrome\(\)/);
  assert.match(nav, /btnRenomearConcurso/);
  assert.match(nav, /btnExcluirConcurso/);
  assert.match(nav, /shell-management-action/);
  assert.match(css, /overview-secondary-metric/);
});

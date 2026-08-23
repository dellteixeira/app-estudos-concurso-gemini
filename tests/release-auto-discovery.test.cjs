const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const audit = fs.readFileSync(path.join(root, 'scripts/audit-release.mjs'), 'utf8');

test('Fase 7 descobre módulos, CSS e testes sem listas manuais de release', () => {
  assert.match(audit, /function discoverFiles\(/);
  assert.match(audit, /discoverFiles\('public\/js'/);
  assert.match(audit, /discoverFiles\('public\/css'/);
  assert.match(audit, /discoverFiles\('tests'/);
  assert.match(audit, /config\/app-assets\.json/);
  assert.doesNotMatch(audit, /const JS_FILES = \[/);
  assert.doesNotMatch(audit, /const CSS_FILES = \[/);
  assert.doesNotMatch(audit, /const CORE_ROUTES = \[/);
  assert.doesNotMatch(audit, /const expectedTests = \[/);
});

test('todos os JS descobertos entram no syntax gate', () => {
  assert.match(audit, /for \(const rel of \[\.\.\.ALL_APP_JS_FILES, 'public\/pwa-update\.js','public\/sw\.js','src\/index\.js'\]\)/);
  assert.match(audit, /execFileSync\(process\.execPath, \['--check'/);
});

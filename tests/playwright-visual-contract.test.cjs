const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/quality-check.yml', 'utf8');
const config = fs.readFileSync('playwright.config.cjs', 'utf8');
const spec = fs.readFileSync('tests/browser/responsive-layout.spec.cjs', 'utf8');

test('Fase 3 integra Playwright ao status obrigatório test-and-audit', () => {
  assert.equal(pkg.scripts['test:browser'], 'playwright test -c playwright.config.cjs');
  assert.match(workflow, /Browser responsive audit/);
  assert.match(workflow, /npm run test:browser/);
  assert.match(workflow, /@playwright\/test@1\.55\.0/);
  assert.match(workflow, /chromium firefox webkit/);
  assert.match(workflow, /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/);
  assert.match(workflow, /retention-days: 14/);
});

test('Playwright cobre três engines e servidor local do app real', () => {
  assert.match(config, /Desktop Chrome/);
  assert.match(config, /Desktop Firefox/);
  assert.match(config, /Desktop Safari/);
  assert.match(config, /python3 -m http\.server 4173 --directory public/);
  assert.match(config, /baseURL: 'http:\/\/127\.0\.0\.1:4173'/);
});

test('auditoria responsiva cobre bandas canônicas e falhas visuais críticas', () => {
  for (const marker of ['mobile-360', 'mobile-390', 'tablet-768', 'notebook-1366', 'desktop-1920']) {
    assert.match(spec, new RegExp(marker));
  }
  assert.match(spec, /documentElement overflow/);
  assert.match(spec, /Controles com texto cortado\/escapando/);
  assert.match(spec, /Rótulo fora do card/);
  assert.match(spec, /Ícone decorativo ainda visível/);
  assert.match(spec, /Título sem destaque suficiente/);
  assert.match(spec, /Título sem peso visual suficiente/);
  assert.match(spec, /page\.screenshot/);
});

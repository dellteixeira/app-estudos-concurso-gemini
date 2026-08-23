const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const specPath = 'tests/browser/accessibility-usability.spec.cjs';
const workflowPath = '.github/workflows/quality-check.yml';

test('Fase 4 mantém auditoria de acessibilidade e usabilidade no navegador', () => {
  assert.equal(fs.existsSync(specPath), true, 'spec Playwright da Fase 4 ausente');
  const spec = fs.readFileSync(specPath, 'utf8');
  assert.match(spec, /sem-nome-acessivel/);
  assert.match(spec, /Alvos interativos menores/);
  assert.match(spec, /Falhas de foco visível\/alcançável/);
  assert.match(spec, /:focus/);
  assert.match(spec, /mobile-360/);
  assert.match(spec, /tablet-768/);
  assert.match(spec, /desktop-1366/);
});

test('Quality Check continua executando a suíte Playwright que inclui a Fase 4', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /npm run test:browser/);
  assert.match(workflow, /chromium firefox webkit/);
  assert.match(workflow, /Upload Playwright report and screenshots/);
});

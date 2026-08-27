const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = path => fs.readFileSync(path, 'utf8');

test('Edital usa um único botão alternável para expandir e recolher guias', () => {
  const html = read('public/index.html');
  const ui = read('public/js/app-ui.js');
  const core = read('public/js/app-core.js');
  assert.equal((html.match(/id="toggleAllGuidesBtn"/g) || []).length, 1);
  assert.match(html, /data-inline-click="ih-009"[^>]*>Expandir Todas as Guias<\/button>/);
  assert.doesNotMatch(html, /data-inline-click="ih-010"/);
  assert.match(ui, /'ih-009': function\(event\) \{ toggleAllGuides\(\) \}/);
  assert.doesNotMatch(ui, /'ih-010':/);
  assert.match(core, /function toggleAllGuides\(\)/);
  assert.match(core, /toggleAllAccordions\(!allOpen\)/);
  assert.match(core, /button\.textContent = allOpen \? 'Recolher Todas as Guias' : 'Expandir Todas as Guias'/);
  assert.match(core, /button\.setAttribute\('aria-expanded', allOpen \? 'true' : 'false'\)/);
});

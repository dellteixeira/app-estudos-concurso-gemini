const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'public/js/pdf/pdf-offline-library-ui.js'), 'utf8');
const manager = fs.readFileSync(path.join(root, 'public/js/pdf/pdf-offline-library-manager.js'), 'utf8');

test('Biblioteca Offline encerra bootstrap quando o manager não chega', () => {
  assert.match(ui, /const BOOT_MAX_ATTEMPTS=50;/);
  assert.match(ui, /bootAttempts>=BOOT_MAX_ATTEMPTS/);
  assert.match(ui, /clearBootTimer\(\)/);
  assert.doesNotMatch(ui, /else setTimeout\(boot,100\)/);
  assert.match(ui, /Biblioteca Offline indisponível: o gerenciador não foi carregado/);
});

test('inicialização usa sinal de prontidão e não engole falhas críticas', () => {
  assert.match(manager, /pdf-offline-library-manager-ready/);
  assert.match(ui, /pdf-offline-library-manager-ready/);
  assert.match(ui, /function reportError\(/);
  assert.doesNotMatch(ui, /getStatus\(\)\.catch\(\(\)=>null\)/);
  assert.doesNotMatch(ui, /mount\(\)\.catch\(\(\)=>\{\}\)/);
  assert.doesNotMatch(manager, /syncCurrentPolicy\(\)\.catch\(\(\)=>\{\}\)/);
  assert.match(manager, /emit\('resume-error'/);
  assert.match(manager, /emit\('warning'/);
});

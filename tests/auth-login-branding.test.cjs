const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'study-domain.js'), 'utf8');

test('tela de autenticação injeta logo centralizada e responsiva', () => {
  assert.match(source, /authBrandLogo/);
  assert.match(source, /src\s*=\s*['"]\.\/icon-192\.png['"]/);
  assert.match(source, /justify-content:center/);
  assert.match(source, /width:82px/);
  assert.match(source, /@media \(max-width:700px\)/);
  assert.match(source, /width:68px/);
});

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'base.css'), 'utf8');

test('tela de autenticação exibe logo centralizada e responsiva', () => {
  assert.match(html, /id="authBrandLogo"/);
  assert.match(html, /src="\.\/icon-192\.png"/);
  assert.match(css, /\.auth-brand-logo\s*\{[^}]*justify-content:center/);
  assert.match(css, /\.auth-brand-logo img\s*\{[^}]*width:82px;[^}]*height:82px/);
  assert.match(css, /@media \(max-width:700px\)[\s\S]*\.auth-brand-logo img\s*\{[^}]*width:68px;[^}]*height:68px/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

// Contrato temporário de segurança enquanto o lazy-load do PR #259 permanece desativado.
const requiredPdfScripts = [
  './js/pdf/pdf-core.js',
  './js/pdf/pdf-workspaces.js',
  './js/pdf/pdf-links.js',
  './js/pdf/pdf-library.js',
  './js/pdf/pdf-upload.js',
  './js/pdf/pdf-annotations.js',
  './vendor/pdf.min.js',
  './js/pdf/pdf-reader.js',
  './js/pdf/pdf-library-ui.js'
];

test('hotfix restaura bootstrap funcional da Biblioteca/PDF', () => {
  assert.doesNotMatch(
    html,
    /<script[^>]+src=["']\.\/js\/performance-loader\.js["']/,
    'performance-loader experimental não deve participar do bootstrap durante o hotfix'
  );

  for (const src of requiredPdfScripts) {
    assert.ok(
      html.includes(`<script src="${src}" defer></script>`),
      `esperava ${src} no bootstrap funcional restaurado`
    );
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const core = fs.readFileSync('public/js/app-core.js', 'utf8');
const css = fs.readFileSync('public/css/base.css', 'utf8');

test('flashcard folder keeps count and open button in one action row', () => {
  assert.match(core, /class=\"anki-folder-actions\"/);
  assert.match(core, /class=\"anki-folder-count\">\$\{matData\.total\} cartões<\/span>[\s\S]*?<button[^>]*class=\"btn btn-primary btn-sm\"[^>]*>Abrir Caixa<\/button>/);
  assert.doesNotMatch(core, /<span>\$\{isOpen \? 'Fechar' : 'Abrir'\}<\/span>/);
  assert.match(css, /\.anki-folder-actions\{[^}]*display:flex;[^}]*flex-direction:row;[^}]*flex-wrap:nowrap;[^}]*align-items:center;[^}]*gap:10px;[^}]*justify-content:flex-end;/);
});

test('Abrir Caixa preserves the existing functional filter action', () => {
  assert.match(core, /<button[^>]*type=\"button\"[^>]*onclick=\"event\.stopPropagation\(\); setFlashcardViewFilter\(decodeURIComponent\('\$\{safeMatHandler\}'\), ''\)\"[^>]*>Abrir Caixa<\/button>/);
});

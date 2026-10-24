const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const core = fs.readFileSync('public/js/app-core.js', 'utf8');
const css = fs.readFileSync('public/css/base.css', 'utf8');

test('flashcard folder keeps count and delete action together', () => {
  assert.match(core, /class=\"anki-folder-actions\"/);
  assert.match(core, /class=\"anki-folder-count\">\$\{matData\.total\} cartões<\/span>/);
  assert.match(core, /class=\"anki-delete-group-btn\"/);
  assert.match(core, /deleteFlashcardMateria/);
  assert.match(core, /deleteFlashcardAssunto/);
  assert.doesNotMatch(core, />Abrir Caixa<\/button>/);
  assert.doesNotMatch(core, /<span>\$\{isOpen \? 'Fechar' : 'Abrir'\}<\/span>/);
  assert.match(css, /\.anki-folder-actions\{[^}]*display:flex;[^}]*flex-direction:row;[^}]*flex-wrap:nowrap;[^}]*align-items:center;[^}]*gap:10px;[^}]*justify-content:flex-end;/);
});

test('flashcard folder header remains the control that opens and closes the box', () => {
  assert.match(core, /class=\"anki-folder-header\" onclick=\"toggleFcFolder\(decodeURIComponent\('\$\{safeMatHandler\}'\)\)\"/);
});

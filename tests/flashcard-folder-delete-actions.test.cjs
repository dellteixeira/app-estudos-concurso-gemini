const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const core = fs.readFileSync('public/js/app-core.js', 'utf8');

test('matéria e assunto exibem botão excluir ao lado da quantidade', () => {
  assert.match(core, /class="anki-folder-count">\$\{matData\.total\} cartões<\/span>\s*<button[^>]*class="anki-delete-group-btn"[^>]*deleteFlashcardMateria/);
  assert.match(core, /class="anki-subfolder-count">\$\{count\} cartões<\/span>\s*<button[^>]*class="anki-delete-group-btn"[^>]*deleteFlashcardAssunto/);
  assert.match(core, /event\.stopPropagation\(\)/);
});

test('exclusão em lote exige confirmação e enfileira ids para sincronização', () => {
  const materiaStart = core.indexOf('async function deleteFlashcardMateria');
  const assuntoStart = core.indexOf('async function deleteFlashcardAssunto');
  const toggleStart = core.indexOf('function toggleFcFolder', assuntoStart);
  assert.notEqual(materiaStart, -1);
  assert.notEqual(assuntoStart, -1);
  const materiaFn = core.slice(materiaStart, assuntoStart);
  const assuntoFn = core.slice(assuntoStart, toggleStart);
  assert.match(materiaFn, /await appConfirm/);
  assert.match(materiaFn, /queueFlashcardDelete\(fc\.id\)/);
  assert.match(materiaFn, /await saveFlashcardsData\(\)/);
  assert.match(assuntoFn, /await appConfirm/);
  assert.match(assuntoFn, /queueFlashcardDelete\(fc\.id\)/);
  assert.match(assuntoFn, /await saveFlashcardsData\(\)/);
});

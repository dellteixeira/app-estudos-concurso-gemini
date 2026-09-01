const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('public/css/responsive-polish-v10.64.31.css', 'utf8');
const html = fs.readFileSync('public/index.html', 'utf8');

test('mobile retention metrics use a non-overlapping 2x2 grid', () => {
  assert.match(css, /#retentionDiagnosticPanel \.rd-metrics-v1077[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /grid-auto-rows:\s*minmax\(164px, auto\)/);
  assert.match(css, /gap:\s*12px/);
});

test('mobile calendar actions are aligned as two rows of two buttons', () => {
  assert.match(css, /#calendarWorkspace \.calendar-primary-actions[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(html, /class="calendar-primary-actions"[\s\S]*Preencher Cronograma[\s\S]*Limpar Cronograma[\s\S]*Limpar Matérias[\s\S]*Reorganizar Matérias/);
});

test('mobile flashcard actions keep export import together and reset full width', () => {
  assert.match(css, /#flashcardsWorkspace \.flashcard-anki-actions[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /#flashcardsWorkspace #btnResetFcFilter[\s\S]*grid-column:\s*1 \/ -1/);
  assert.match(html, /Exportar Flashcards[\s\S]*Importar Flashcards[\s\S]*Fechar Caixa \/ Ocultar Cartões/);
});

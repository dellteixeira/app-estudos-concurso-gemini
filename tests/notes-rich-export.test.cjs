'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rich = fs.readFileSync(path.join(root, 'public/js/notes-export-rich.js'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'public/pwa-update.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

test('exportador rico interpreta estrutura e formatação das notas', () => {
  assert.match(rich, /noteHtmlToBlocks/);
  assert.match(rich, /\['B','STRONG'\]\.includes\(tag\)/);
  assert.match(rich, /\['I','EM'\]\.includes\(tag\)/);
  assert.match(rich, /tag === 'U'/);
  assert.match(rich, /\^H\[1-6\]\$/);
  assert.match(rich, /parseFontSize/);
  assert.match(rich, /tag === 'BR'/);
});

test('preserva estilos inline usados pelo editor rico', () => {
  assert.match(rich, /fontWeight/);
  assert.match(rich, />= 600/);
  assert.match(rich, /fontStyle/);
  assert.match(rich, /textDecoration/);
  assert.match(rich, /fontSize/);
  assert.match(rich, /node\?\.style\?\.color/);
});

test('normaliza blocos vazios sem criar espaçamentos exagerados', () => {
  assert.match(rich, /elementIsVisuallyEmpty/);
  assert.match(rich, /collapseBlankBlocks/);
  assert.match(rich, /type:'spacer'/);
  assert.match(rich, /Math\.min\(10,Math\.max\(4,block\.height\|\|7\)\)/);
});

test('tokenização mantém espaços junto ao texto e evita palavras coladas', () => {
  assert.match(rich, /source\.match\(\/\\n\|\[\^\\S\\n\]\*\[\^\\s\\n\]\+/);
  assert.match(rich, /units\+=0\.34/);
  assert.match(rich, /text\.replace\(\/\^\\s\+\//);
});

test('PDF possui fontes regular, negrito, itálico e negrito-itálico', () => {
  assert.match(rich, /Helvetica \/Encoding/);
  assert.match(rich, /Helvetica-Bold \/Encoding/);
  assert.match(rich, /Helvetica-Oblique \/Encoding/);
  assert.match(rich, /Helvetica-BoldOblique \/Encoding/);
  assert.match(rich, /s\.underline/);
});

test('layout exportado usa hierarquia empresarial e paginação', () => {
  assert.match(rich, /Caderno de Anotações/);
  assert.match(rich, /noteTitle/);
  assert.match(rich, /separator/);
  assert.match(rich, /Página \$\{pageIndex\+1\}\/\$\{pages\.length\}/);
  assert.match(rich, /MediaBox \[0 0 \$\{PAGE_W\} \$\{PAGE_H\}\]/);
});

test('matéria selecionada é persistida por usuário e concurso', () => {
  assert.match(rich, /notes_selected_materia:/);
  assert.match(rich, /localStorage\.setItem\(selectionStorageKey\(\),materia\)/);
  assert.match(rich, /readSavedMateria/);
  assert.match(rich, /restoreSelectedMateria/);
  assert.match(rich, /MutationObserver/);
  assert.match(rich, /__notesSelectionWrapped/);
});

test('renderizador rico substitui somente o botão Exportar e mantém fallback', () => {
  assert.match(rich, /old\.cloneNode\(true\)/);
  assert.match(rich, /old\.replaceWith\(button\)/);
  assert.match(loader, /script\.onload = loadNotesRichExport/);
  assert.match(loader, /exportador simples continuará disponível/);
});

test('PWA armazena o renderizador rico no app shell', () => {
  assert.match(sw, /\.\/js\/notes-export-rich\.js/);
  assert.match(loader, /\.\/js\/notes-export-rich\.js/);
});

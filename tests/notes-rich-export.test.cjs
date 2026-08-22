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

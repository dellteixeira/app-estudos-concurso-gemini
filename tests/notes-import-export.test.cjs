'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/js/notes-import-export.js'), 'utf8');
const pwa = fs.readFileSync(path.join(root, 'public/pwa-update.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

test('anotações oferece Importar e Exportar ao lado de Incluir Nota', () => {
  assert.match(source, /textContent = 'Importar'/);
  assert.match(source, /textContent = 'Exportar'/);
  assert.match(source, /findIncludeButton/);
  assert.match(source, /wrap\.append\(importBtn, exportBtn, include, input\)/);
});

test('exportação é restrita à matéria selecionada e gera PDF', () => {
  assert.match(source, /filter\(note => String\(note\?\.materia/);
  assert.match(source, /application\/pdf/);
  assert.match(source, /%PDF-1\.4/);
  assert.match(source, /_anotacoes\.pdf/);
});

test('importação cobre formatos de Windows, macOS e Linux', () => {
  for (const ext of ['doc','docx','txt','rtf','odt','fodt','pages','md','html']) {
    assert.ok(source.includes(`.${ext}`) || source.includes(`'${ext}'`), `faltou suporte/degradação explícita para ${ext}`);
  }
  assert.match(source, /word\/document\.xml/);
  assert.match(source, /content\.xml/);
  assert.match(source, /Pages atuais usam um formato binário proprietário/);
});

test('arquivos importados viram structuredNotes da matéria ativa', () => {
  assert.match(source, /structuredNotes\.push/);
  assert.match(source, /materia,assunto,titulo:title/);
  assert.match(source, /saveConcursosMetadata\(metadata\)/);
});

test('módulo é carregado pelo PWA e armazenado no app shell', () => {
  assert.match(pwa, /\.\/js\/notes-import-export\.js/);
  assert.match(sw, /\.\/js\/notes-import-export\.js/);
});

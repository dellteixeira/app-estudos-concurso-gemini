import fs from 'node:fs';

function replaceOnce(path, oldValue, newValue) {
  const source = fs.readFileSync(path, 'utf8');
  const first = source.indexOf(oldValue);
  if (first < 0) throw new Error(`${path}: padrão não encontrado`);
  if (source.indexOf(oldValue, first + oldValue.length) >= 0) {
    throw new Error(`${path}: padrão encontrado mais de uma vez`);
  }
  fs.writeFileSync(path, source.replace(oldValue, newValue), 'utf8');
}

// Remove somente a linha do botão manual, preservando integralmente as quebras de linha do HTML.
{
  const path = 'public/index.html';
  const data = fs.readFileSync(path);
  const marker = Buffer.from('<button class="btn btn-secondary" type="button" data-action="call" data-call="PdfStudyLibraryUI.refresh">↻ Atualizar</button>', 'utf8');
  const pos = data.indexOf(marker);
  if (pos < 0) throw new Error(`${path}: botão Atualizar não encontrado`);
  if (data.indexOf(marker, pos + marker.length) >= 0) throw new Error(`${path}: botão Atualizar duplicado`);
  const prior = data.subarray(0, pos);
  const lineStartRelative = prior.lastIndexOf(0x0a);
  const lineStart = lineStartRelative < 0 ? 0 : lineStartRelative + 1;
  const nextLf = data.indexOf(0x0a, pos + marker.length);
  const lineEnd = nextLf < 0 ? data.length : nextLf + 1;
  fs.writeFileSync(path, Buffer.concat([data.subarray(0, lineStart), data.subarray(lineEnd)]));
}

// Ao ativar Biblioteca, força a mesma atualização completa que antes dependia do botão manual.
replaceOnce(
  'public/js/app-ai.js',
  `            } else {\n                if (tabId === 'tab-edital') requestAnimationFrame(() => renderChart());\n                if (options.focus !== false) scheduleTabWorkspaceFocus(tabId, options);\n            }`,
  `            } else if (tabId === 'tab-biblioteca') {\n                requestAnimationFrame(() => {\n                    Promise.resolve(window.PdfStudyLibraryUI?.onTabActivated?.())\n                        .catch(error => console.warn('Atualização automática da Biblioteca falhou:', error));\n                    if (options.focus !== false) scheduleTabWorkspaceFocus(tabId, options);\n                });\n            } else {\n                if (tabId === 'tab-edital') requestAnimationFrame(() => renderChart());\n                if (options.focus !== false) scheduleTabWorkspaceFocus(tabId, options);\n            }`
);

// A API refresh só servia ao botão removido; onTabActivated permanece como caminho canônico.
replaceOnce(
  'public/js/pdf/pdf-library-ui.js',
  `async function refreshLibrary(){state.initializedFor='';await initialize(true)}\n`,
  ''
);
replaceOnce(
  'public/js/pdf/pdf-library-ui.js',
  'Object.freeze({initialize,refresh:refreshLibrary,getCurrentContest:contest,onTabActivated:activateLibrary,',
  'Object.freeze({initialize,getCurrentContest:contest,onTabActivated:activateLibrary,'
);
{
  const path = 'public/js/pdf/pdf-library-ui.js';
  let source = fs.readFileSync(path, 'utf8');
  source = source.replace(
    'Falha temporária de conexão. Seus PDFs salvos não foram apagados. Tente atualizar a Biblioteca em alguns segundos.',
    'Falha temporária de conexão. Seus PDFs salvos não foram apagados. A Biblioteca será atualizada novamente ao ser aberta.'
  );
  fs.writeFileSync(path, source, 'utf8');
}

// Sincroniza a identidade/cache da versão.
for (const path of [
  'config/app-assets.json',
  'package.json',
  'public/version.json',
  'public/sw.js',
  'src/index.js',
  'public/js/app-pwa.js'
]) {
  const source = fs.readFileSync(path, 'utf8');
  if (!source.includes('10.62.0')) throw new Error(`${path}: versão 10.62.0 não encontrada`);
  fs.writeFileSync(path, source.replaceAll('10.62.0', '10.63.0'), 'utf8');
}

fs.writeFileSync('tests/library-auto-refresh-v10.63.test.cjs', `const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = path => fs.readFileSync(path, 'utf8');

test('Biblioteca atualiza automaticamente ao ativar a guia e não expõe botão manual', () => {
  const index = read('public/index.html');
  const navigation = read('public/js/app-ai.js');
  const library = read('public/js/pdf/pdf-library-ui.js');

  assert.doesNotMatch(index, /PdfStudyLibraryUI\\.refresh/);
  assert.doesNotMatch(index, />\\s*↻\\s*Atualizar\\s*</);
  assert.match(navigation, /tabId === 'tab-biblioteca'/);
  assert.match(navigation, /PdfStudyLibraryUI\\?\\.onTabActivated\\?\\.\\(\\)/);
  assert.match(library, /onTabActivated:activateLibrary/);
  assert.doesNotMatch(library, /refresh:refreshLibrary/);
  assert.doesNotMatch(library, /function refreshLibrary/);
});
`, 'utf8');

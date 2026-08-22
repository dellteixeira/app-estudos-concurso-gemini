const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync('public/js/notes-export-rich.js','utf8');

test('exportação de anotações usa documento HTML UTF-8 de alta fidelidade',()=>{
  assert.match(src,/meta charset=\"UTF-8\"/);
  assert.match(src,/buildHighFidelityPrintHtml\(materia,notes\)/);
  assert.match(src,/await printHighFidelityDocument\(materia,notes\)/);
  assert.doesNotMatch(src,/const blob=makeRichPdfBlob\(materia,notes\);const url/);
});

test('caracteres especiais e símbolos não passam pela conversão WinAnsi no caminho principal',()=>{
  const exportBlock=src.slice(src.indexOf('async function exportRich()'),src.indexOf('function selectionStorageKey()'));
  assert.doesNotMatch(exportBlock,/normalizePdfChar|toPdfText|latin1Bytes|makeRichPdfBlob/);
  assert.match(src,/Segoe UI Symbol/);
  assert.match(src,/Segoe UI Emoji/);
  assert.match(src,/Noto Color Emoji/);
});

test('imagens figuras tabelas e SVG são preservados no layout de impressão',()=>{
  assert.match(src,/\.note-body img,\.note-body svg,\.note-body figure,\.note-body video/);
  assert.match(src,/\.note-body table/);
  assert.match(src,/break-inside:avoid-page/);
  assert.match(src,/print-color-adjust:exact/);
  assert.match(src,/doc\?\.images/);
});

test('HTML imprimível remove elementos e atributos executáveis sem destruir formatação rica',()=>{
  assert.match(src,/script,iframe,object,embed,link,meta,base/);
  assert.match(src,/name\.startsWith\('on'\)/);
  assert.match(src,/javascript:/i);
  assert.match(src,/holder\.innerHTML/);
});

test('impressão usa A4 e aguarda fontes e imagens antes de abrir o diálogo PDF',()=>{
  assert.match(src,/@page\{size:A4/);
  assert.match(src,/doc\?\.fonts\?\.ready/);
  assert.match(src,/await waitForPrintAssets\(doc\)/);
  assert.match(src,/win\.print\(\)/);
});

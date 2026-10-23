const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appCore = fs.readFileSync(path.join(__dirname,'../public/js/app-core.js'),'utf8');
const pdfLinks = fs.readFileSync(path.join(__dirname,'../public/js/pdf/pdf-links.js'),'utf8');

test('exclusão de concurso remove estado local antes de limpar vínculos de PDF', () => {
  const start = appCore.indexOf('async function removerConcursoAtual');
  assert.notEqual(start, -1);
  const end = appCore.indexOf('async function excluirMateriaEspecifica', start);
  const fn = appCore.slice(start, end);
  const queueIndex = fn.indexOf('queueConcursoDelete(concursoRemovido)');
  const localDeleteIndex = fn.indexOf('delete metadata[concursoRemovido]');
  const pdfIndex = fn.indexOf('handleConcursoDelete?.(concursoRemovido)');
  assert.ok(queueIndex >= 0);
  assert.ok(localDeleteIndex > queueIndex);
  assert.ok(pdfIndex > localDeleteIndex, 'limpeza de PDF deve ocorrer após a exclusão local');
  assert.match(fn, /catch \(pdfError\)[\s\S]*serão limpos posteriormente/);
});

test('falha online ao excluir vínculos de PDF entra na fila sem propagar erro', () => {
  const start = pdfLinks.indexOf('async function handleConcursoDelete');
  assert.notEqual(start, -1);
  const end = pdfLinks.indexOf('async function processPendingContestOperations', start);
  const fn = pdfLinks.slice(start, end);
  assert.match(fn, /try \{[\s\S]*deleteConcursoNow\(concurso\)/);
  assert.match(fn, /catch \(error\)[\s\S]*queueContestOperation\(\{ type: 'delete', concurso \}\)/);
  assert.match(fn, /return false/);
});

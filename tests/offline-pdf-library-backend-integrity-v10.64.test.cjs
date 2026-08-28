const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'public/js/pdf/pdf-offline-library-manager.js'), 'utf8');
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

test('Fase 9 permanece promovida na linha canônica 10.64.x', () => {
  assert.match(packageVersion, /^10\.64\.\d+$/);
});

test('Fase 9 não aceita falso sucesso quando backend offline está ausente', () => {
  const start = manager.indexOf('async function persistOfflineBlob');
  const end = manager.indexOf('function withStorageCommitGate', start);
  const block = manager.slice(start, end);
  assert.doesNotMatch(block, /stored:true,backend:'legacy'/);
  assert.match(block, /throw new Error\('O armazenamento offline deste navegador não está disponível\. Recarregue o aplicativo e tente novamente\.'\)/);
});

test('persistência continua aceitando somente backends que confirmam stored', () => {
  const start = manager.indexOf('async function persistOfflineBlob');
  const end = manager.indexOf('function withStorageCommitGate', start);
  const block = manager.slice(start, end);
  assert.match(block, /PdfLibraryOfflineAdapter\?\.put/);
  assert.match(block, /OfflinePdfStore\?\.put/);
  assert.equal((block.match(/if\(result\?\.stored\)return result/g)||[]).length, 2);
});

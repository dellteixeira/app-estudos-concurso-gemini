const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'public/js/pdf/pdf-offline-library-manager.js'), 'utf8');
const packageVersion = String(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version || '').trim();
const publicVersion = String(JSON.parse(fs.readFileSync(path.join(root, 'public/version.json'), 'utf8')).version || '').trim();
const assetVersion = String(JSON.parse(fs.readFileSync(path.join(root, 'config/app-assets.json'), 'utf8')).version || '').trim();

test('Fase 8 permanece na linha canônica 10.64.x com identidade pública sincronizada', () => {
  assert.match(packageVersion, /^10\.64\.\d+$/);
  assert.equal(publicVersion, packageVersion);
  assert.equal(assetVersion, packageVersion);
});

test('persistência valida o tamanho real do blob antes de gravar', () => {
  const start = manager.indexOf('async function persistOfflineBlobWithinBudget');
  const end = manager.indexOf('async function fetchManagedBlob', start);
  const block = manager.slice(start, end);

  assert.match(block, /actualBytes=Math\.max\(0,Number\(blob\?\.size\)\|\|0\)/);
  assert.match(block, /const current=await budget\(\)/);
  assert.match(block, /actualBytes>allowedBytes/);
  assert.match(block, /await persistOfflineBlob\(userId,doc,blob\)/);
  assert.ok(block.indexOf('actualBytes>allowedBytes') < block.indexOf('await persistOfflineBlob(userId,doc,blob)'));
});

test('orçamento da execução é inicializado pelo preflight e consumido pelo tamanho real', () => {
  assert.match(manager, /runStorageRemaining=check\.budget\.appBudget/);
  assert.match(manager, /runStorageRemaining=Math\.max\(0,runStorageRemaining-actualBytes\)/);
});

test('gravações concorrentes passam por gate serializado de orçamento', () => {
  const start = manager.indexOf('function withStorageCommitGate');
  const end = manager.indexOf('async function fetchManagedBlob', start);
  const block = manager.slice(start, end);

  assert.match(block, /storageCommitGate\.then\(task,task\)/);
  assert.match(block, /storageCommitGate=next\.catch\(\(\)=>\{\}\)/);
  assert.match(block, /return withStorageCommitGate\(async\(\)=>/);
});

test('downloadOne usa a proteção pós-download em vez de persistir diretamente', () => {
  const start = manager.indexOf('async function downloadOne');
  const end = manager.indexOf('async function worker', start);
  const block = manager.slice(start, end);

  assert.match(block, /if\(!blob\?\.size\)throw new Error\('O PDF baixado está vazio\.'/);
  assert.match(block, /persistOfflineBlobWithinBudget\(u\.id,doc,blob,runId\)/);
  assert.doesNotMatch(block, /persistOfflineBlob\(u\.id,doc,blob\)/);
});

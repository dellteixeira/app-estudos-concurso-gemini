const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'public/js/pdf/pdf-offline-library-manager.js'), 'utf8');
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

test('Fase 5 permanece na linha canônica 10.64.x', () => {
  assert.match(packageVersion, /^10\.64\.\d+$/);
});

test('workers concorrentes mantêm documento ativo em escopo local', () => {
  assert.match(manager, /const activeDownloads=new Map\(\)/);
  assert.match(manager, /const doc=queue\.shift\(\);if\(!doc\)break;/);
  assert.doesNotMatch(manager, /current=queue\.shift\(\)/);
  assert.match(manager, /activeIds=\[\.\.\.activeDownloads\.keys\(\)\]/);
  assert.match(manager, /activeCount:activeIds\.length/);
});

test('Cancelar fila aborta downloads em voo e não os contabiliza como falha', () => {
  assert.match(manager, /new global\.AbortController\(\)/);
  assert.match(manager, /fetchManagedBlob\(doc,controller\?\.signal\)/);
  assert.match(manager, /global\.fetch\(signedUrl,\{cache:'no-store',credentials:'omit',signal\}\)/);
  assert.match(manager, /entry\.controller\?\.abort\(\)/);
  assert.match(manager, /error\.code='PDF_OFFLINE_CANCELLED'/);
  assert.match(manager, /isCancelledError\(error\)\|\|cancelled\|\|runId!==runGeneration/);
  assert.match(manager, /emit\('cancelled-item',\{document:doc\}\)/);
});

test('blob cancelado não é persistido depois do cancelamento da execução', () => {
  const downloadOne = manager.slice(manager.indexOf('async function downloadOne'), manager.indexOf('async function worker'));
  assert.match(downloadOne, /assertRunActive\(runId\);[\s\S]*persistOfflineBlob/);
  assert.match(downloadOne, /persistOfflineBlob[\s\S]*assertRunActive\(runId\)/);
  assert.match(downloadOne, /activeDownloads\.delete\(key\)/);
});

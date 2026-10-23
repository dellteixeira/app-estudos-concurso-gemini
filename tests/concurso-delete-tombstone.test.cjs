const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const core=fs.readFileSync('public/js/app-core.js','utf8');

test('tombstone de concurso impede retorno no seletor e no merge remoto',()=>{
  assert.match(core,/const deletedContests = new Set\(\(getSyncState\(\)\.concursoDeletes \|\| \[\]\)/);
  assert.match(core,/!deletedContests\.has\(nome\)\) set\.add\(nome\)/);
  assert.match(core,/if \(deletedContests\.has\(name\)\) \{\s*delete result\[name\];\s*return;/);
});

test('tombstone só é removida após metadata remota ser limpa',()=>{
  const start=core.indexOf('async function flushPendingConcursoDeletes');
  assert.notEqual(start,-1);
  const end=core.indexOf('async function syncAllWithSupabase',start);
  const fn=core.slice(start,end);
  const deleteMetadata=fn.indexOf('delete remoteMetadata[concursoName]');
  const clearTombstone=fn.indexOf('latestState.concursoDeletes = latestState.concursoDeletes.filter');
  assert.ok(deleteMetadata>=0);
  assert.ok(clearTombstone>deleteMetadata);
  assert.match(fn,/from\('user_settings'\)\.upsert/);
});

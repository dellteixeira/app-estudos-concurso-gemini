const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const core=fs.readFileSync('public/js/app-core.js','utf8');

test('exclusao de concurso possui tombstone remota persistente',()=>{
  assert.match(core,/DELETED_CONCURSOS_SETTING_KEY = 'deleted_concursos_v1'/);
  assert.match(core,/persistRemoteConcursoDeletion\(concursoName\)/);
  assert.match(core,/saveRemoteDeletedConcursos\(remote\)/);
});

test('sincronizacao consulta tombstones antes de enviar dados locais',()=>{
  const syncIndex=core.indexOf('async function syncAllWithSupabase');
  const loadDeleted=core.indexOf('const remoteDeletedConcursos = await loadRemoteDeletedConcursos()',syncIndex);
  const flushEdital=core.indexOf('await flushPendingEdital()',syncIndex);
  assert.ok(loadDeleted>syncIndex);
  assert.ok(flushEdital>loadDeleted);
});

test('tombstone remove concurso dos upserts locais e metadados',()=>{
  assert.match(core,/delete state\.editalUpserts\[id\]/);
  assert.match(core,/delete metadata\[name\]/);
  assert.match(core,/delete state\.flashcardsDirty\[name\]/);
});

test('download remoto filtra concursos excluidos',()=>{
  assert.match(core,/remoteDeletedNames = new Set\(Object\.keys\(remoteDeletedConcursos\)\)/);
  assert.match(core,/filter\(item => !remoteDeletedNames\.has\(String\(item\.concurso/);
});

test('recriacao explicita limpa tombstone remota',()=>{
  const occurrences=(core.match(/clearRemoteConcursoDeletion\(nome\)/g)||[]).length;
  assert.ok(occurrences>=2);
});

test('exclusao remota e gravada antes de apagar dados associados',()=>{
  const start=core.indexOf('async function flushPendingConcursoDeletes');
  const tomb=core.indexOf('await persistRemoteConcursoDeletion(concursoName)',start);
  const editalDelete=core.indexOf(".from('edital')",start);
  assert.ok(tomb>start);
  assert.ok(editalDelete>tomb);
});

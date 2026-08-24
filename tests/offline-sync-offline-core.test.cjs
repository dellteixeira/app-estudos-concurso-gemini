'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const manifest=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));
const sw=fs.readFileSync('public/sw.js','utf8');
const worker=fs.readFileSync('src/worker.js','utf8');
const headers=fs.readFileSync('public/_headers','utf8');

const CORE=['/js/core/offline-outbox-store.js','/js/core/offline-sync-shadow.js'];

test('outbox e shadow fazem parte do núcleo offline canônico',()=>{
  for(const path of CORE){
    assert.ok(manifest.criticalAppShell.includes(path),`${path} ausente do criticalAppShell`);
    assert.ok(manifest.networkFirstPaths.includes(path),`${path} ausente de networkFirstPaths`);
    assert.ok(manifest.workerNoStorePaths.includes(path),`${path} ausente de workerNoStorePaths`);
    assert.ok(manifest.headersNoStorePaths.includes(path),`${path} ausente de headersNoStorePaths`);
    assert.match(sw,new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/^\//,'(?:\\.\\/|/)')));
    assert.match(worker,new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    assert.match(headers,new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n\\s+Cache-Control: no-cache, no-store, must-revalidate`,'m'));
  }
});

test('shadow continua observacional e não ganha autoridade remota por entrar no app shell',()=>{
  const shadow=fs.readFileSync('public/js/core/offline-sync-shadow.js','utf8');
  assert.doesNotMatch(shadow,/syncAllWithSupabase\s*\(/);
  assert.doesNotMatch(shadow,/supabaseClient\./);
  assert.doesNotMatch(shadow,/\.from\s*\(/);
  assert.match(shadow,/status:'shadow'/);
});

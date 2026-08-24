const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');

const appState=fs.readFileSync('public/js/app-state.js','utf8');
const syncEngine=fs.readFileSync('public/js/sync-engine.js','utf8');
const pwa=fs.readFileSync('public/pwa-update.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const worker=fs.readFileSync('src/index.js','utf8');
const headers=fs.readFileSync('public/_headers','utf8');
const assets=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

test('v10.27 state and sync modules have valid JavaScript syntax',()=>{
  for(const file of ['public/js/app-state.js','public/js/sync-engine.js','public/pwa-update.js']) {
    cp.execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
  }
});

test('AppState exposes the canonical state facade',()=>{
  for(const api of ['getSnapshot','getCurrentContest','getEdital','getTopic','updateTopic','setCurrentContest','subscribe','refresh']) {
    assert.match(appState,new RegExp(`\\b${api}\\b`));
  }
  assert.match(appState,/global\.AppState = Object\.freeze/);
  assert.match(appState,/queueEditalUpsert\(item\)/);
  assert.match(appState,/saveEditalToLocalStorage\(\)/);
  assert.match(appState,/global\.SyncEngine\?\.markPending/);
});

test('SyncEngine persists explicit states and bounded backoff',()=>{
  for(const status of ['idle','pending','syncing','synced','error','conflict']) assert.ok(syncEngine.includes(`'${status}'`));
  assert.match(syncEngine,/const BACKOFF_MS = \[2000, 5000, 15000, 30000, 60000\]/);
  assert.match(syncEngine,/sync_engine_state_/);
  assert.match(syncEngine,/await syncAllWithSupabase\(\)/);
  assert.match(syncEngine,/scheduleRetry\(nextAttempt\)/);
  assert.match(syncEngine,/global\.addEventListener\('online'/);
  assert.match(syncEngine,/resolveConflict/);
  assert.match(syncEngine,/reportConflict/);
});

test('state and sync architecture is bootstrapped and available offline',()=>{
  assert.match(pwa,/loadStateSyncModules/);
  assert.match(pwa,/\.\/js\/app-state\.js/);
  assert.match(pwa,/\.\/js\/sync-engine\.js/);
  for(const path of ['/js/app-state.js','/js/sync-engine.js']) {
    assert.ok(assets.criticalAppShell.includes(path),`${path} must be critical app shell`);
    assert.ok(assets.networkFirstPaths.includes(path),`${path} must be network first`);
    assert.ok(sw.includes(`'.${path}'`) || sw.includes(`'${path}'`),`${path} must be cached by service worker`);
  }
});

test('production no-store policy covers state and sync modules',()=>{
  for(const path of ['/js/app-state.js','/js/sync-engine.js']) {
    assert.ok(assets.workerNoStorePaths.includes(path),`${path} must be in Worker no-store manifest`);
    assert.ok(assets.headersNoStorePaths.includes(path),`${path} must be in _headers no-store manifest`);
    assert.ok(worker.includes(`"${path}"`),`${path} must be no-store in Cloudflare Worker`);
    const escaped=path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    assert.match(headers,new RegExp(`(?:^|\\n)${escaped}\\n\\s+Cache-Control: [^\\n]*no-store`));
  }
});

test('v10.27 release sources remain synchronized',()=>{
  assert.equal(pkg.version,'10.27.0');
  assert.equal(assets.version,'10.27.0');
  assert.match(worker,/const APP_VERSION = "10\.27\.0"/);
  assert.match(sw,/const APP_VERSION = '10\.27\.0'/);
});

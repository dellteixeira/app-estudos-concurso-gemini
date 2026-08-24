'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');

const core=fs.readFileSync('public/js/app-core.js','utf8');
const store=fs.readFileSync('public/js/core/local-backup-store.js','utf8');
const index=fs.readFileSync('public/index.html','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const worker=fs.readFileSync('src/index.js','utf8');
const headers=fs.readFileSync('public/_headers','utf8');
const assets=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const browser=fs.readFileSync('tests/browser/state-sync-critical.spec.cjs','utf8');

test('phase 3 extracted backup store has valid syntax and stable API',()=>{
  cp.execFileSync(process.execPath,['--check','public/js/core/local-backup-store.js'],{stdio:'pipe'});
  for(const api of ['openDatabase','read','write','fingerprint','countStats']) assert.match(store,new RegExp(`\\b${api}\\b`));
  assert.match(store,/global\.AppLocalBackupStore = Object\.freeze/);
});

test('app-core delegates extracted backup responsibilities instead of owning persistence',()=>{
  assert.match(core,/return AppLocalBackupStore\.openDatabase\(\)/);
  assert.match(core,/return AppLocalBackupStore\.read\(currentUser\?\.id, slot\)/);
  assert.match(core,/return AppLocalBackupStore\.write\(record\)/);
  assert.match(core,/return AppLocalBackupStore\.fingerprint\(core\)/);
  assert.match(core,/return AppLocalBackupStore\.countStats\(snapshot\)/);
  assert.doesNotMatch(core,/indexedDB\.open\(LOCAL_BACKUP_DB/);
  assert.doesNotMatch(core,/Math\.imul\(hash, 16777619\)/);
});

test('extracted module loads before app-core and is governed by every production cache layer',()=>{
  assert.ok(index.indexOf('./js/core/local-backup-store.js') < index.indexOf('./js/app-core.js'));
  const asset='/js/core/local-backup-store.js';
  for(const key of ['criticalAppShell','networkFirstPaths','workerNoStorePaths','headersNoStorePaths']) assert.ok(assets[key].includes(asset),`${asset} missing from ${key}`);
  assert.match(sw,/\.\/js\/core\/local-backup-store\.js/);
  assert.match(worker,/"\/js\/core\/local-backup-store\.js"/);
  assert.match(headers,/\/js\/core\/local-backup-store\.js[\s\S]*?Cache-Control: no-cache, no-store, must-revalidate/);
});

test('phase 4 critical e2e covers real app shell, AppState, SyncEngine and offline transition',()=>{
  assert.match(browser,/AppState && window\.SyncEngine && window\.AppLocalBackupStore/);
  assert.match(browser,/context\.setOffline\(true\)/);
  assert.match(browser,/context\.setOffline\(false\)/);
  assert.match(browser,/AppState\.subscribe/);
  assert.match(browser,/SyncEngine\.getState\(\)/);
  assert.match(browser,/AppLocalBackupStore\.countStats/);
});

test('release identity is synchronized with canonical package version',()=>{
  const version=String(pkg.version);
  const escaped=version.replace(/\./g,'\\.');
  assert.equal(assets.version,version);
  assert.match(sw,new RegExp(`const APP_VERSION = '${escaped}'`));
  assert.match(worker,new RegExp(`const APP_VERSION = "${escaped}"`));
});

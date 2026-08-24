'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('phase 5 keeps AppState as a versioned observable contract', () => {
  const source = read('public/js/app-state.js');
  assert.match(source, /const SCHEMA_VERSION = 2;/);
  assert.match(source, /function select\(selector\)/);
  assert.match(source, /function getDiagnostics\(\)/);
  assert.match(source, /subscriberCount:listeners\.size/);
  assert.match(source, /schemaVersion:SCHEMA_VERSION/);
  assert.match(source, /select,/);
  assert.match(source, /getDiagnostics,/);
});

test('phase 6 keeps SyncEngine history bounded and diagnostic-only', () => {
  const source = read('public/js/sync-engine.js');
  assert.match(source, /const SCHEMA_VERSION = 2;/);
  assert.match(source, /const HISTORY_LIMIT = 40;/);
  assert.match(source, /function appendHistory\(/);
  assert.match(source, /function getHistory\(/);
  assert.match(source, /function getDiagnostics\(\)/);
  assert.match(source, /syncengine:transition/);
  assert.match(source, /slice\(-HISTORY_LIMIT\)/);
  assert.doesNotMatch(source, /history[^\n]*queueState\(\)/i, 'transition history must not persist queue payloads');
});

test('critical browser suite enforces the phase 5/6 APIs', () => {
  const source = read('tests/browser/state-sync-critical.spec.cjs');
  assert.match(source, /AppState\.select/);
  assert.match(source, /AppState\.getDiagnostics/);
  assert.match(source, /SyncEngine\.getHistory/);
  assert.match(source, /SyncEngine\.getDiagnostics/);
  assert.match(source, /schemaVersion\)\.toBe\(2\)/);
});

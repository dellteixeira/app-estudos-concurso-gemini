const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const quality = fs.readFileSync('.github/workflows/quality-check.yml', 'utf8');
const android = fs.readFileSync('.github/workflows/android-ci.yml', 'utf8');

test('quality pipeline separates fast and UI checks with a compatibility gate', () => {
  assert.match(quality, /\n  changes:\n/);
  assert.match(quality, /\n  fast-check:\n/);
  assert.match(quality, /\n  ui-check:\n/);
  assert.match(quality, /\n  test-and-audit:\n/);
  assert.match(quality, /needs\.changes\.outputs\.ui == 'true'/);
  assert.match(quality, /Automated tests[\s\S]*npm test/);
  assert.match(quality, /Structural audit[\s\S]*npm run audit/);
});

test('Playwright browsers use deterministic cache', () => {
  assert.match(quality, /actions\/cache@0400d5f644dc74513175e3cd8d07132dd4860809/);
  assert.match(quality, /~\/\.cache\/ms-playwright/);
  assert.match(quality, /playwright-1\.55\.0/);
  assert.match(quality, /cache-hit != 'true'/);
});

test('Node and Gradle caches are enabled', () => {
  assert.match(quality, /cache:\s*npm/);
  assert.match(android, /cache:\s*npm/);
  assert.match(android, /cache:\s*gradle/);
});

test('Android pipeline distinguishes packaging changes from native runtime changes', () => {
  assert.match(android, /Detect Android scopes/);
  assert.match(android, /android=false/);
  assert.match(android, /runtime=false/);
  assert.match(android, /needs\.changes\.outputs\.android == 'true'/);
  assert.match(android, /needs\.changes\.outputs\.runtime == 'true'/);
  assert.match(android, /assembleDebug/);
  assert.match(android, /connectedDebugAndroidTest/);
});

test('Android Check no longer repeats global web tests already owned by Fast Check', () => {
  assert.doesNotMatch(android, /Run web unit tests/);
  assert.doesNotMatch(android, /Run structural audits/);
});

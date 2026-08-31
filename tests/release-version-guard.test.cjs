const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const guard = fs.readFileSync('scripts/release-version-guard.mjs', 'utf8');
const qualityWorkflow = fs.readFileSync('.github/workflows/quality-check.yml', 'utf8');
const androidWorkflow = fs.readFileSync('.github/workflows/android-ci.yml', 'utf8');

test('quality check runs immutable release version guard before expensive test stages', () => {
  const guardIndex = qualityWorkflow.indexOf('- name: Release version guard');
  const testsIndex = qualityWorkflow.indexOf('- name: Automated tests');
  const playwrightIndex = qualityWorkflow.indexOf('- name: Install Playwright test runner');
  assert.ok(guardIndex > 0, 'Release version guard step must exist');
  assert.ok(guardIndex < testsIndex, 'version guard must run before automated tests');
  assert.ok(guardIndex < playwrightIndex, 'version guard must run before Playwright installation');
  assert.match(qualityWorkflow, /fetch-depth:\s*0/);
  assert.match(qualityWorkflow, /RELEASE_GUARD_BASE_SHA/);
  assert.match(qualityWorkflow, /RELEASE_GUARD_HEAD_SHA/);
});

test('android CI runs the release version guard before dependency install and APK build', () => {
  const guardIndex = androidWorkflow.indexOf('- name: Release version guard');
  const installIndex = androidWorkflow.indexOf('- name: Install dependencies');
  const apkIndex = androidWorkflow.indexOf('- name: Build debug APK');
  assert.ok(guardIndex > 0, 'Android release version guard step must exist');
  assert.ok(guardIndex < installIndex, 'Android guard must run before npm ci');
  assert.ok(guardIndex < apkIndex, 'Android guard must run before APK build');
  assert.match(androidWorkflow, /scripts\/release-version-guard\.mjs/);
  assert.match(androidWorkflow, /RELEASE_GUARD_BASE_SHA/);
  assert.match(androidWorkflow, /RELEASE_GUARD_HEAD_SHA/);
});

test('release version guard protects the same canonical runtime surface used by release publishing', () => {
  for (const runtimePath of ['package.json', 'public', 'src', 'wrangler.jsonc', 'config', 'android/app/build.gradle']) {
    assert.ok(guard.includes(`'${runtimePath}'`), `guard must protect ${runtimePath}`);
  }
  assert.match(guard, /Version bump obrigatório/);
  assert.match(guard, /show-ref.*--tags.*--verify/);
  assert.match(guard, /git[\s\S]*diff|\['diff'/);
  assert.match(guard, /runtimeMatches\(tag, headSha\)/);
});

test('release version guard ignores CI-only PRs but blocks reused version for changed runtime', () => {
  assert.match(guard, /if \(!changedFiles\.length\)/);
  assert.match(guard, /nenhum arquivo de runtime alterado/);
  assert.match(guard, /tagExists\(tag\)/);
  assert.match(guard, /process\.exitCode = 1/);
});

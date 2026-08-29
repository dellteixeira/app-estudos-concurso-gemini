const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const contract = JSON.parse(fs.readFileSync('config/release-contract.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
const workflows = [
  'android-phase1-build.yml',
  'android-phase2-release-apk.yml',
  'android-phase2-signed-apk.yml',
  'android-phase2c-signed-apk-runtime.yml',
  'android-phase2d-direct-distribution.yml'
].map(name => [name, fs.readFileSync(`.github/workflows/${name}`, 'utf8')]);

const androidVersionName = `${contract.version}-mobile.${contract.android.revision}`;

test('release contract is the canonical version identity', () => {
  assert.match(contract.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.version, contract.version);
  assert.match(gradle, new RegExp(`versionCode\\s+${contract.android.versionCode}\\b`));
  assert.match(gradle, new RegExp(`versionName\\s+"${androidVersionName.replaceAll('.', '\\.') }"`));
  assert.match(gradle, new RegExp(`applicationId\\s+"${contract.android.package.replaceAll('.', '\\.') }"`));
  assert.doesNotThrow(() => execFileSync(process.execPath, ['scripts/release-contract.mjs', 'check'], { stdio: 'pipe' }));
});

test('all Android workflows resolve runtime identity from the canonical contract', () => {
  for (const [name, workflow] of workflows) {
    assert.match(workflow, /node scripts\/release-contract\.mjs github/, `${name} não resolve o contrato`);
  }
  assert.doesNotThrow(() => execFileSync(process.execPath, ['scripts/audit-workflow-release-contract.mjs'], { stdio: 'pipe' }));
});

test('Phase 2D publishes artifacts and tags from resolved contract outputs', () => {
  const workflow = workflows.find(([name]) => name === 'android-phase2d-direct-distribution.yml')[1];
  assert.match(workflow, /RELEASE_TAG/);
  assert.match(workflow, /ANDROID_VERSION_NAME/);
  assert.match(workflow, /APP_VERSION_CODE/);
  assert.match(workflow, /RESPONSIVE_CSS/);
  assert.doesNotMatch(workflow, /ANDROID_VERSION_NAME:\s*['"]\d/);
  assert.doesNotMatch(workflow, /WEB_VERSION:\s*['"]\d/);
  assert.doesNotMatch(workflow, /RELEASE_TAG:\s*['"]v\d/);
});

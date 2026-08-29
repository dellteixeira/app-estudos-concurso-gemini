const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const contract = JSON.parse(fs.readFileSync('config/release-contract.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
const workflowNames = fs.readdirSync('.github/workflows')
  .filter(name => /^android-.*\.ya?ml$/i.test(name))
  .sort();
const workflows = workflowNames.map(name => [name, fs.readFileSync(`.github/workflows/${name}`, 'utf8')]);
const legacyWorkflowNames = [
  'android-phase1-build.yml',
  'android-phase2-release-apk.yml',
  'android-phase2-signed-apk.yml',
  'android-phase2c-signed-apk-runtime.yml',
  'android-phase2d-direct-distribution.yml'
];

const androidVersionName = `${contract.version}-mobile.${contract.android.revision}`;

test('release contract is the canonical version identity', () => {
  assert.match(contract.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.version, contract.version);
  assert.match(gradle, new RegExp(`versionCode\\s+${contract.android.versionCode}\\b`));
  assert.match(gradle, new RegExp(`versionName\\s+"${androidVersionName.replaceAll('.', '\\.') }"`));
  assert.match(gradle, new RegExp(`applicationId\\s+"${contract.android.package.replaceAll('.', '\\.') }"`));
  assert.doesNotThrow(() => execFileSync(process.execPath, ['scripts/release-contract.mjs', 'check'], { stdio: 'pipe' }));
});

test('Android pipeline is consolidated into Check and Release workflows only', () => {
  assert.deepEqual(workflowNames, ['android-ci.yml', 'android-release.yml']);
  for (const name of legacyWorkflowNames) {
    assert.equal(fs.existsSync(`.github/workflows/${name}`), false, `${name} legado ainda existe`);
  }
});

test('all Android workflows resolve runtime identity from the canonical contract', () => {
  for (const [name, workflow] of workflows) {
    assert.match(workflow, /node scripts\/release-contract\.mjs github/, `${name} não resolve o contrato`);
  }
  assert.doesNotThrow(() => execFileSync(process.execPath, ['scripts/audit-workflow-release-contract.mjs'], { stdio: 'pipe' }));
});

test('Android Check scopes expensive runtime validation to native changes', () => {
  const workflow = workflows.find(([name]) => name === 'android-ci.yml')[1];
  assert.match(workflow, /name:\s*Android Check/);
  assert.match(workflow, /Detect Android scopes/);
  assert.match(workflow, /android:\s*\$\{\{ steps\.scope\.outputs\.android \}\}/);
  assert.match(workflow, /runtime:\s*\$\{\{ steps\.scope\.outputs\.runtime \}\}/);
  assert.match(workflow, /if:\s*needs\.changes\.outputs\.runtime == 'true'[\s\S]*connectedDebugAndroidTest/);
  assert.match(workflow, /cache:\s*gradle/);
  assert.match(workflow, /assembleDebug/);
  assert.match(workflow, /adb install -r/);
  assert.match(workflow, /FATAL EXCEPTION/);
  assert.match(workflow, /android-ci-screen\.png/);
  assert.doesNotMatch(workflow, /Run web unit tests/);
  assert.doesNotMatch(workflow, /Run structural audits/);
});

test('Android Release owns signed runtime validation and permanent distribution', () => {
  const workflow = workflows.find(([name]) => name === 'android-release.yml')[1];
  assert.match(workflow, /ANDROID_RELEASE_KEYSTORE_BASE64/);
  assert.match(workflow, /assembleRelease/);
  assert.match(workflow, /APKSIGNER/);
  assert.match(workflow, /AAPT/);
  assert.match(workflow, /adb install -r/);
  assert.match(workflow, /RELEASE_TAG/);
  assert.match(workflow, /ANDROID_VERSION_NAME/);
  assert.match(workflow, /APP_VERSION_CODE/);
  assert.match(workflow, /RESPONSIVE_CSS/);
  assert.match(workflow, /gh release upload/);
  assert.doesNotMatch(workflow, /ANDROID_VERSION_NAME:\s*['"]\d/);
  assert.doesNotMatch(workflow, /WEB_VERSION:\s*['"]\d/);
  assert.doesNotMatch(workflow, /RELEASE_TAG:\s*['"]v\d/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('android/mobile/android-mobile-hotfix.css', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const sharedCss = fs.readFileSync(`public/css/responsive-polish-v${pkg.version}.css`, 'utf8');
const script = fs.readFileSync('scripts/apply-android-mobile-hotfix.mjs', 'utf8');
const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
const workflow = fs.readFileSync('.github/workflows/android-phase2d-direct-distribution.yml', 'utf8');

function readMatch(text, pattern, label) {
  const match = text.match(pattern);
  assert.ok(match, `${label} ausente`);
  return match[1];
}

test('calendar mobile hotfix preserves seven columns and two-digit days', () => {
  assert.match(css, /grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)\s*!important/);
  assert.match(css, /\.day-num-value[\s\S]*white-space:\s*nowrap\s*!important/);
  assert.match(css, /\.calendar-primary-actions[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/);
  assert.match(sharedCss, /\.calendar-month-selectors[\s\S]*grid-template-columns:\s*auto minmax\(0, 1\.12fr\) minmax\(0, \.88fr\)/);
});

test('retention metric icons are removed on web and mobile while titles are emphasized', () => {
  assert.match(sharedCss, /#retentionDiagnosticPanel \.rd-metric-icon-v1077\s*\{[\s\S]*display:\s*none\s*!important/);
  assert.match(sharedCss, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*font-size:\s*clamp\(\.94rem/);
  assert.match(sharedCss, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*font-weight:\s*850\s*!important/);
  assert.match(sharedCss, /@media \(max-width: 700px\)[\s\S]*\.rd-metric-label-v1077[\s\S]*font-size:\s*clamp\(\.88rem/);
});

test('library list mode has a distinct compact grid on mobile', () => {
  assert.match(css, /#pdfLibraryGrid\.pdf-library-grid\.pdf-library-list-view \.pdf-library-card\s*\{[\s\S]*display:\s*grid\s*!important/);
  assert.match(css, /grid-template-areas:[\s\S]*"title actions"/);
  assert.match(css, /\.pdf-card-actions[\s\S]*flex-direction:\s*column\s*!important/);
});

test('native hotfix is sourced outside public and injected only during Android build', () => {
  assert.match(script, /android\/mobile\/android-mobile-hotfix\.css/);
  assert.match(script, /public\/css/);
  assert.match(script, /copyFileSync\(cssSource, cssTarget\)/);
  assert.equal(fs.existsSync('public/css/android-mobile-hotfix.css'), false);
});

test('native hotfix injects canonical web logo into Android launcher', () => {
  assert.match(script, /public\/icon-512\.png/);
  assert.match(script, /estudo_adaptativo_launcher\.png/);
  assert.match(script, /android:icon="@drawable\/estudo_adaptativo_launcher"/);
  assert.match(script, /android:roundIcon="@drawable\/estudo_adaptativo_launcher"/);
});

test('APK identity follows the canonical web release', () => {
  const versionName = readMatch(gradle, /versionName\s+"([^"]+)"/, 'versionName Android');
  const versionCode = readMatch(gradle, /versionCode\s+(\d+)/, 'versionCode Android');
  const workflowVersionName = readMatch(workflow, /ANDROID_VERSION_NAME:\s*'([^']+)'/, 'ANDROID_VERSION_NAME');
  const workflowVersionCode = readMatch(workflow, /APP_VERSION_CODE:\s*'(\d+)'/, 'APP_VERSION_CODE');
  const workflowWebVersion = readMatch(workflow, /WEB_VERSION:\s*'([^']+)'/, 'WEB_VERSION');
  const workflowReleaseTag = readMatch(workflow, /RELEASE_TAG:\s*'([^']+)'/, 'RELEASE_TAG');

  assert.equal(versionName, `${pkg.version}-mobile.1`);
  assert.equal(workflowVersionName, versionName);
  assert.equal(workflowVersionCode, versionCode);
  assert.equal(workflowWebVersion, pkg.version);
  assert.equal(workflowReleaseTag, `v${pkg.version}`);
  assert.match(workflow, /AAB inesperado foi produzido/);
  assert.match(workflow, /if:\s*github\.ref == 'refs\/heads\/main'/);
});

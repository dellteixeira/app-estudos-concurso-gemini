const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('android/mobile/android-mobile-hotfix.css', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const contract = JSON.parse(fs.readFileSync('config/release-contract.json', 'utf8'));
const sharedCss = fs.readFileSync(`public/css/responsive-polish-v${pkg.version}.css`, 'utf8');
const script = fs.readFileSync('scripts/apply-android-mobile-hotfix.mjs', 'utf8');
const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
const workflow = fs.readFileSync('.github/workflows/android-release.yml', 'utf8');

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

test('retention metric icons are removed on web and mobile while titles stay compact and readable', () => {
  assert.match(sharedCss, /#retentionDiagnosticPanel \.rd-metric-icon-v1077\s*\{[\s\S]*display:\s*none\s*!important/);
  assert.match(sharedCss, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*font-size:\s*clamp\(\.76rem,\s*\.70rem \+ \.22vw,\s*\.86rem\)\s*!important/);
  assert.match(sharedCss, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*font-weight:\s*760\s*!important/);
  assert.match(sharedCss, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*text-wrap:\s*balance\s*!important/);
  assert.match(sharedCss, /@media \(max-width: 700px\)[\s\S]*\.rd-metric-label-v1077[\s\S]*font-size:\s*clamp\(\.74rem,\s*3\.1vw,\s*\.84rem\)\s*!important/);
});

test('retention cards and actions stay optically centered on Android mobile', () => {
  assert.match(css, /#retentionDiagnosticPanel \.rd-metric-card-v1077\s*\{[\s\S]*justify-items:\s*center\s*!important[\s\S]*text-align:\s*center\s*!important/);
  assert.match(css, /#retentionDiagnosticPanel \.rd-metric-label-v1077,[\s\S]*\.rd-metric-card-v1077 > strong[\s\S]*justify-self:\s*center\s*!important[\s\S]*text-align:\s*center\s*!important/);
  assert.match(css, /#retentionDiagnosticPanel \.rd-metric-card-v1077 > strong\s*\{[\s\S]*display:\s*flex\s*!important[\s\S]*justify-content:\s*center\s*!important/);
  assert.match(css, /#retentionDiagnosticPanel \.retention-diagnostic-tools\s*\{[\s\S]*align-items:\s*center\s*!important[\s\S]*justify-content:\s*center\s*!important/);
  assert.match(css, /#retentionDiagnosticPanel \.retention-study-now-v1072,[\s\S]*\.retention-export-btn[\s\S]*width:\s*min\(100%, 420px\)\s*!important[\s\S]*margin-inline:\s*auto\s*!important[\s\S]*text-align:\s*center\s*!important/);
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

test('APK identity follows the canonical release contract', () => {
  const versionName = readMatch(gradle, /versionName\s+"([^"]+)"/, 'versionName Android');
  const versionCode = readMatch(gradle, /versionCode\s+(\d+)/, 'versionCode Android');
  const expectedVersionName = `${contract.version}-mobile.${contract.android.revision}`;

  assert.equal(pkg.version, contract.version);
  assert.equal(versionName, expectedVersionName);
  assert.equal(versionCode, String(contract.android.versionCode));

  assert.match(workflow, /node scripts\/release-contract\.mjs github/);
  assert.match(workflow, /versionCode \$APP_VERSION_CODE/);
  assert.match(workflow, /versionName \\\"\$ANDROID_VERSION_NAME\\\"/);
  assert.match(workflow, /\$RESPONSIVE_CSS/);
  assert.match(workflow, /AAB inesperado foi produzido/);
  assert.match(workflow, /workflow_run:\s*\n\s+workflows: \["Canonical GitHub Release"\]/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /gh release upload/);

  assert.doesNotMatch(workflow, /push:\s*\n\s+branches:/);
  assert.doesNotMatch(workflow, /ANDROID_VERSION_NAME:\s*['"]\d/);
  assert.doesNotMatch(workflow, /APP_VERSION_CODE:\s*['"]?\d/);
  assert.doesNotMatch(workflow, /WEB_VERSION:\s*['"]\d/);
  assert.doesNotMatch(workflow, /RELEASE_TAG:\s*['"]v\d/);
});

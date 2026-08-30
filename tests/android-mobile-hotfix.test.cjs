const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('android/mobile/android-mobile-hotfix.css', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const contract = JSON.parse(fs.readFileSync('config/release-contract.json', 'utf8'));
const sharedCss = fs.readFileSync(`public/css/responsive-polish-v${pkg.version}.css`, 'utf8');
const retentionCss = fs.readFileSync('public/css/components/retention.css', 'utf8');
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

test('retention styling is shared with web instead of duplicated in Android hotfix', () => {
  assert.match(sharedCss, /@import\s+url\(['"]\.\/components\/retention\.css['"]\)/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-icon-v1077[\s\S]*display:\s*none\s*!important/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*font-size:\s*clamp\(\.76rem,\s*\.70rem \+ \.22vw,\s*\.86rem\)\s*!important/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*font-weight:\s*760\s*!important/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*text-wrap:\s*balance\s*!important/);
  assert.doesNotMatch(css, /#retentionDiagnosticPanel|\.rd-metric(?:s|-)|#modalRetentionMetricDetails/);
});

test('shared retention grid keeps independent mobile rows without card overlap', () => {
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metrics-v1077,[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/);
  assert.match(retentionCss, /grid-auto-rows:\s*minmax\(166px,\s*auto\)\s*!important/);
  assert.match(retentionCss, /row-gap:\s*14px\s*!important/);
  assert.match(retentionCss, /column-gap:\s*10px\s*!important/);
  assert.match(retentionCss, /#retentionDiagnosticPanel \.rd-metric-card-v1077,[\s\S]*height:\s*auto\s*!important/);
  assert.match(retentionCss, /min-height:\s*166px\s*!important/);
  assert.match(retentionCss, /max-height:\s*none\s*!important/);
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
  assert.match(workflow, /if:\s*github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /gh release upload/);

  assert.doesNotMatch(workflow, /ANDROID_VERSION_NAME:\s*['"]\d/);
  assert.doesNotMatch(workflow, /APP_VERSION_CODE:\s*['"]?\d/);
  assert.doesNotMatch(workflow, /WEB_VERSION:\s*['"]\d/);
  assert.doesNotMatch(workflow, /RELEASE_TAG:\s*['"]v\d/);
});

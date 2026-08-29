const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('android/mobile/android-mobile-hotfix.css', 'utf8');
const sharedCss = fs.readFileSync('public/css/responsive-polish-v10.64.17.css', 'utf8');
const script = fs.readFileSync('scripts/apply-android-mobile-hotfix.mjs', 'utf8');
const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
const workflow = fs.readFileSync('.github/workflows/android-phase2d-direct-distribution.yml', 'utf8');

test('calendar mobile hotfix preserves seven columns and two-digit days', () => {
  assert.match(css, /grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)\s*!important/);
  assert.match(css, /\.day-num-value[\s\S]*white-space:\s*nowrap\s*!important/);
  assert.match(css, /\.calendar-primary-actions[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/);
  assert.match(sharedCss, /\.calendar-month-selectors[\s\S]*grid-template-columns:\s*auto minmax\(0, 1\.12fr\) minmax\(0, \.88fr\)/);
});

test('mobile retention keeps metric icons visible, enlarged and centered', () => {
  assert.match(sharedCss, /@media \(max-width: 700px\)[\s\S]*\.rd-metric-icon-v1077[\s\S]*display:\s*flex\s*!important/);
  assert.match(sharedCss, /\.rd-metric-icon-v1077[\s\S]*justify-self:\s*center\s*!important/);
  assert.match(sharedCss, /\.rd-metric-icon-v1077[\s\S]*width:\s*50px\s*!important[\s\S]*height:\s*50px\s*!important/);
  assert.match(sharedCss, /\.rd-metric-label-v1077[\s\S]*font-weight:\s*820\s*!important/);
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

test('APK identity advances with v10.64.17 web release', () => {
  assert.match(gradle, /versionCode\s+106419/);
  assert.match(gradle, /versionName\s+"10\.64\.17-mobile\.1"/);
  assert.match(workflow, /ANDROID_VERSION_NAME:\s*'10\.64\.17-mobile\.1'/);
  assert.match(workflow, /APP_VERSION_CODE:\s*'106419'/);
  assert.match(workflow, /WEB_VERSION:\s*'10\.64\.17'/);
  assert.match(workflow, /RELEASE_TAG:\s*'v10\.64\.17'/);
  assert.match(workflow, /AAB inesperado foi produzido/);
  assert.match(workflow, /if:\s*github\.ref == 'refs\/heads\/main'/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('public/css/android-mobile-hotfix.css', 'utf8');
const script = fs.readFileSync('scripts/apply-android-mobile-hotfix.mjs', 'utf8');
const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
const workflow = fs.readFileSync('.github/workflows/android-phase2d-direct-distribution.yml', 'utf8');

test('calendar mobile hotfix preserves seven columns and two-digit days', () => {
  assert.match(css, /grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)\s*!important/);
  assert.match(css, /\.day-num-value[\s\S]*white-space:\s*nowrap\s*!important/);
  assert.match(css, /\.calendar-primary-actions[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/);
});

test('retention metric icons remain prominent on mobile', () => {
  assert.match(css, /\.rd-metric-icon-v1077[\s\S]*width:\s*50px\s*!important/);
  assert.match(css, /\.rd-metric-icon-v1077[\s\S]*height:\s*50px\s*!important/);
  assert.match(css, /\.rd-metric-icon-v1077[\s\S]*font-size:\s*1\.32rem\s*!important/);
});

test('library list mode has a distinct compact grid on mobile', () => {
  assert.match(css, /#pdfLibraryGrid\.pdf-library-grid\.pdf-library-list-view \.pdf-library-card\s*\{[\s\S]*display:\s*grid\s*!important/);
  assert.match(css, /grid-template-areas:[\s\S]*"title actions"/);
  assert.match(css, /\.pdf-card-actions[\s\S]*flex-direction:\s*column\s*!important/);
});

test('native hotfix injects stylesheet and canonical web logo into Android launcher', () => {
  assert.match(script, /android-mobile-hotfix\.css/);
  assert.match(script, /public\/icon-512\.png/);
  assert.match(script, /estudo_adaptativo_launcher\.png/);
  assert.match(script, /android:icon=\\"@drawable\/estudo_adaptativo_launcher\\"/);
  assert.match(script, /android:roundIcon=\\"@drawable\/estudo_adaptativo_launcher\\"/);
});

test('APK hotfix increments Android identity without changing web release identity', () => {
  assert.match(gradle, /versionCode\s+106417/);
  assert.match(gradle, /versionName\s+"10\.64\.16-mobile\.1"/);
  assert.match(workflow, /APP_VERSION:\s*'10\.64\.16-mobile\.1'/);
  assert.match(workflow, /WEB_VERSION:\s*'10\.64\.16'/);
  assert.match(workflow, /AAB inesperado foi produzido/);
  assert.match(workflow, /if:\s*github\.ref == 'refs\/heads\/main'/);
});

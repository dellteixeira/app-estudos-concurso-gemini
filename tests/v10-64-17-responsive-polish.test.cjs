const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cssDir = path.join('public', 'css');
const responsiveFiles = fs.readdirSync(cssDir).filter((name) => /^responsive-polish-v\d+\.\d+\.\d+\.css$/.test(name));
assert.equal(responsiveFiles.length, 1, `expected one responsive polish stylesheet, found: ${responsiveFiles.join(', ')}`);

const css = fs.readFileSync(path.join(cssDir, responsiveFiles[0]), 'utf8');
const retention = fs.readFileSync(path.join(cssDir, 'components', 'retention.css'), 'utf8');
const nav = fs.readFileSync('public/js/ui/navigation.js', 'utf8');

test('flashcard action labels do not split on mobile', () => {
  assert.match(css, /#flashcardsWorkspace \.anki-folder-actions > span:last-child[\s\S]*white-space:\s*nowrap\s*!important/);
  assert.match(css, /#flashcardsWorkspace \.anki-folder-actions \.btn[\s\S]*font-size:\s*clamp\(/);
  assert.match(css, /#flashcardsWorkspace \.anki-folder-actions[\s\S]*grid-template-columns:/);
});

test('calendar month and year remain aligned in one row', () => {
  assert.match(css, /#calendarWorkspace \.calendar-month-selectors[\s\S]*grid-template-columns:\s*auto minmax\(0, 1\.12fr\) minmax\(0, \.88fr\)/);
  assert.match(css, /#calendarWorkspace \.calendar-month-selectors label[\s\S]*white-space:\s*nowrap\s*!important/);
  assert.match(css, /#calendarWorkspace \.calendar-month-selectors select[\s\S]*font-size:\s*clamp\(/);
});

test('retention actions are optically centered in the component owner', () => {
  assert.match(retention, /\.retention-study-now-v1072,[\s\S]*\.retention-export-btn[\s\S]*margin-inline:\s*auto\s*!important/);
  assert.match(retention, /\.retention-diagnostic-tools[\s\S]*justify-content:\s*center\s*!important/);
});

test('retention metrics remove decorative icons and keep compact balanced titles on all viewports', () => {
  assert.match(retention, /#retentionDiagnosticPanel \.rd-metric-icon-v1077[\s\S]*display:\s*none\s*!important/);
  assert.match(retention, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*font-size:\s*clamp\(\.76rem,\s*\.70rem \+ \.22vw,\s*\.86rem\)\s*!important/);
  assert.match(retention, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*font-weight:\s*760\s*!important/);
  assert.match(retention, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*text-wrap:\s*balance\s*!important/);
  assert.match(retention, /@media \(max-width: 700px\)[\s\S]*\.rd-metric-card-v1077[\s\S]*grid-template-rows:\s*minmax\(40px, auto\) minmax\(58px, 1fr\) 5px/);
  assert.match(retention, /@media \(max-width: 700px\)[\s\S]*\.rd-metric-label-v1077[\s\S]*max-inline-size:\s*100%\s*!important/);
});

test('responsive polish delegates retention and is loaded after canonical UI', () => {
  assert.match(css, /@import url\('\.\/components\/retention\.css'\)/);
  const canonicalIndex = nav.indexOf('canonical-ui.css');
  const polishIndex = nav.indexOf(responsiveFiles[0]);
  assert.ok(canonicalIndex >= 0);
  assert.ok(polishIndex > canonicalIndex);
  assert.match(nav, /data-responsive-polish|dataset\.responsivePolish/);
});

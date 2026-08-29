const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('public/css/responsive-polish-v10.64.17.css', 'utf8');
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

test('retention actions are optically centered', () => {
  assert.match(css, /\.retention-study-now-v1072,[\s\S]*\.retention-export-btn[\s\S]*margin-inline:\s*auto\s*!important/);
  assert.match(css, /\.retention-diagnostic-tools[\s\S]*justify-content:\s*center\s*!important/);
});

test('retention metrics remove decorative icons and elevate titles on all viewports', () => {
  assert.match(css, /#retentionDiagnosticPanel \.rd-metric-icon-v1077\s*\{[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*font-size:\s*clamp\(\.94rem/);
  assert.match(css, /#retentionDiagnosticPanel \.rd-metric-label-v1077[\s\S]*font-weight:\s*850\s*!important/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.rd-metric-card-v1077[\s\S]*grid-template-rows:\s*minmax\(42px, auto\) minmax\(62px, 1fr\) 5px/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.rd-metric-label-v1077[\s\S]*font-size:\s*clamp\(\.88rem/);
});

test('responsive polish stylesheet is loaded after canonical UI', () => {
  const canonicalIndex = nav.indexOf('canonical-ui.css');
  const polishIndex = nav.indexOf('responsive-polish-v10.64.17.css');
  assert.ok(canonicalIndex >= 0);
  assert.ok(polishIndex > canonicalIndex);
  assert.match(nav, /data-responsive-polish|dataset\.responsivePolish/);
});

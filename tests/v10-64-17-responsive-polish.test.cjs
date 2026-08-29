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

test('mobile retention keeps enlarged centered metric icons and readable labels', () => {
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.rd-metric-icon-v1077[\s\S]*display:\s*flex\s*!important/);
  assert.match(css, /\.rd-metric-icon-v1077[\s\S]*justify-self:\s*center\s*!important/);
  assert.match(css, /\.rd-metric-icon-v1077[\s\S]*width:\s*50px\s*!important[\s\S]*height:\s*50px\s*!important/);
  assert.match(css, /\.rd-metric-label-v1077[\s\S]*font-size:\s*clamp\(\.76rem/);
  assert.match(css, /\.rd-metric-label-v1077[\s\S]*font-weight:\s*820\s*!important/);
});

test('responsive polish stylesheet is loaded after canonical UI', () => {
  const canonicalIndex = nav.indexOf('canonical-ui.css');
  const polishIndex = nav.indexOf('responsive-polish-v10.64.17.css');
  assert.ok(canonicalIndex >= 0);
  assert.ok(polishIndex > canonicalIndex);
  assert.match(nav, /data-responsive-polish|dataset\.responsivePolish/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/css/responsive-system.css'), 'utf8');

test('phase 3 defines canonical responsive header layout', () => {
  assert.match(css, /RESPONSIVE DESIGN SYSTEM — PHASES 1–3/);
  assert.match(css, /header\.modern-header\s*\{/);
  assert.match(css, /grid-template-areas:\s*\n\s*"brand sync"\s*\n\s*"controls controls"/);
  assert.match(css, /header\.modern-header \.concurso-selector-bar/);
  assert.match(css, /header\.modern-header \.header-utility-cluster/);
  assert.match(css, /header\.modern-header \.header-account-actions/);
  assert.match(css, /header\.modern-header \.header-nav-tabs/);
});

test('phase 3 preserves canonical viewport bands and mobile touch targets', () => {
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /@media \(min-width: 601px\) and \(max-width: 900px\)/);
  assert.match(css, /@media \(min-width: 901px\) and \(max-width: 1200px\)/);
  assert.match(css, /@media \(min-width: 1201px\)/);
  assert.match(css, /min-height:\s*var\(--control-md\)/);
  assert.match(css, /scroll-snap-type:\s*x proximity/);
});

test('phase 3 makes the generic action bar adaptive without targeting PDF Library internals', () => {
  assert.match(css, /\.action-bar\s*\{/);
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, var\(--toolbar-item-min\)\), 1fr\)\)/);
  assert.match(css, /\.action-bar\.mobile-open/);
  assert.doesNotMatch(css, /\.pdf-library-actions/);
  assert.doesNotMatch(css, /\.pdf-library-filters/);
  assert.doesNotMatch(css, /\.pdf-reader-/);
});

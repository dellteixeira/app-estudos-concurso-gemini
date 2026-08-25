const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/css/responsive-system.css'), 'utf8');

test('phase 3 defines canonical responsive header layout with compact actions menu', () => {
  assert.match(css, /RESPONSIVE DESIGN SYSTEM — PHASES 1–3/);
  assert.match(css, /header\.modern-header\s*\{/);
  assert.match(css, /grid-template-areas:\s*\n\s*"brand sync tools"\s*\n\s*"controls controls controls"/);
  assert.match(css, /header\.modern-header \.concurso-selector-bar/);
  assert.match(css, /header\.modern-header \.header-utility-cluster/);
  assert.match(css, /header\.modern-header \.compact-actions-menu\s*\{[\s\S]*?grid-area:\s*tools/);
  assert.match(css, /header\.modern-header \.header-nav-tabs/);
  assert.doesNotMatch(css, /header\.modern-header \.header-account-actions/);
});

test('phase 3 preserves canonical viewport bands and mobile touch targets', () => {
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /@media \(min-width: 601px\) and \(max-width: 900px\)/);
  assert.match(css, /@media \(min-width: 901px\) and \(max-width: 1200px\)/);
  assert.match(css, /@media \(min-width: 1201px\)/);
  assert.match(css, /min-height:\s*var\(--control-md\)/);
  assert.match(css, /scroll-snap-type:\s*x proximity/);
});

test('phase 3 removes the retired generic action bar without targeting PDF Library internals', () => {
  assert.doesNotMatch(css, /\.action-bar\s*\{/);
  assert.doesNotMatch(css, /\.action-bar\.mobile-open/);
  assert.doesNotMatch(css, /\.mobile-tools-toggle/);
  assert.match(css, /header\.modern-header \.compact-actions-menu/);
  assert.doesNotMatch(css, /\.pdf-library-actions/);
  assert.doesNotMatch(css, /\.pdf-library-filters/);
  assert.doesNotMatch(css, /\.pdf-reader-/);
});

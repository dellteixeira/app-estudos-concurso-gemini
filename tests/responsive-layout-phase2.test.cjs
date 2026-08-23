const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/css/responsive-system.css'), 'utf8');

test('phase 2 defines fluid container and grid tokens', () => {
  for (const token of [
    '--content-reading-max:',
    '--grid-card-min:',
    '--grid-card-min-wide:',
    '--grid-metric-min:',
    '--toolbar-item-min:'
  ]) {
    assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('phase 2 makes dashboard overview and generic top grid intrinsic', () => {
  assert.match(css, /\.study-overview-grid\s*\{[\s\S]*?repeat\(auto-fit,[\s\S]*?var\(--grid-metric-min\)/);
  assert.match(css, /\.grid-top\s*\{[\s\S]*?repeat\(auto-fit,[\s\S]*?var\(--grid-card-min-wide\)/);
  assert.match(css, /#app-dashboard\s*\{[\s\S]*?width:\s*min\(100%,\s*var\(--content-max\)\)/);
});

test('phase 2 provides opt-in container-query and toolbar primitives', () => {
  assert.match(css, /\.responsive-region\s*\{[\s\S]*?container-type:\s*inline-size/);
  assert.match(css, /@container\s*\(max-width:\s*520px\)/);
  assert.match(css, /\.responsive-toolbar--grid\s*\{[\s\S]*?repeat\(auto-fit/);
  assert.match(css, /\.responsive-grid--wide/);
  assert.match(css, /\.responsive-grid--metrics/);
});

test('phase 2 keeps specialized PDF library layouts out of generic overrides', () => {
  assert.doesNotMatch(css, /\.pdf-library-actions\s*\{/);
  assert.doesNotMatch(css, /\.pdf-library-filters\s*\{/);
  assert.doesNotMatch(css, /\.pdf-reader/);
});

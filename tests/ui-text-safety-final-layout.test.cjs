const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/css/ui-text-safety.css'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'public/js/ui/navigation.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(css.includes('display: flex !important'), 'final header contract must use flex layout');
assert(css.includes('flex-wrap: nowrap !important'), 'header controls must stay on one row');
assert(css.includes('overflow-x: auto !important'), 'header needs safe horizontal fallback instead of stacking');
assert(css.includes('white-space: nowrap !important'), 'header button labels must stay inside one-line controls');
assert(css.includes('container-type: inline-size'), 'retention layout must respond to its own container');
assert(css.includes('container-name: retentionMetrics'), 'retention container must be named');
assert(css.includes('@container retentionMetrics (max-width: 760px)'), 'retention metrics must adapt at component width');
assert(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr)) !important'), 'narrow retention containers must use two columns');
assert(css.includes('flex-direction: column !important'), 'retention cards must stack icon and label vertically');
assert(css.includes('position: static !important'), 'legacy positioning must not pull labels beside icons');
assert(nav.includes('retention-metrics-fix.css?v=20260823-final'), 'retention stylesheet must be cache-busted');
assert(nav.includes('ui-text-safety.css?v=20260823-final'), 'final safety stylesheet must be cache-busted');
assert(nav.indexOf('retention-metrics-fix.css?v=20260823-final') < nav.indexOf('ui-text-safety.css?v=20260823-final'), 'safety stylesheet must load after retention stylesheet');
assert(sw.includes("'./css/ui-text-safety.css'"), 'final safety stylesheet must remain in critical offline shell');

console.log('UI final text/layout safety contract OK');

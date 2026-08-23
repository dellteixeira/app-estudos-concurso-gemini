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
assert(css.includes('grid-template-columns: repeat(4, minmax(0, 1fr)) !important'), 'desktop retention metrics must remain four-across');
assert(css.includes('grid-auto-rows: 142px !important'), 'desktop retention cards must stay compact');
assert(css.includes('height: 142px !important'), 'retention card height must remain bounded');
assert(css.includes('font-size: clamp(.54rem'), 'retention labels must use compact adaptive typography');
assert(css.includes('@media (max-width: 600px)'), 'retention layout must adapt only on real mobile viewport');
assert(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr)) !important'), 'mobile retention metrics must use two columns');
assert(css.includes('position: static !important'), 'legacy positioning must not pull labels beside icons');
assert(!css.includes('@container retentionMetrics'), 'desktop retention must not expand because of a narrow internal container');
assert(nav.includes('retention-metrics-fix.css?v=20260823-final3'), 'retention stylesheet must be cache-busted');
assert(nav.includes('ui-text-safety.css?v=20260823-final3'), 'final safety stylesheet must be cache-busted');
assert(nav.indexOf('retention-metrics-fix.css?v=20260823-final3') < nav.indexOf('ui-text-safety.css?v=20260823-final3'), 'safety stylesheet must load after retention stylesheet');
assert(sw.includes("'./css/ui-text-safety.css'"), 'final safety stylesheet must remain in critical offline shell');

console.log('UI final compact text/layout safety contract OK');

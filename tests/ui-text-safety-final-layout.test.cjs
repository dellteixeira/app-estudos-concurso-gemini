const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/css/canonical-ui.css'), 'utf8');
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
assert(css.includes('ACCESSIBILITY BASELINE'), 'accessibility contract must stay in canonical UI layer');
assert(!css.includes('@container retentionMetrics'), 'desktop retention must not expand because of a narrow internal container');
assert(nav.includes('canonical-ui.css?v=20260823-phase5'), 'canonical UI stylesheet must be cache-busted');
assert(nav.includes('data-canonical-ui') || nav.includes('dataset.canonicalUi'), 'canonical stylesheet needs a single-load guard');
assert(!nav.includes('retention-metrics-fix.css'), 'legacy retention stylesheet must not be loaded');
assert(!nav.includes('ui-text-safety.css'), 'legacy text-safety stylesheet must not be loaded');
assert(sw.includes("'./css/canonical-ui.css'"), 'canonical UI stylesheet must remain in critical offline shell');

console.log('UI canonical compact text/layout safety contract OK');

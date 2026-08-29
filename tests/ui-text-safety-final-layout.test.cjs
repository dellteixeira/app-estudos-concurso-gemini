const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/css/canonical-ui.css'), 'utf8');
const retention = fs.readFileSync(path.join(root, 'public/css/components/retention.css'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'public/js/ui/navigation.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(css.includes('display: flex !important'), 'final header contract must use flex layout');
assert(css.includes('flex-wrap: nowrap !important'), 'header controls must stay on one row');
assert(css.includes('overflow-x: auto !important'), 'header needs safe horizontal fallback instead of stacking');
assert(css.includes('white-space: nowrap !important'), 'header button labels must stay inside one-line controls');
assert(retention.includes('grid-template-columns: repeat(2, minmax(0, 1fr)) !important'), 'mobile retention metrics must use two columns');
assert(retention.includes('grid-auto-rows: minmax(166px, auto) !important'), 'mobile retention rows must reserve independent height');
assert(retention.includes('max-height: none !important'), 'retention cards must grow instead of clipping content');
assert(retention.includes('display: none !important'), 'retention decorative icons must remain hidden');
assert(retention.includes('font-size: clamp(.76rem, .70rem + .22vw, .86rem) !important'), 'retention labels must keep readable emphasized typography');
assert(retention.includes('font-weight: 760 !important'), 'retention labels must keep strong visual emphasis');
assert(retention.includes('@media (max-width: 700px)'), 'retention layout must adapt only on mobile viewport');
assert(retention.includes('max-inline-size: 100% !important'), 'mobile retention labels must stay within card width');
assert(retention.includes('overflow-wrap: break-word !important'), 'retention labels must wrap safely');
assert(retention.includes('box-sizing: border-box !important'), 'retention labels must include padding in width calculation');
assert(css.includes('ACCESSIBILITY BASELINE'), 'accessibility contract must stay in canonical UI layer');
assert(!css.includes('#retentionDiagnosticPanel'), 'canonical UI must not duplicate retention ownership');
assert(!retention.includes('@container retentionMetrics'), 'retention must not expand because of a narrow internal container');
assert(nav.includes('canonical-ui.css?v=20260823-phase5'), 'canonical UI stylesheet must be cache-busted');
assert(nav.includes('data-canonical-ui') || nav.includes('dataset.canonicalUi'), 'canonical stylesheet needs a single-load guard');
assert(!nav.includes('retention-metrics-fix.css'), 'legacy retention stylesheet must not be loaded');
assert(!nav.includes('ui-text-safety.css'), 'legacy text-safety stylesheet must not be loaded');
assert(sw.includes("'./css/canonical-ui.css'"), 'canonical UI stylesheet must remain in critical offline shell');

console.log('UI canonical iconless text/layout safety contract OK');

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/css/ui-text-safety.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'public/js/ui/navigation.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(html.includes('./css/retention-metrics-fix.css'), 'retention metrics stylesheet must be linked directly');
assert(html.includes('./css/ui-text-safety.css'), 'final text safety stylesheet must be linked directly');
assert(html.indexOf('./css/ui-text-safety.css') > html.indexOf('./css/retention-metrics-fix.css'), 'text safety stylesheet must load after retention metrics stylesheet');
assert(!nav.includes('ensureRetentionMetricLayoutStyle'), 'navigation must not dynamically inject layout styles');
assert(css.includes('flex-wrap: nowrap !important'), 'header actions must remain on one line');
assert(css.includes('overflow-x: auto'), 'header actions need safe horizontal overflow on very narrow screens');
assert(css.includes('container-type: inline-size'), 'retention layout must respond to its own container');
assert(css.includes('@container retentionMetrics'), 'retention cards must use container queries');
assert(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr)) !important'), 'narrow retention containers must become two columns');
assert(css.includes('flex-direction: column !important'), 'retention cards must stack icon and label vertically');

console.log('UI final text/layout safety contract OK');

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const critical = fs.readFileSync(path.join(root, 'public/js/critical-points-actions.js'), 'utf8');

test('cognitive profile updates do not trigger a full retention diagnostics rerender loop', () => {
  assert.doesNotMatch(
    critical,
    /addEventListener\(['"]app:cognitive-profile-updated['"],\s*rerenderDiagnostics\)/,
    'high-frequency cognitive profile events must never be wired directly to full diagnostics rerendering'
  );
});

test('MutationObserver only schedules enhancement of newly rendered cards', () => {
  assert.match(critical, /new MutationObserver\(\(\)=>scheduleEnhance\(\)\)/);
  assert.match(critical, /function scheduleEnhance\(delay=0\)[\s\S]*setTimeout\(enhanceAll,delay\)/);
  assert.doesNotMatch(critical, /new MutationObserver\([\s\S]{0,160}rerenderDiagnostics/);
});

test('explicit snooze remains allowed to rerender diagnostics', () => {
  assert.match(critical, /learning-advisor:snooze-changed['"],rerenderDiagnostics/);
  assert.match(critical, /function snooze\(topicId\)[\s\S]*rerenderDiagnostics\(\)/);
});

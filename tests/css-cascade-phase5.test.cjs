const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Fase 5 mantém uma única camada canônica de UI', () => {
  const navigation = read('public/js/ui/navigation.js');
  const sw = read('public/sw.js');
  const canonical = read('public/css/canonical-ui.css');

  assert.match(navigation, /canonical-ui\.css\?v=20260823-phase5/);
  assert.match(navigation, /data-canonical-ui|dataset\.canonicalUi/);
  assert.doesNotMatch(navigation, /retention-metrics-fix|ui-text-safety|accessibility-baseline/);

  assert.match(sw, /\.\/css\/canonical-ui\.css/);
  assert.doesNotMatch(sw, /retention-metrics-fix|ui-text-safety|accessibility-baseline/);

  assert.match(canonical, /RETENTION METRICS/);
  assert.match(canonical, /ACCESSIBILITY BASELINE/);
  assert.match(canonical, /btn-logout-header/);

  for (const legacy of [
    'public/css/retention-metrics-fix.css',
    'public/css/ui-text-safety.css',
    'public/css/accessibility-baseline.css'
  ]) {
    assert.equal(fs.existsSync(path.join(root, legacy)), false, `${legacy} não deve voltar ao repositório`);
  }
});

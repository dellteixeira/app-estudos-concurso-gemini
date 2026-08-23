const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('phase 4 CSS ownership audit passes', () => {
  const result = spawnSync(process.execPath, ['scripts/audit-css-ownership.cjs'], {
    cwd: root,
    encoding: 'utf8'
  });

  assert.equal(
    result.status,
    0,
    `CSS ownership audit failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
  );
  assert.match(result.stdout, /CSS ownership audit OK/);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/android-release.yml'), 'utf8');

test('Android Release só executa após Canonical GitHub Release', () => {
  assert.match(workflow, /workflow_run:\s*\n\s+workflows: \["Canonical GitHub Release"\]/);
  assert.match(workflow, /types: \[completed\]/);
  assert.match(workflow, /branches: \[main\]/);
  assert.doesNotMatch(workflow, /push:\s*\n\s+branches:/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
});

test('Android Release constrói a revisão canônica verificada', () => {
  assert.match(workflow, /ref: \$\{\{ github\.event_name == 'workflow_run' && github\.event\.workflow_run\.head_sha \|\| 'main' \}\}/);
  assert.match(workflow, /tag_sha="\$\(git rev-list -n 1 "\$RELEASE_TAG"\)"/);
  assert.match(workflow, /current_sha="\$\(git rev-parse HEAD\)"/);
  assert.match(workflow, /if \[ "\$tag_sha" != "\$current_sha" \]; then/);
});

test('Android Release não usa polling temporal para aguardar release', () => {
  assert.doesNotMatch(workflow, /for attempt in \{1\.\.20\}/);
  assert.doesNotMatch(workflow, /Aguardando release canônica/);
  assert.doesNotMatch(workflow, /sleep 15/);
  assert.match(workflow, /Release canônica \$RELEASE_TAG ausente/);
});

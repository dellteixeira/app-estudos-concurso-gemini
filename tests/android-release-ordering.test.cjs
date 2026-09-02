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
  assert.match(workflow, /ref: \$\{\{ github\.event_name == 'workflow_run' && github\.event\.workflow_run\.head_sha \|\| inputs\.release_tag \}\}/);
  assert.doesNotMatch(workflow, /\|\| 'main'/);
  assert.match(workflow, /tag_sha="\$\(git rev-list -n 1 "\$RELEASE_TAG"\)"/);
  assert.match(workflow, /current_sha="\$\(git rev-parse HEAD\)"/);
  assert.match(workflow, /if \[ "\$tag_sha" != "\$current_sha" \]; then/);
});

test('Backfill manual exige tag canônica explícita', () => {
  assert.match(workflow, /workflow_dispatch:\s*\n\s+inputs:\s*\n\s+release_tag:/);
  assert.match(workflow, /release_tag:[\s\S]*required:\s*true/);
  assert.match(workflow, /release_tag:[\s\S]*type:\s*string/);
});

test('Mismatch de tag em workflow automático é no-op, mas manual continua estrito', () => {
  assert.match(workflow, /if \[ "\$GITHUB_EVENT_NAME" = "workflow_run" \]; then/);
  assert.match(workflow, /Nenhum asset será publicado porque não houve nova versão canônica/);
  assert.match(workflow, /echo "::error::Tag canônica \$RELEASE_TAG aponta para \$tag_sha, mas o APK foi construído de \$current_sha\."/);
  assert.match(workflow, /if \[ "\$tag_sha" != "\$current_sha" \]; then[\s\S]*workflow_run[\s\S]*exit 0[\s\S]*::error::Tag canônica[\s\S]*exit 1/);
});

test('Manifesto registra o SHA realmente construído', () => {
  assert.match(workflow, /SOURCE_COMMIT="\$\(git rev-parse HEAD\)"/);
  assert.match(workflow, /"sourceCommit": "\$\{SOURCE_COMMIT\}"/);
  assert.doesNotMatch(workflow, /"sourceCommit": "\$\{GITHUB_SHA\}"/);
});

test('Android Release não usa polling temporal para aguardar release', () => {
  assert.doesNotMatch(workflow, /for attempt in \{1\.\.20\}/);
  assert.doesNotMatch(workflow, /Aguardando release canônica/);
  assert.doesNotMatch(workflow, /sleep 15/);
  assert.match(workflow, /Release canônica \$RELEASE_TAG ausente/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowDir = '.github/workflows';
const workflowNames = fs.readdirSync(workflowDir).filter(name => /\.ya?ml$/i.test(name));
const canonicalRelease = fs.readFileSync(path.join(workflowDir, 'canonical-release.yml'), 'utf8');

test('release orchestration has no version-specific bump workflow', () => {
  const versionSpecific = workflowNames.filter(name => /^release-v\d+\.\d+\.\d+.*\.ya?ml$/i.test(name));
  assert.deepEqual(versionSpecific, []);
});

test('no workflow mutates source files and pushes a prepared release branch', () => {
  for (const name of workflowNames) {
    const workflow = fs.readFileSync(path.join(workflowDir, name), 'utf8');
    assert.doesNotMatch(workflow, /git\s+push\s+origin\s+HEAD:release\//, `${name} ainda prepara release por mutação/push`);
  }
});

test('canonical GitHub Release derives identity from release contract', () => {
  assert.match(canonicalRelease, /node scripts\/release-contract\.mjs github/);
  assert.match(canonicalRelease, /node scripts\/release-contract\.mjs check/);
  assert.match(canonicalRelease, /version="\$WEB_VERSION"/);
  assert.match(canonicalRelease, /tag="\$RELEASE_TAG"/);
  assert.doesNotMatch(canonicalRelease, /require\('\.\/package\.json'\)\.version/);
  assert.doesNotMatch(canonicalRelease, /const APP_VERSION/);
});

test('canonical web tag ignores Android-only revision drift', () => {
  assert.match(canonicalRelease, /web_runtime_paths=\(package\.json public src wrangler\.jsonc config\)/);
  assert.match(canonicalRelease, /web_runtime_excludes=\('\:\(exclude\)config\/release-contract\.json'\)/);
  assert.doesNotMatch(canonicalRelease, /runtime_paths=.*android\/app\/build\.gradle/);
  assert.match(canonicalRelease, /diferenças Android\/operacionais/);
});

test('canonical tag stays immutable when web runtime differs', () => {
  assert.match(canonicalRelease, /A tag \$RELEASE_TAG já existe/);
  assert.match(canonicalRelease, /A tag não será movida/);
  assert.match(canonicalRelease, /git tag -a "\$RELEASE_TAG" "\$RELEASE_SHA"/);
  assert.doesNotMatch(canonicalRelease, /git\s+tag\s+-f/);
  assert.doesNotMatch(canonicalRelease, /git\s+push[^\n]*--force[^\n]*refs\/tags/);
});

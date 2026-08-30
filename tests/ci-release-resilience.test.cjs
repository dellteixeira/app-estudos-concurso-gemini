const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const quality=fs.readFileSync('.github/workflows/quality-check.yml','utf8');
const android=fs.readFileSync('.github/workflows/android-ci.yml','utf8');
const androidRelease=fs.readFileSync('.github/workflows/android-release.yml','utf8');
const canonicalRelease=fs.readFileSync('.github/workflows/canonical-release.yml','utf8');
const secrets=fs.readFileSync('.github/workflows/security-secrets-audit.yml','utf8');
const history=fs.readFileSync('.github/workflows/security-history-audit.yml','utf8');
const deploy=fs.readFileSync('.github/workflows/cloudflare-production-deploy.yml','utf8');
const mirror=fs.readFileSync('.github/workflows/mirror-gitlab.yml','utf8');
const gitlab=fs.readFileSync('.gitlab-ci.yml','utf8');
const runbook=fs.readFileSync('docs/ci-resilience-runbook.md','utf8');
const retry=fs.readFileSync('scripts/ci-retry.mjs','utf8');

test('workflows não fixam o runner ubuntu-24.04',()=>{
  for(const source of [quality,android,androidRelease,canonicalRelease,secrets,history,deploy,mirror])assert.doesNotMatch(source,/runs-on: ubuntu-24\.04/);
  for(const source of [quality,android,androidRelease,canonicalRelease,secrets,history,deploy,mirror])assert.match(source,/runs-on: ubuntu-latest/);
});

test('modo degradado não dispara hosted runners em pull request',()=>{
  assert.doesNotMatch(quality,/\npull_request:/);
  assert.doesNotMatch(secrets,/\npull_request:/);
  assert.doesNotMatch(android,/\npull_request:/);
  assert.match(quality,/push:\n\s+branches: \[main\]/);
  assert.match(quality,/workflow_dispatch:/);
  assert.match(secrets,/push:\n\s+branches: \[main\]/);
  assert.match(secrets,/workflow_dispatch:/);
  assert.match(android,/workflow_dispatch:/);
});

test('retentativas são restritas a dependências e builds transitórios',()=>{
  assert.match(retry,/tentativa \$\{attempt\}\/\$\{attempts\}/);
  assert.match(quality,/ci-retry\.mjs[^\n]*npm install/);
  assert.match(android,/ci-retry\.mjs[^\n]*npm ci/);
  assert.match(android,/ci-retry\.mjs[^\n]*gradlew/);
  assert.match(androidRelease,/ci-retry\.mjs[^\n]*npm ci/);
  assert.match(androidRelease,/ci-retry\.mjs[^\n]*gradlew/);
  assert.doesNotMatch(quality,/ci-retry\.mjs[^\n]*npm test/);
  assert.doesNotMatch(quality,/ci-retry\.mjs[^\n]*npm run audit/);
});

test('Quality da main mantém cobertura completa de navegadores',()=>{
  assert.match(quality,/install chromium firefox webkit/);
  assert.match(quality,/npm run test:browser/);
  assert.doesNotMatch(quality,/--project=chromium/);
});

test('audit completo de histórico permanece semanal/manual',()=>{
  assert.doesNotMatch(history,/pull_request:/);
  assert.match(history,/workflow_dispatch:/);
  assert.match(history,/cron:/);
});

test('Android Check em modo degradado é somente manual e completo',()=>{
  assert.match(android,/workflow_dispatch:/);
  assert.doesNotMatch(android,/pull_request:/);
  assert.match(android,/connectedDebugAndroidTest/);
  assert.match(android,/assembleDebug/);
  assert.match(android,/FATAL EXCEPTION/);
});

test('Android Release só dispara para identidade/toolchain e exige runtime web canônico',()=>{
  assert.doesNotMatch(androidRelease,/- 'public\/\*\*'/);
  assert.doesNotMatch(androidRelease,/- 'src\/\*\*'/);
  assert.doesNotMatch(androidRelease,/- 'tests\/\*\*'/);
  assert.match(androidRelease,/- 'config\/release-contract\.json'/);
  assert.match(androidRelease,/Verify embedded web runtime is canonical/);
  assert.match(androidRelease,/git diff --quiet \"\$RELEASE_TAG\" HEAD/);
  assert.match(androidRelease,/Release Android bloqueada: runtime web embutido difere/);
});

test('produção só segue automaticamente após Quality Check bem-sucedido',()=>{
  assert.match(deploy,/workflows: \["Quality Check"\]/);
  assert.match(deploy,/github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(deploy,/github\.event\.workflow_run\.head_branch == 'main'/);
});

test('deploy manual também revalida testes e auditoria antes do wrangler',()=>{
  const testIndex=deploy.indexOf('npm test');
  const auditIndex=deploy.indexOf('npm run audit');
  const deployIndex=deploy.indexOf('wrangler@4.120.0 deploy');
  assert.ok(testIndex>=0&&auditIndex>testIndex&&deployIndex>auditIndex);
});

test('produção valida identidade exata e estabilidade após deploy',()=>{
  assert.match(deploy,/EXPECTED_SHA/);
  assert.match(deploy,/EXPECTED_BUILD/);
  assert.match(deploy,/DEPLOY_COMMIT_SHA/);
  assert.match(deploy,/Stability re-check/);
});

test('deploy obsoleto é cancelado antes de publicar e falhas pós-deploy ainda fazem rollback',()=>{
  assert.match(deploy,/cancel-in-progress: true/);
  assert.match(deploy,/id: deploy/);
  assert.match(deploy,/if: failure\(\) && steps\.deploy\.outcome == 'success'/);
  assert.match(deploy,/wrangler@4\.120\.0 rollback --message/);
});

test('release canônica manual só opera sobre o SHA realmente publicado',()=>{
  assert.match(canonicalRelease,/Verify manual release matches live production/);
  assert.match(canonicalRelease,/version\.json\?canonical-release=/);
  assert.match(canonicalRelease,/live_commit/);
  assert.match(canonicalRelease,/EXPECTED_SHA/);
  assert.match(canonicalRelease,/Release manual bloqueada: HEAD não corresponde à revisão atualmente publicada/);
});

test('GitLab oferece CI alternativo para indisponibilidade do GitHub Actions',()=>{
  assert.match(gitlab,/image: node:22\.23\.2-bookworm/);
  assert.match(gitlab,/node --check src\/index\.js/);
  assert.match(gitlab,/npm test/);
  assert.match(gitlab,/AUDIT_ALLOW_ANY_ROOT=1 npm run audit/);
  assert.match(gitlab,/node scripts\/audit-secrets\.mjs/);
});

test('mirror GitLab não consome runner em toda branch de feature',()=>{
  assert.match(mirror,/branches: \[main\]/);
  assert.match(mirror,/tags:/);
  assert.match(mirror,/- 'v\*'/);
  assert.doesNotMatch(mirror,/\n  delete:/);
  assert.match(mirror,/workflow_dispatch:/);
});

test('runbook documenta falha sem steps e failover independente',()=>{
  assert.match(runbook,/steps: \[\]/);
  assert.match(runbook,/steps: null/);
  assert.match(runbook,/GitLab CI/);
  assert.match(runbook,/Pull/);
  assert.match(runbook,/wrangler rollback/);
  assert.match(runbook,/CI externo indisponível != app quebrado/);
});

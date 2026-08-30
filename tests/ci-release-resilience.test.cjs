const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const quality=fs.readFileSync('.github/workflows/quality-check.yml','utf8');
const android=fs.readFileSync('.github/workflows/android-ci.yml','utf8');
const secrets=fs.readFileSync('.github/workflows/security-secrets-audit.yml','utf8');
const history=fs.readFileSync('.github/workflows/security-history-audit.yml','utf8');
const deploy=fs.readFileSync('.github/workflows/cloudflare-production-deploy.yml','utf8');
const retry=fs.readFileSync('scripts/ci-retry.mjs','utf8');

test('gates diversificam pools e não fixam ubuntu-24.04',()=>{
  for(const source of [quality,android,secrets,history,deploy])assert.doesNotMatch(source,/runs-on: ubuntu-24\.04/);
  assert.match(quality,/runs-on: macos-latest/);
  assert.match(quality,/runs-on: ubuntu-latest/);
  assert.match(android,/runs-on: ubuntu-latest/);
  assert.match(secrets,/runs-on: macos-latest/);
  assert.match(history,/runs-on: macos-latest/);
  assert.match(deploy,/runs-on: macos-latest/);
});

test('retentativas são restritas a dependências e builds transitórios',()=>{
  assert.match(retry,/tentativa \$\{attempt\}\/\$\{attempts\}/);
  assert.match(quality,/ci-retry\.mjs[^\n]*npm install/);
  assert.match(android,/ci-retry\.mjs[^\n]*npm ci/);
  assert.match(android,/ci-retry\.mjs[^\n]*gradlew/);
  assert.doesNotMatch(quality,/ci-retry\.mjs[^\n]*npm test/);
  assert.doesNotMatch(quality,/ci-retry\.mjs[^\n]*npm run audit/);
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

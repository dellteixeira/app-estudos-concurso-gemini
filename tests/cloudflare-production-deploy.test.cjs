const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const workflow = fs.readFileSync('.github/workflows/cloudflare-production-deploy.yml', 'utf8');

test('deploy do Cloudflare só ocorre após Quality Check verde da main ou execução manual', () => {
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \["Quality Check"\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.doesNotMatch(workflow, /\npull_request:/);
});

test('workflow publica exatamente a revisão validada com Wrangler pinado', () => {
  assert.match(workflow, /workflow_run\.head_sha/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /npx --yes wrangler@4\.120\.0 deploy/);
  assert.doesNotMatch(workflow, /cloudflare\/wrangler-action@v3/);
});

test('workflow injeta e valida identidade exata de versão SHA e build em produção', () => {
  assert.match(workflow, /Validate release version consistency/);
  assert.match(workflow, /manifest\.commit = sha/);
  assert.match(workflow, /manifest\.build = buildId/);
  assert.match(workflow, /DEPLOY_COMMIT_SHA/);
  assert.match(workflow, /remote_commit/);
  assert.match(workflow, /remote_build/);
  assert.match(workflow, /\[ "\$remote_commit" = "\$expected_sha" \]/);
  assert.match(workflow, /\[ "\$remote_build" = "\$expected_build" \]/);
  assert.match(workflow, /Stability re-check/);
});

test('deploys antigos são cancelados quando uma revisão mais nova precisa ser publicada', () => {
  assert.match(workflow, /group: cloudflare-production-verify/);
  assert.match(workflow, /cancel-in-progress: true/);
});

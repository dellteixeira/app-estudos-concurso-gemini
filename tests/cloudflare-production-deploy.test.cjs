const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const workflow = fs.readFileSync('.github/workflows/cloudflare-production-deploy.yml', 'utf8');

test('verificação do Cloudflare só ocorre após Quality Check verde da main ou execução manual', () => {
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \["Quality Check"\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.doesNotMatch(workflow, /\npull_request:/);
});

test('verificação usa exatamente a revisão validada sem segundo deploy via Wrangler', () => {
  assert.match(workflow, /workflow_run\.head_sha/);
  assert.doesNotMatch(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(workflow, /cloudflare\/wrangler-action@v3/);
  assert.doesNotMatch(workflow, /command: deploy/);
});

test('workflow valida consistência local e aguarda a versão nativa em produção', () => {
  assert.match(workflow, /Validate release version consistency/);
  assert.match(workflow, /public\/version\.json/);
  assert.match(workflow, /src\/index\.js/);
  assert.match(workflow, /public\/sw\.js/);
  assert.match(workflow, /Wait for native Cloudflare deployment and verify production/);
  assert.match(workflow, /version\.json\?verify=/);
  assert.match(workflow, /Service Worker version does not match production release/);
});

test('verificações antigas são canceladas quando uma revisão mais nova precisa ser confirmada', () => {
  assert.match(workflow, /group: cloudflare-production-verify/);
  assert.match(workflow, /cancel-in-progress: true/);
});

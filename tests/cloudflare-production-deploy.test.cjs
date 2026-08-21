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

test('deploy usa exatamente a revisão validada e credenciais protegidas', () => {
  assert.match(workflow, /workflow_run\.head_sha/);
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /cloudflare\/wrangler-action@v3/);
  assert.match(workflow, /command: deploy/);
});

test('deploy valida consistência de versão antes e depois da publicação', () => {
  assert.match(workflow, /Validate release version consistency/);
  assert.match(workflow, /public\/version\.json/);
  assert.match(workflow, /src\/index\.js/);
  assert.match(workflow, /public\/sw\.js/);
  assert.match(workflow, /Verify deployed version/);
  assert.match(workflow, /version\.json\?deploy=/);
  assert.match(workflow, /Service Worker version does not match deployed release/);
});

test('deploy serializa produção para evitar corrida entre versões', () => {
  assert.match(workflow, /group: cloudflare-production/);
  assert.match(workflow, /cancel-in-progress: false/);
});

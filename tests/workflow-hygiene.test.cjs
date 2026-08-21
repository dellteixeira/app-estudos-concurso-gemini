const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const workflowsDir='.github/workflows';
const cloudflarePath=path.join(workflowsDir,'cloudflare-production-deploy.yml');

test('repository has no temporary workflows committed',()=>{
  const files=fs.readdirSync(workflowsDir);
  assert.deepEqual(files.filter(name=>/^temp-/i.test(name)),[]);
});

test('Cloudflare workflow verifies native deploy instead of redeploying with Wrangler',()=>{
  const workflow=fs.readFileSync(cloudflarePath,'utf8');
  assert.match(workflow,/name: Cloudflare Production Verify/);
  assert.match(workflow,/workflow_run:/);
  assert.match(workflow,/Wait for native Cloudflare deployment and verify production/);
  assert.match(workflow,/version\.json\?verify=/);
  assert.match(workflow,/sw\.js\?verify=/);
  assert.doesNotMatch(workflow,/cloudflare\/wrangler-action/);
  assert.doesNotMatch(workflow,/CLOUDFLARE_API_TOKEN/);
});

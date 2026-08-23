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

test('Cloudflare workflow deploys the validated SHA and verifies exact production identity',()=>{
  const workflow=fs.readFileSync(cloudflarePath,'utf8');
  assert.match(workflow,/name: Cloudflare Production Verify/);
  assert.match(workflow,/workflow_run:/);
  assert.match(workflow,/git rev-parse HEAD/);
  assert.match(workflow,/npx --yes wrangler@4\.120\.0 deploy/);
  assert.match(workflow,/CLOUDFLARE_API_TOKEN/);
  assert.match(workflow,/version\.json\?verify=/);
  assert.match(workflow,/sw\.js\?verify=/);
  assert.match(workflow,/remote_commit/);
  assert.match(workflow,/remote_build/);
  assert.match(workflow,/Stability re-check/);
  assert.doesNotMatch(workflow,/cloudflare\/wrangler-action/);
});

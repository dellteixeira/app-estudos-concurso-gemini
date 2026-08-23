const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/cloudflare-production-deploy.yml'), 'utf8');
const version = JSON.parse(fs.readFileSync(path.join(root, 'public/version.json'), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(Object.prototype.hasOwnProperty.call(version, 'commit'), 'version.json must declare a source commit marker');
assert(version.commit === 'source', 'repository version.json must remain a source template, not a stale deployed SHA');
assert(workflow.includes('npx --yes wrangler@4.120.0 deploy'), 'production deployment must use pinned Wrangler 4.120.0');
assert(workflow.includes('git rev-parse HEAD'), 'workflow must derive the exact validated SHA from checkout');
assert(workflow.includes('DEPLOY_SHA'), 'workflow must propagate the exact commit SHA');
assert(workflow.includes('manifest.commit = sha'), 'workflow must inject the exact SHA into version.json');
assert(workflow.includes('// DEPLOY_COMMIT_SHA:'), 'workflow must stamp the Service Worker with the exact SHA');
assert(workflow.includes('remote_commit'), 'production verification must read the remote commit identity');
assert(workflow.includes('[ "$remote_commit" = "$expected_sha" ]'), 'production verification must compare the exact SHA');
assert(workflow.includes('EXPECTED_BUILD'), 'production verification must compare a unique build identity');
assert(workflow.includes('Stability re-check'), 'workflow must re-check production after initial success');
assert(workflow.includes('CLOUDFLARE_API_TOKEN'), 'deployment must require an explicit Cloudflare API token');
assert(workflow.includes('CLOUDFLARE_ACCOUNT_ID'), 'deployment must require an explicit Cloudflare account id');

console.log('Exact production deploy identity contract OK');

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/backup-supabase.yml'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(workflow.includes('BACKUP_ENCRYPTION_PASSPHRASE'), 'backup must require a dedicated encryption secret');
assert(workflow.includes('--cipher-algo AES256'), 'backup must use AES-256 symmetric encryption');
assert(workflow.includes('--s2k-digest-algo SHA512'), 'backup KDF must use SHA-512');
assert(workflow.includes('rm -rf backups'), 'plaintext backup directory must be destroyed after encryption');
assert(workflow.includes("-name '*.sql'"), 'workflow must assert that plaintext SQL dumps do not survive');
assert(workflow.includes('R2_BACKUP_ACCOUNT_ID'), 'backup must support a private R2 account destination');
assert(workflow.includes('R2_BACKUP_ACCESS_KEY_ID'), 'backup must use a dedicated R2 access key');
assert(workflow.includes('R2_BACKUP_SECRET_ACCESS_KEY'), 'backup must use a dedicated R2 secret key');
assert(workflow.includes('R2_BACKUP_BUCKET'), 'backup must use a dedicated private R2 bucket');
assert(workflow.includes('r2.cloudflarestorage.com'), 'backup must target Cloudflare R2 directly');
assert(workflow.includes('aws s3api head-object'), 'external upload must be verified after transfer');
assert(workflow.includes('retention-days: 7'), 'GitHub contingency artifact retention must stay short');
assert(workflow.includes('encrypted-supabase-backup-'), 'GitHub contingency artifact must be explicitly encrypted');
assert(!/path:\s*supabase-backup-\$\{\{ github\.run_id \}\}\.tar\.gz/.test(workflow), 'plaintext tarball must never be uploaded as an artifact');

console.log('Encrypted external backup security contract OK');

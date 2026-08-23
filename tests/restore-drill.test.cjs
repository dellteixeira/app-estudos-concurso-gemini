const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const workflow = fs.readFileSync('.github/workflows/restore-drill.yml', 'utf8');
const backup = fs.readFileSync('.github/workflows/backup-supabase.yml', 'utf8');

test('Fase 10 executa restore-readiness mensal e manual sem tocar produção', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cron:\s*["']0 8 1 \* \*["']/);
  assert.match(workflow, /runs-on:\s*ubuntu-24\.04/);

  for (const secret of [
    'BACKUP_ENCRYPTION_PASSPHRASE',
    'R2_BACKUP_ACCOUNT_ID',
    'R2_BACKUP_ACCESS_KEY_ID',
    'R2_BACKUP_SECRET_ACCESS_KEY',
    'R2_BACKUP_BUCKET'
  ]) {
    assert.match(workflow, new RegExp(secret));
  }

  assert.doesNotMatch(workflow, /SUPABASE_DB_URL/);
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(workflow, /supabase\s+db\s+push/i);
  assert.doesNotMatch(workflow, /\bpsql\b/i);
});

test('restore-readiness verifica criptografia integridade externa e conteúdo interno', () => {
  assert.match(workflow, /\.tar\.gz\.gpg/);
  assert.match(workflow, /sha256sum restore-drill\/backup\.gpg/);
  assert.match(workflow, /gpg --batch --yes/);
  assert.match(workflow, /--decrypt restore-drill\/backup\.gpg/);
  assert.match(workflow, /sha256sum -c/);
  assert.match(workflow, /backups\/database\/roles\.sql/);
  assert.match(workflow, /backups\/database\/schema\.sql/);
  assert.match(workflow, /backups\/database\/data\.sql/);
  assert.match(workflow, /backups\/manifest\.sha256/);
  assert.match(workflow, /restore_payload=readable/);
  assert.match(workflow, /production_database_mutated=false/);
});

test('drill apaga payload antes de publicar somente relatório', () => {
  const cleanup = workflow.indexOf('Cleanup all downloaded and decrypted backup material');
  const upload = workflow.indexOf('Upload report only');
  assert.ok(cleanup >= 0 && upload > cleanup, 'cleanup deve ocorrer antes do artifact');
  assert.match(workflow, /rm -rf restore-drill/);
  assert.match(workflow, /path:\s*safe-report\/restore-drill-report\.txt/);
  assert.doesNotMatch(workflow, /path:\s*restore-drill\//);
  assert.match(workflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
});

test('novos backups não criam manifesto autorreferente', () => {
  assert.match(backup, /find backups -type f ! -name 'manifest\.sha256'/);
});

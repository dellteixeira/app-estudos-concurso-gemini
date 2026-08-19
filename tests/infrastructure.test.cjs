const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('backup Supabase preserva banco e está preparado para Storage privado', () => {
  const workflow = read('.github/workflows/backup-supabase.yml');
  assert.match(workflow, /supabase db dump/);
  assert.match(workflow, /scripts\/backup-supabase-storage\.mjs/);
  assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(workflow, /manifest\.sha256/);
});

test('baseline não inventa schema remoto e possui capturador verificável', () => {
  const contract = JSON.parse(read('supabase/baseline/runtime-contract.json'));
  assert.deepEqual(contract.direct_public_tables, ['edital','flashcards','user_settings','study_workspaces','pdf_documents','pdf_progress','pdf_document_links']);
  assert.ok(contract.known_rpc.includes('delete_my_study_data'));
  assert.deepEqual(contract.private_storage_buckets, ['study-pdfs']);
  const capture = read('scripts/capture-supabase-baseline.sh');
  assert.match(capture, /SUPABASE_DB_URL/);
  assert.match(capture, /supabase db dump/);
  assert.match(capture, /manifest\.sha256/);
});

test('RPC versionada de exclusão usa auth.uid e cobre tabelas conhecidas', () => {
  const sql = read('supabase/migrations/20260818_harden_delete_my_study_data.sql');
  assert.match(sql, /auth\.uid\(\)/);
  for (const table of ['edital','flashcards','user_flashcards','user_notes','user_schedules','user_settings']) {
    assert.match(sql, new RegExp(`'${table}'`));
  }
  assert.match(sql, /security invoker/i);
  assert.match(sql, /grant execute .* authenticated/i);
});

test('exclusão de conta prepara limpeza do bucket study-pdfs antes do auth.users', () => {
  const fn = read('supabase/functions/delete-account/index.ts');
  const storagePos = fn.indexOf("removeStoragePrefix(adminClient, 'study-pdfs', user.id)");
  const rpcPos = fn.indexOf("userClient.rpc('delete_my_study_data')");
  const authPos = fn.indexOf('adminClient.auth.admin.deleteUser');
  assert.ok(storagePos >= 0 && rpcPos > storagePos && authPos > rpcPos);
  assert.match(fn, /ACCOUNT_STORAGE_DELETE_FAILED/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const foundation = read('supabase/migrations/20260818210000_create_pdf_foundation.sql');
const deleteExtension = read('supabase/migrations/20260818210100_extend_delete_my_study_data_for_pdf.sql');

test('fundação PDF cria Workspaces, documentos e progresso com RLS', () => {
  for (const table of ['study_workspaces', 'pdf_documents', 'pdf_progress']) {
    assert.match(foundation, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(foundation, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(foundation, /auth\.uid\(\) = user_id/);
  assert.match(foundation, /workspace_id is null[\s\S]*study_workspaces/);
  assert.match(foundation, /pdf_id[\s\S]*pdf_documents/);
});

test('bucket study-pdfs é privado, limitado a PDF e 100 MiB', () => {
  assert.match(foundation, /values \('study-pdfs', 'study-pdfs', false, 104857600/);
  assert.match(foundation, /allowed_mime_types/);
  assert.match(foundation, /application\/pdf/);
  for (const action of ['select', 'insert', 'update', 'delete']) {
    assert.match(foundation, new RegExp(`study_pdfs_${action}_own`));
  }
  assert.match(foundation, /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
});

test('metadados impõem limites e evitam caminhos duplicados por usuário', () => {
  assert.match(foundation, /file_size > 0 and file_size <= 104857600/);
  assert.match(foundation, /mime_type = 'application\/pdf'/);
  assert.match(foundation, /pdf_documents_user_storage_path_uidx/);
  assert.match(foundation, /pdf_progress_user_pdf_unique/);
});

test('exclusão de dados cobre fundação PDF na ordem correta', () => {
  const progress = deleteExtension.indexOf("'pdf_progress'");
  const documents = deleteExtension.indexOf("'pdf_documents'");
  const workspaces = deleteExtension.indexOf("'study_workspaces'");
  assert.ok(progress >= 0 && documents > progress && workspaces > documents);
  assert.match(deleteExtension, /auth\.uid\(\)/);
  assert.match(deleteExtension, /security invoker/i);
});

test('serviços JS de fundação são privados, limitam PDF e constroem caminho por user_id', () => {
  const core = read('public/js/pdf/pdf-core.js');
  const workspaces = read('public/js/pdf/pdf-workspaces.js');
  assert.match(core, /MAX_PDF_BYTES = 100 \* 1024 \* 1024/);
  assert.match(core, /application\/pdf/);
  assert.match(core, /return `\$\{userId\}\/\$\{workspaceSegment\}\/\$\{pdfId\}\/original\.pdf`/);
  assert.match(workspaces, /from\('study_workspaces'\)/);
  assert.match(workspaces, /\.eq\('user_id', user\.id\)/);
});

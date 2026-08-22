const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('supabase/migrations/20260822013000_add_pdf_manual_order.sql');
const library = read('public/js/pdf/pdf-library.js');
const ordering = read('public/js/pdf/pdf-library-ordering.js');
const core = read('public/js/pdf/pdf-core.js');
const sw = read('public/sw.js');

test('ordem manual de PDFs é persistida com isolamento por usuário', () => {
  assert.match(migration, /add column if not exists sort_order bigint/i);
  assert.match(migration, /assign_pdf_document_sort_order/i);
  assert.match(migration, /before insert on public\.pdf_documents/i);
  assert.match(migration, /reorder_my_pdf_documents\(p_order uuid\[\]\)/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /v_user uuid := auth\.uid\(\)/i);
  assert.match(migration, /d\.user_id = v_user/i);
  assert.match(migration, /count\(distinct value\)/i);
  assert.doesNotMatch(migration, /set sort_order = ordered\.position,\s*updated_at/i);
});

test('Biblioteca usa sort_order como ordem canônica e persiste subconjunto visível', () => {
  assert.match(library, /is_favorite,sort_order,created_at/);
  assert.match(library, /order\('sort_order',\{ascending:true,nullsFirst:false\}\)/);
  assert.match(library, /persistVisibleOrder/);
  assert.match(library, /rpc\('reorder_my_pdf_documents',\{p_order:merged\}\)/);
  assert.match(library, /visibleSet/);
  assert.match(library, /pdf-library-ordering\.js/);
});

test('atalho oferece ordem manual numérica e alfabética', () => {
  for (const mode of ['manual','number-asc','number-desc','alpha-asc','alpha-desc']) {
    assert.ok(ordering.includes(mode), `modo ausente: ${mode}`);
  }
  assert.match(ordering, /Intl\.Collator\('pt-BR'/);
  assert.match(ordering, /match\(\/\^\\s\*\(\\d\+/);
  assert.match(ordering, /Numérica ↑/);
  assert.match(ordering, /A–Z/);
  assert.match(ordering, /Ordenar/);
});

test('arrastar PDF troca a ordem canônica para manual e salva', () => {
  assert.match(ordering, /addEventListener\('dragstart'/);
  assert.match(ordering, /addEventListener\('dragover'/);
  assert.match(ordering, /addEventListener\('drop'/);
  assert.match(ordering, /setMode\('manual'\)/);
  assert.match(ordering, /schedulePersist\(100\)/);
  assert.match(ordering, /persistVisibleOrder\(order\)/);
});

test('título do PDF vira atalho para abrir e botão Visualizar é removido da interface renderizada', () => {
  assert.match(ordering, /pdf-card-title-link/);
  assert.match(ordering, /PdfStudyLibraryUI\?\.openDocument/);
  assert.match(ordering, /Visualizar\\s\*\$\/i);
  assert.match(ordering, /visual\?\.remove\(\)/);
  assert.match(ordering, /:hover/);
});

test('abertura do PDF repete falhas transitórias e possui fallback por URL assinada', () => {
  assert.match(library, /download\(doc\.storage_path\)/);
  assert.match(library, /if\(error\)throw error/);
  assert.match(library, /attempts:5,delayMs:500/);
  assert.match(library, /createSignedUrl\(doc,180\)/);
  assert.match(library, /fetch\(signedUrl,\{cache:'no-store',credentials:'omit'\}\)/);
  assert.match(library, /A conexão oscilou ao abrir este PDF/);
  assert.match(core, /networkerror/);
  assert.match(core, /failed to fetch/);
  assert.match(core, /load failed/);
});

test('módulo de ordenação integra o app shell offline', () => {
  assert.match(sw, /\.\/js\/pdf\/pdf-library-ordering\.js/);
  assert.match(sw, /\/js\/pdf\/pdf-library-ordering\.js/);
});

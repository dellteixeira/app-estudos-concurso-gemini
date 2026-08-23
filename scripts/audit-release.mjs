#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));
const errors = [];
const ok = msg => console.log(`OK  ${msg}`);
const fail = msg => { errors.push(msg); console.error(`ERRO ${msg}`); };

function discoverFiles(start, predicate) {
  const absolute = path.join(root, start);
  if (!fs.existsSync(absolute)) return [];
  const found = [];
  const visit = (dir, relativeBase) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = path.posix.join(relativeBase, entry.name);
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(abs, rel);
      else if (entry.isFile() && predicate(rel)) found.push(rel);
    }
  };
  visit(absolute, start.replace(/\\/g, '/'));
  return found.sort((a, b) => a.localeCompare(b));
}

function normalizeLocalAsset(value) {
  return String(value || '').split('#')[0].split('?')[0].replace(/^\.\//, 'public/');
}

function discoverHtmlAssets(html, tag, attr, prefix) {
  const regex = new RegExp(`<${tag}\\b[^>]*${attr}=["'](\\.\\/${prefix}[^"']+)["'][^>]*>`, 'gi');
  return [...html.matchAll(regex)].map(match => normalizeLocalAsset(match[1]));
}

let versionManifest = {};
let assetManifest = {};
try {
  versionManifest = JSON.parse(read('public/version.json'));
  ok('public/version.json é JSON válido');
} catch (error) { fail(`public/version.json inválido: ${error.message}`); }
try {
  assetManifest = JSON.parse(read('config/app-assets.json'));
  ok('config/app-assets.json é JSON válido');
} catch (error) { fail(`config/app-assets.json inválido: ${error.message}`); }

const version = String(versionManifest.version || '').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`versão inválida: ${version || '(vazia)'}`);
else ok(`versão de release: ${version}`);
if (assetManifest.version !== version) fail(`manifesto de assets=${assetManifest.version || '(vazio)'} diverge de ${version}`);
else ok('manifesto de assets sincronizado com a release');

const expectedRootName = `ESTUDO_ADAPTATIVO_INTELIGENTE_V${version.replace(/\./g, '_')}`;
if (!process.env.AUDIT_ALLOW_ANY_ROOT && path.basename(root) !== expectedRootName) fail(`pasta raiz=${path.basename(root)} diverge do esperado=${expectedRootName}`);
else ok(process.env.AUDIT_ALLOW_ANY_ROOT ? 'nome da pasta raiz liberado para CI' : 'nome da pasta raiz sincronizado');

const html = read('public/index.html');
const ALL_APP_JS_FILES = discoverFiles('public/js', rel => rel.endsWith('.js'));
const PDF_JS_FILES = ALL_APP_JS_FILES.filter(rel => rel.startsWith('public/js/pdf/'));
const ALL_CSS_FILES = discoverFiles('public/css', rel => rel.endsWith('.css'));
const TEST_FILES = discoverFiles('tests', rel => rel.endsWith('.test.cjs'));
const HTML_CSS_FILES = discoverHtmlAssets(html, 'link', 'href', 'css/');
const HTML_JS_FILES = [
  ...discoverHtmlAssets(html, 'script', 'src', 'js/'),
  ...[...html.matchAll(/<script\b[^>]*src=["'](\.\/pwa-update\.js(?:\?[^"']*)?)["'][^>]*>/gi)].map(match => normalizeLocalAsset(match[1]))
];

if (!ALL_APP_JS_FILES.length) fail('nenhum módulo JavaScript descoberto em public/js');
else ok(`${ALL_APP_JS_FILES.length} módulos JavaScript descobertos automaticamente`);
if (!ALL_CSS_FILES.length) fail('nenhuma folha CSS descoberta em public/css');
else ok(`${ALL_CSS_FILES.length} folhas CSS descobertas automaticamente`);
if (!TEST_FILES.length) fail('nenhum teste .test.cjs descoberto automaticamente');
else ok(`${TEST_FILES.length} testes estruturais descobertos automaticamente`);

const requiredStatic = ['public/index.html','public/sw.js','public/pwa-update.js','src/index.js','package.json','config/app-assets.json'];
for (const rel of requiredStatic) if (!exists(rel)) fail(`arquivo obrigatório ausente: ${rel}`);
for (const rel of [...HTML_CSS_FILES, ...HTML_JS_FILES]) if (!exists(rel)) fail(`asset referenciado no index ausente: ${rel}`);

const manifestRoutes = new Set([
  ...(assetManifest.criticalAppShell || []),
  ...(assetManifest.optionalOfflineAssets || []),
  ...(assetManifest.networkFirstPaths || []),
  ...(assetManifest.workerNoStorePaths || []),
  ...(assetManifest.headersNoStorePaths || []),
  ...(assetManifest.headersRevalidatePaths || [])
]);
for (const route of manifestRoutes) {
  if (route === '/' || route.startsWith('/vendor/')) continue;
  const rel = `public${route}`;
  if (!exists(rel)) fail(`asset declarado no manifesto ausente: ${rel}`);
}

if (exists('public/app.js')) fail('public/app.js monolítico ainda existe');
else ok('app.js monolítico removido');
if (exists('public/app.css')) fail('public/app.css monolítico ainda existe');
else ok('app.css monolítico removido');

const appJs = ALL_APP_JS_FILES.filter(exists).map(read).join('\n');
const appCss = ALL_CSS_FILES.filter(exists).map(read).join('\n');
const sw = read('public/sw.js');
const pwa = read('public/pwa-update.js');
const worker = read('src/index.js');

function assertNoDuplicates(name, items) {
  const duplicates = items.filter((item, index) => items.indexOf(item) !== index);
  if (duplicates.length) fail(`${name} possui referências duplicadas: ${[...new Set(duplicates)].join(', ')}`);
}
assertNoDuplicates('CSS do index', HTML_CSS_FILES);
assertNoDuplicates('JavaScript do index', HTML_JS_FILES);
if (!errors.some(e => e.includes('asset referenciado no index') || e.includes('referências duplicadas'))) {
  ok('assets do index descobertos em ordem determinística e sem duplicação');
}

// Versionamento/PWA.
if (/<meta name="app-version"/.test(html)) fail('index.html voltou a ter versão hardcoded');
else ok('index.html sem versão hardcoded');
const swVersion = sw.match(/const APP_VERSION = '([^']+)'/)?.[1] || '';
const workerVersion = worker.match(/const APP_VERSION = "([^"]+)"/)?.[1] || '';
if (swVersion !== version) fail(`sw.js=${swVersion} diverge de ${version}`); else ok('sw.js sincronizado');
if (workerVersion !== version) fail(`src/index.js=${workerVersion} diverge de ${version}`); else ok('Cloudflare Worker sincronizado');
const pkg = JSON.parse(read('package.json'));
if (pkg.version !== version) fail(`package.json=${pkg.version} diverge de ${version}`); else ok('package.json sincronizado');
if (!/GET_APP_VERSION/.test(pwa) || !/waitForControllerVersion\(/.test(pwa) || !/controllerchange/.test(pwa)) fail('atualização determinística do PWA incompleta');
else ok('atualização determinística do PWA preservada');
if (!/self\.skipWaiting\(\)/.test(sw) || !/self\.clients\.claim\(\)/.test(sw)) fail('Service Worker sem ativação controlada');
else ok('Service Worker suporta skipWaiting/clients.claim');

// A cobertura de cache/no-store agora é governada pelo manifesto canônico da Fase 6.
for (const route of ['/css/pdf-reader.css','/js/pdf/pdf-annotations.js','/js/pdf/pdf-reader.js']) {
  if (!(assetManifest.networkFirstPaths || []).includes(route)) fail(`manifesto não trata Reader como network-first: ${route}`);
}
if (!errors.some(e => e.includes('manifesto não trata Reader'))) ok('Reader coberto pelo manifesto network-first');
if (!exists('supabase/migrations/20260819030000_create_pdf_reader_annotations.sql')) fail('migration do Reader PDF ausente'); else ok('Reader PDF com anotações/versionamento versionado');
if (!exists('supabase/migrations/20260819090000_harden_pdf_reader_rls.sql')) fail('hardening RLS do Reader PDF ausente'); else ok('hardening RLS do Reader PDF versionado');
if (!/ERROR_CODES/.test(read('public/js/pdf/pdf-upload.js')) || !/classifyError/.test(read('public/js/pdf/pdf-upload.js')) || !/retryFailedUploads/.test(read('public/js/pdf/pdf-library-ui.js')) || !/pdfUploadResultPanel/.test(html)) fail('diagnóstico/retry de upload em lote incompleto'); else ok('diagnóstico e retry de upload em lote versionados');

// Sintaxe: todos os módulos atuais entram automaticamente no gate.
for (const rel of [...ALL_APP_JS_FILES, 'public/pwa-update.js','public/sw.js','src/index.js']) {
  try { execFileSync(process.execPath, ['--check', path.join(root, rel)], { stdio:'pipe' }); }
  catch { fail(`${rel} possui erro de sintaxe`); }
}
if (!errors.some(e => e.includes('possui erro de sintaxe'))) ok(`${ALL_APP_JS_FILES.length + 3} arquivos JavaScript passaram no node --check`);
for (const rel of ['public/manifest.json','wrangler.jsonc','package.json','config/app-assets.json']) {
  try { JSON.parse(read(rel).replace(/^\s*\/\/.*$/gm,'')); ok(`${rel} é JSON válido`); }
  catch (error) { fail(`${rel} inválido: ${error.message}`); }
}

// Domínio compartilhado deve estar realmente usado em produção.
const requiredDomainCalls = [
  'StudyDomain.getSessionMinutes',
  'StudyDomain.mergeStudySessions',
  'StudyDomain.totalStudyMinutes',
  'StudyDomain.sortNamesByCanonicalOrder',
  'StudyDomain.getTopicItemsForDeletion',
  'StudyDomain.questionProgressFraction',
  'StudyDomain.hasRetentionMasteryEvidence',
  'StudyDomain.filterActiveRetentionStates'
];
for (const call of requiredDomainCalls) if (!appJs.includes(call)) fail(`produção não delega para ${call}`);
if (!errors.some(e => e.includes('produção não delega'))) ok('regras críticas compartilham StudyDomain com os testes');

// Testes automatizados: descoberta recursiva elimina listas manuais desatualizadas.
if (!exists('.github/workflows/quality-check.yml')) fail('workflow automático de qualidade ausente');
else ok('GitHub Actions de qualidade presente');
if (!exists('.github/workflows/backup-supabase.yml')) fail('workflow de backup Supabase ausente');
else {
  const backupWorkflow = read('.github/workflows/backup-supabase.yml');
  if (!/backup-supabase-storage\.mjs/.test(backupWorkflow) || !/manifest\.sha256/.test(backupWorkflow)) fail('backup Supabase sem blindagem de Storage/integridade');
  else ok('backup Supabase preparado para banco + Storage + integridade');
}
for (const rel of ['supabase/baseline/runtime-contract.json','supabase/baseline/README.txt','scripts/capture-supabase-baseline.sh','scripts/backup-supabase-storage.mjs','supabase/migrations/20260818_harden_delete_my_study_data.sql','supabase/migrations/20260818210000_create_pdf_foundation.sql','supabase/migrations/20260818210100_extend_delete_my_study_data_for_pdf.sql','supabase/migrations/20260818220000_link_pdf_workspace_to_concurso.sql','supabase/migrations/20260818230000_decouple_pdf_from_concurso.sql','supabase/migrations/20260818230100_extend_delete_my_study_data_for_pdf_links.sql']) {
  if (!exists(rel)) fail(`blindagem Supabase ausente: ${rel}`);
}
if (!errors.some(e => e.includes('blindagem Supabase'))) ok('baseline e hardening Supabase versionados');
try {
  execFileSync(process.execPath, ['--test', ...TEST_FILES.map(rel => path.join(root, rel))], { stdio:'pipe' });
  ok(`${TEST_FILES.length} arquivos de teste descobertos e aprovados`);
} catch { fail('testes automatizados descobertos falharam'); }

// Fundação privada do módulo PDF.
const pdfFoundationSql = read('supabase/migrations/20260818210000_create_pdf_foundation.sql');
for (const token of ['public.study_workspaces','public.pdf_documents','public.pdf_progress',"'study-pdfs'",'enable row level security','auth.uid()']) {
  if (!pdfFoundationSql.toLowerCase().includes(token.toLowerCase())) fail(`fundação PDF incompleta: ${token}`);
}
if (!/file_size > 0 and file_size <= 104857600/.test(pdfFoundationSql)) fail('limite de 100 MiB do PDF não está versionado');
else ok('fundação PDF privada com RLS/Storage/limite versionada');

// Biblioteca Global + vínculos contextuais.
const pdfGlobalSql = read('supabase/migrations/20260818230000_decouple_pdf_from_concurso.sql');
for (const token of ['pdf_document_links','pdf_id','concurso','materia','assunto','enable row level security']) {
  if (!pdfGlobalSql.includes(token)) fail(`Biblioteca Global incompleta: ${token}`);
}
for (const token of ['pdfLibraryScope','modalPdfLink','pdfLinkMateria','pdfLinkAssunto']) {
  if (!html.includes(token)) fail(`UI de vínculo global incompleta: ${token}`);
}
const pdfPhase2Js = PDF_JS_FILES.filter(exists).map(read).join('\n');
for (const token of ["from('pdf_document_links')","from('pdf_documents')","from('pdf_progress')",'.storage.from(core().BUCKET)','getUniqueMateriasFromEdital','getAssuntosForMateria']) {
  if (!pdfPhase2Js.includes(token)) fail(`integração da Biblioteca Global incompleta: ${token}`);
}
if (!/\$\{userId\}\/\$\{pdfId\}\/original\.pdf/.test(read('public/js/pdf/pdf-core.js'))) fail('Storage ainda depende de Workspace');
if (!errors.some(e => e.includes('Biblioteca Global') || e.includes('Storage ainda'))) ok('PDF global desacoplado do concurso com vínculos contextuais');

// Regressões funcionais importantes das versões anteriores.
if (!/let timerEndAtMs = null;/.test(appJs) || !/timerEndAtMs = Date\.now\(\) \+/.test(appJs) || /function startTimer\(\)[\s\S]*?timeLeft--/.test(appJs)) fail('Timer absoluto sofreu regressão');
else ok('Timer absoluto preservado');
if (!/source:\s*'pomodoro-manual'/.test(appJs) || !/function openPomodoroContextModal\(\)/.test(appJs)) fail('Pomodoro manual sem vínculo sofreu regressão');
else ok('Pomodoro manual vinculado preservado');
if (!/sortMateriaNamesByCanonicalOrder\(Object\.keys\(counts\)\)/.test(appJs)) fail('ordem canônica do gráfico sofreu regressão');
else ok('ordem canônica do gráfico preservada');
if (!/StudyDomain\.filterActiveRetentionStates/.test(appJs)) fail('retenção não filtra tópicos ativos via domínio');
else ok('retenção ativa preservada');
if (!/class="note-format-toolbar"/.test(html) || !/contenteditable="true"/.test(html) || !/function sanitizeNoteHtml\(/.test(appJs)) fail('editor rico de notas sofreu regressão');
else ok('editor rico de notas preservado');
if (!/onclick="excluirAssuntoEspecifico\(\)"/.test(html) || !/StudyDomain\.getTopicItemsForDeletion/.test(appJs)) fail('exclusão granular sofreu regressão');
else ok('exclusão granular preservada');

// Layout de retenção aprovado precisa continuar em alguma folha CSS descoberta.
for (const selector of ['.rd-center-v1077','.rd-exam-banner-v1077','.rd-metrics-v1077','.rd-metric-card-v1077']) {
  if (!appCss.includes(selector)) fail(`CSS de retenção ausente: ${selector}`);
}
if (!errors.some(e => e.includes('CSS de retenção'))) ok('layout aprovado de Retenção preservado');

if (errors.length) {
  console.error(`\nAUDITORIA REPROVADA: ${errors.length} problema(s).`);
  process.exit(1);
}
console.log('\nAUDITORIA APROVADA: descoberta automática de módulos, testes e release consistente.');

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

const JS_FILES = [
  'public/js/study-domain.js',
  'public/js/app-core.js',
  'public/js/app-ai.js',
  'public/js/app-ui.js',
  'public/js/app-pwa.js'
];
const CSS_FILES = [
  'public/css/base.css',
  'public/css/dashboard.css',
  'public/css/features.css'
];
const CORE_ROUTES = [
  '/', '/index.html', '/sw.js', '/pwa-update.js', '/version.json',
  '/css/base.css', '/css/dashboard.css', '/css/features.css',
  '/js/study-domain.js', '/js/app-core.js', '/js/app-ai.js', '/js/app-ui.js', '/js/app-pwa.js'
];

let versionManifest = {};
try {
  versionManifest = JSON.parse(read('public/version.json'));
  ok('public/version.json é JSON válido');
} catch (error) { fail(`public/version.json inválido: ${error.message}`); }
const version = String(versionManifest.version || '').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`versão inválida: ${version || '(vazia)'}`);
else ok(`versão de release: ${version}`);

const expectedRootName = `ESTUDO_ADAPTATIVO_INTELIGENTE_V${version.replace(/\./g, '_')}`;
if (!process.env.AUDIT_ALLOW_ANY_ROOT && path.basename(root) !== expectedRootName) fail(`pasta raiz=${path.basename(root)} diverge do esperado=${expectedRootName}`);
else ok(process.env.AUDIT_ALLOW_ANY_ROOT ? 'nome da pasta raiz liberado para CI' : 'nome da pasta raiz sincronizado');

for (const rel of [...JS_FILES, ...CSS_FILES, 'public/index.html','public/sw.js','public/pwa-update.js','src/index.js','package.json']) {
  if (!exists(rel)) fail(`arquivo obrigatório ausente: ${rel}`);
}
if (exists('public/app.js')) fail('public/app.js monolítico ainda existe');
else ok('app.js monolítico removido');
if (exists('public/app.css')) fail('public/app.css monolítico ainda existe');
else ok('app.css monolítico removido');

const html = read('public/index.html');
const appJs = JS_FILES.filter(exists).map(read).join('\n');
const appCss = CSS_FILES.filter(exists).map(read).join('\n');
const sw = read('public/sw.js');
const pwa = read('public/pwa-update.js');
const worker = read('src/index.js');
const headers = read('public/_headers');

// Ordem dos assets no HTML.
let cursor = -1;
for (const rel of CSS_FILES.map(x => './'+x.replace('public/',''))) {
  const pos = html.indexOf(`href="${rel}"`);
  if (pos < 0) fail(`CSS não carregado no index: ${rel}`);
  if (pos <= cursor) fail(`ordem de CSS incorreta: ${rel}`);
  cursor = pos;
}
ok('CSS dividido carregado em ordem determinística');
cursor = -1;
for (const rel of JS_FILES.map(x => './'+x.replace('public/',''))) {
  const pos = html.indexOf(`src="${rel}"`);
  if (pos < 0) fail(`JS não carregado no index: ${rel}`);
  if (pos <= cursor) fail(`ordem de JS incorreta: ${rel}`);
  cursor = pos;
}
ok('JavaScript dividido carregado em ordem determinística');

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

// Cache/offline precisa conhecer todos os chunks.
for (const route of CORE_ROUTES.slice(1)) {
  const shellToken = `'.${route}'`;
  if (route !== '/sw.js' && !sw.includes(shellToken) && route !== '/pwa-update.js') fail(`APP_SHELL não inclui ${route}`);
}
for (const route of CORE_ROUTES) {
  if (route !== '/' && !headers.includes(`${route}\n`)) fail(`_headers não possui regra explícita para ${route}`);
  if (!worker.includes(`"${route}"`)) fail(`Cloudflare Worker não força no-store em ${route}`);
}
if (!errors.some(e => e.includes('APP_SHELL') || e.includes('_headers') || e.includes('Cloudflare Worker'))) ok('novos chunks cobertos por offline/no-store');

// Sintaxe.
for (const rel of [...JS_FILES, 'public/pwa-update.js','public/sw.js','src/index.js']) {
  try { execFileSync(process.execPath, ['--check', path.join(root, rel)], { stdio:'pipe' }); ok(`${rel} passou no node --check`); }
  catch { fail(`${rel} possui erro de sintaxe`); }
}
for (const rel of ['public/manifest.json','wrangler.jsonc','package.json']) {
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

// Testes automatizados exigidos.
const expectedTests = ['minutes','sync','priorities','deletions','metrics','retention','infrastructure'].map(n => `tests/${n}.test.cjs`);
for (const rel of expectedTests) if (!exists(rel)) fail(`teste automatizado ausente: ${rel}`);
if (!exists('.github/workflows/quality-check.yml')) fail('workflow automático de qualidade ausente');
else ok('GitHub Actions de qualidade presente');
if (!exists('.github/workflows/backup-supabase.yml')) fail('workflow de backup Supabase ausente');
else {
  const backupWorkflow = read('.github/workflows/backup-supabase.yml');
  if (!/backup-supabase-storage\.mjs/.test(backupWorkflow) || !/manifest\.sha256/.test(backupWorkflow)) fail('backup Supabase sem blindagem de Storage/integridade');
  else ok('backup Supabase preparado para banco + Storage + integridade');
}
for (const rel of ['supabase/baseline/runtime-contract.json','supabase/baseline/README.txt','scripts/capture-supabase-baseline.sh','scripts/backup-supabase-storage.mjs','supabase/migrations/20260818_harden_delete_my_study_data.sql']) {
  if (!exists(rel)) fail(`blindagem Supabase ausente: ${rel}`);
}
if (!errors.some(e => e.includes('blindagem Supabase'))) ok('baseline e hardening Supabase versionados');
try {
  execFileSync(process.execPath, ['--test', ...expectedTests.map(rel=>path.join(root,rel))], { stdio:'pipe' });
  ok('7 categorias de testes automatizados aprovadas');
} catch (error) { fail('testes automatizados falharam'); }

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

// Layout de retenção aprovado precisa continuar no CSS dividido.
for (const selector of ['.rd-center-v1077','.rd-exam-banner-v1077','.rd-metrics-v1077','.rd-metric-card-v1077']) {
  if (!appCss.includes(selector)) fail(`CSS de retenção ausente: ${selector}`);
}
if (!errors.some(e => e.includes('CSS de retenção'))) ok('layout aprovado de Retenção preservado');

if (errors.length) {
  console.error(`\nAUDITORIA REPROVADA: ${errors.length} problema(s).`);
  process.exit(1);
}
console.log('\nAUDITORIA APROVADA: arquitetura modular, testes e release consistentes.');

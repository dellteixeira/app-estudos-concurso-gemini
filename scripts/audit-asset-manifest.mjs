#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const fail = message => { console.error(`ERRO ${message}`); process.exitCode = 1; };
const ok = message => console.log(`OK  ${message}`);

const manifest = JSON.parse(read('config/app-assets.json'));
const sw = read('public/sw.js');
const wrangler = JSON.parse(read('wrangler.jsonc'));
const workerEntryPath = String(wrangler.main || './src/index.js').replace(/^\.\//, '');
const workerEntry = read(workerEntryPath);
const legacyWorker = workerEntryPath === 'src/index.js' ? '' : read('src/index.js');
const headers = read('public/_headers');
const version = JSON.parse(read('public/version.json')).version;

if (manifest.version !== version) fail(`manifesto=${manifest.version} diverge da versão=${version}`);
else ok(`manifesto de assets sincronizado com ${version}`);

function assertUniquePaths(name, items) {
  if (!Array.isArray(items) || !items.length) return fail(`${name} ausente ou vazio`);
  const bad = items.filter(item => typeof item !== 'string' || !item.startsWith('/'));
  if (bad.length) fail(`${name} contém caminhos inválidos: ${bad.join(', ')}`);
  const duplicates = items.filter((item, index) => items.indexOf(item) !== index);
  if (duplicates.length) fail(`${name} contém duplicados: ${[...new Set(duplicates)].join(', ')}`);
}

for (const key of ['criticalAppShell','optionalOfflineAssets','networkFirstPaths','workerNoStorePaths','headersNoStorePaths','headersRevalidatePaths']) {
  assertUniquePaths(key, manifest[key]);
}

function parseQuotedPaths(block) {
  // O sufixo usa * (e não +) para que a raiz '/' e './' também sejam
  // inventariadas. Isso mantém o parser fiel às listas reais do SW/Worker.
  return [...block.matchAll(/['"](\.?\/[^'"]*)['"]/g)]
    .map(match => match[1].replace(/^\.\//, '/'));
}

function getBlock(source, regex, name, { optional = false } = {}) {
  const block = source.match(regex)?.[1];
  if (!block && !optional) fail(`não foi possível localizar ${name}`);
  return block || '';
}

const swCritical = parseQuotedPaths(getBlock(sw, /const CRITICAL_APP_SHELL = \[([\s\S]*?)\];/, 'CRITICAL_APP_SHELL'));
const swOptional = parseQuotedPaths(getBlock(sw, /const OPTIONAL_OFFLINE_ASSETS = \[([\s\S]*?)\];/, 'OPTIONAL_OFFLINE_ASSETS'));
const swNetworkFirst = parseQuotedPaths(getBlock(sw, /const isCoreAsset[\s\S]*?&& \[([\s\S]*?)\]\.some\(/, 'isCoreAsset'));

// A política efetiva do Worker pode ser composta: o entrypoint configurado no
// Wrangler pode interceptar rotas e delegar o restante ao Worker legado. A
// auditoria deve validar exatamente essa cadeia de execução, não um arquivo
// hardcoded que deixou de ser o entrypoint.
const legacyNoStore = legacyWorker
  ? parseQuotedPaths(getBlock(legacyWorker, /const CORE_NO_STORE_PATHS = new Set\(\[([\s\S]*?)\]\);/, 'CORE_NO_STORE_PATHS'))
  : parseQuotedPaths(getBlock(workerEntry, /const CORE_NO_STORE_PATHS = new Set\(\[([\s\S]*?)\]\);/, 'CORE_NO_STORE_PATHS'));
const extendedNoStore = parseQuotedPaths(getBlock(workerEntry, /const EXTENDED_NO_STORE_PATHS = new Set\(\[([\s\S]*?)\]\);/, 'EXTENDED_NO_STORE_PATHS', { optional: true }));
const workerNoStore = [...new Set([...legacyNoStore, ...extendedNoStore])];

if (workerEntryPath !== 'src/index.js') {
  if (!/from\s+['"]\.\/index\.js['"]/.test(workerEntry)) {
    fail(`entrypoint ${workerEntryPath} não delega explicitamente ao Worker legado src/index.js`);
  } else {
    ok(`entrypoint Cloudflare efetivo auditado: ${workerEntryPath} + src/index.js`);
  }
}

function samePaths(name, actual, expected) {
  const a = [...new Set(actual)].sort();
  const e = [...new Set(expected)].sort();
  const missing = e.filter(item => !a.includes(item));
  const extra = a.filter(item => !e.includes(item));
  if (missing.length || extra.length) {
    fail(`${name} diverge do manifesto${missing.length ? `; faltando: ${missing.join(', ')}` : ''}${extra.length ? `; extras: ${extra.join(', ')}` : ''}`);
  } else {
    ok(`${name} governado pelo manifesto canônico`);
  }
}

samePaths('Service Worker critical shell', swCritical, manifest.criticalAppShell);
samePaths('Service Worker optional offline', swOptional, manifest.optionalOfflineAssets);
samePaths('Service Worker network-first', swNetworkFirst, manifest.networkFirstPaths);
samePaths('Cloudflare Worker no-store', workerNoStore, manifest.workerNoStorePaths);

function parseHeadersPolicies(source) {
  const result = new Map();
  const lines = source.split(/\r?\n/);
  let route = null;
  for (const raw of lines) {
    if (raw && !/^\s/.test(raw) && raw.startsWith('/')) {
      route = raw.trim();
      if (!result.has(route)) result.set(route, []);
      continue;
    }
    if (route && /^\s+Cache-Control:/i.test(raw)) {
      result.get(route).push(raw.trim().replace(/^Cache-Control:\s*/i, '').toLowerCase());
    }
  }
  return result;
}

const headerPolicies = parseHeadersPolicies(headers);
const actualHeaderNoStore = [...headerPolicies.entries()]
  .filter(([, policies]) => policies.some(policy => policy.includes('no-store')))
  .map(([route]) => route);
const actualHeaderRevalidate = [...headerPolicies.entries()]
  .filter(([, policies]) => policies.some(policy => policy.includes('no-cache') && !policy.includes('no-store')))
  .map(([route]) => route);

samePaths('_headers no-store', actualHeaderNoStore, manifest.headersNoStorePaths);
samePaths('_headers revalidate', actualHeaderRevalidate, manifest.headersRevalidatePaths);

const offlineUnion = new Set([...manifest.criticalAppShell, ...manifest.optionalOfflineAssets]);
for (const route of manifest.networkFirstPaths) {
  if (!offlineUnion.has(route) && route !== '/sw.js') {
    fail(`network-first fora do inventário offline: ${route}`);
  }
}

for (const route of [...manifest.criticalAppShell, ...manifest.optionalOfflineAssets]) {
  if (route === '/' || route.startsWith('/vendor/')) continue;
  const rel = `public${route}`;
  if (!fs.existsSync(path.join(root, rel))) fail(`asset do manifesto não existe: ${rel}`);
}

const html = read('public/index.html');
const appPwa = read('public/js/app-pwa.js');
const currentResponsiveRoute = `/css/responsive-polish-v${version}.css`;
const currentResponsiveFile = `public${currentResponsiveRoute}`;
const currentResponsiveSource = fs.existsSync(path.join(root, currentResponsiveFile))
  ? read(currentResponsiveFile)
  : '';
const responsiveBaselineMatch = html.match(/href=["']\.\/css\/responsive-polish-v(\d+\.\d+\.\d+)\.css["']/);
const responsiveBaselineRoute = responsiveBaselineMatch
  ? `/css/responsive-polish-v${responsiveBaselineMatch[1]}.css`
  : null;

// Contrato de transição: o shell pode manter um baseline responsivo imutável,
// desde que a release atual tenha um delta versionado, pré-cacheado e carregado
// explicitamente pelo runtime. Assim um bump incompleto volta a falhar no CI.
let governedResponsiveBaseline = null;
if (responsiveBaselineRoute && responsiveBaselineRoute !== currentResponsiveRoute) {
  const baselineFile = `public${responsiveBaselineRoute}`;
  const currentIsCritical = manifest.criticalAppShell.includes(currentResponsiveRoute);
  const runtimeLoadsCurrent = appPwa.includes(`.${currentResponsiveRoute}?v=${version}`);
  const currentIsDeltaOnly = currentResponsiveSource.length > 0 && !/@import\s+/i.test(currentResponsiveSource);
  const baselineExists = fs.existsSync(path.join(root, baselineFile));

  if (!baselineExists) fail(`baseline responsivo referenciado não existe: ${baselineFile}`);
  if (!currentIsCritical) fail(`delta responsivo atual não está no critical app shell: ${currentResponsiveRoute}`);
  if (!runtimeLoadsCurrent) fail(`runtime PWA não carrega o delta responsivo da release: ${currentResponsiveRoute}?v=${version}`);
  if (!currentIsDeltaOnly) fail(`delta responsivo atual não pode importar outro responsive-polish: ${currentResponsiveRoute}`);

  if (baselineExists && currentIsCritical && runtimeLoadsCurrent && currentIsDeltaOnly) {
    governedResponsiveBaseline = responsiveBaselineRoute;
    ok(`baseline responsivo ${responsiveBaselineRoute} governado por delta ${currentResponsiveRoute}`);
  }
}

const referenced = [
  ...html.matchAll(/(?:src|href)=["']\.\/(css\/[^"']+|js\/[^"']+|pwa-update\.js)["']/g)
].map(match => `/${match[1].split('?')[0]}`);
const knownRuntime = new Set([...manifest.criticalAppShell, ...manifest.optionalOfflineAssets, ...manifest.networkFirstPaths]);
for (const route of referenced) {
  if (route === governedResponsiveBaseline) continue;
  if (!knownRuntime.has(route)) fail(`asset carregado no index sem contrato de cache/offline: ${route}`);
}

if (!process.exitCode) ok('inventário único de assets/cache sem divergências');

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const fail = message => { console.error(`ERRO ${message}`); process.exitCode = 1; };
const ok = message => console.log(`OK  ${message}`);

const manifest = JSON.parse(read('config/app-assets.json'));
const sw = read('public/sw.js');
const worker = read('src/index.js');
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
  return [...block.matchAll(/['"](\.?\/[^'"]+)['"]/g)]
    .map(match => match[1].replace(/^\.\//, '/'));
}

function getBlock(source, regex, name) {
  const block = source.match(regex)?.[1];
  if (!block) fail(`não foi possível localizar ${name}`);
  return block || '';
}

const swCritical = parseQuotedPaths(getBlock(sw, /const CRITICAL_APP_SHELL = \[([\s\S]*?)\];/, 'CRITICAL_APP_SHELL'));
const swOptional = parseQuotedPaths(getBlock(sw, /const OPTIONAL_OFFLINE_ASSETS = \[([\s\S]*?)\];/, 'OPTIONAL_OFFLINE_ASSETS'));
const swNetworkFirst = parseQuotedPaths(getBlock(sw, /const isCoreAsset[\s\S]*?&& \[([\s\S]*?)\]\.some\(/, 'isCoreAsset'));
const workerNoStore = parseQuotedPaths(getBlock(worker, /const CORE_NO_STORE_PATHS = new Set\(\[([\s\S]*?)\]\);/, 'CORE_NO_STORE_PATHS'));

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
const referenced = [
  ...html.matchAll(/(?:src|href)=["']\.\/(css\/[^"']+|js\/[^"']+|pwa-update\.js)["']/g)
].map(match => `/${match[1].split('?')[0]}`);
const knownRuntime = new Set([...manifest.criticalAppShell, ...manifest.optionalOfflineAssets, ...manifest.networkFirstPaths]);
for (const route of referenced) {
  if (!knownRuntime.has(route)) fail(`asset carregado no index sem contrato de cache/offline: ${route}`);
}

if (!process.exitCode) ok('inventário único de assets/cache sem divergências');

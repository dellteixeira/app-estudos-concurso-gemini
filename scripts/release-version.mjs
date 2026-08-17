#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('Uso: node scripts/release-version.mjs X.Y.Z');
  process.exit(1);
}

const files = {
  version: path.join(root, 'public/version.json'),
  html: path.join(root, 'public/index.html'),
  sw: path.join(root, 'public/sw.js'),
  worker: path.join(root, 'src/index.js'),
};

const now = new Date().toISOString();
fs.writeFileSync(files.version, JSON.stringify({ version, build: now }, null, 2) + '\n');

let html = fs.readFileSync(files.html, 'utf8');
html = html.replace(/<meta name="app-version" content="[^"]+">/, `<meta name="app-version" content="${version}">`);
fs.writeFileSync(files.html, html);

let sw = fs.readFileSync(files.sw, 'utf8');
sw = sw.replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${version}';`);
fs.writeFileSync(files.sw, sw);

let worker = fs.readFileSync(files.worker, 'utf8');
worker = worker.replace(/const APP_VERSION = "[^"]+";/, `const APP_VERSION = "${version}";`);
fs.writeFileSync(files.worker, worker);

console.log(`Versão sincronizada para ${version}.`);
console.log('Execute: node scripts/audit-release.mjs');

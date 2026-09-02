#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (rel, content) => fs.writeFileSync(path.join(root, rel), content);

const contract = JSON.parse(read('config/release-contract.json'));
const version = String(contract.version || '').trim();
const versionCode = Number(contract.android?.versionCode);
const revision = Number(contract.android?.revision || 1);
const oldVersion = '10.64.37';

if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`versão inválida: ${version}`);
if (!Number.isInteger(versionCode) || versionCode <= 0) throw new Error(`versionCode inválido: ${contract.android?.versionCode}`);

function replaceAllIn(rel, from, to) {
  const before = read(rel);
  const after = before.replaceAll(from, to);
  if (after !== before) write(rel, after);
}

for (const rel of [
  'package.json',
  'package-lock.json',
  'public/version.json',
  'config/app-assets.json',
  'public/index.html',
  'src/index.js',
  'public/sw.js'
]) {
  replaceAllIn(rel, oldVersion, version);
}

{
  const rel = 'android/app/build.gradle';
  let source = read(rel);
  source = source.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  source = source.replace(/versionName\s+"[^"]+"/, `versionName "${version}-mobile.${revision}"`);
  write(rel, source);
}

{
  const oldCss = path.join(root, 'public/css', `responsive-polish-v${oldVersion}.css`);
  const newCss = path.join(root, 'public/css', `responsive-polish-v${version}.css`);
  if (fs.existsSync(oldCss) && !fs.existsSync(newCss)) fs.renameSync(oldCss, newCss);
  if (!fs.existsSync(newCss)) throw new Error(`CSS responsivo canônico ausente: ${path.relative(root, newCss)}`);
}

for (const rel of [
  'package.json',
  'package-lock.json',
  'public/version.json',
  'config/app-assets.json',
  'src/index.js',
  'public/sw.js',
  'android/app/build.gradle'
]) {
  if (read(rel).includes(oldVersion)) throw new Error(`versão obsoleta remanescente em ${rel}`);
}

console.log(`Phase 8 release identity synchronized to ${version}`);

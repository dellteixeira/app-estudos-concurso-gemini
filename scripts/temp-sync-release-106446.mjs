#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const from = '10.64.45';
const to = '10.64.46';
const oldCode = '106447';
const newCode = '106448';

function file(rel) { return path.join(root, rel); }
function read(rel) { return fs.readFileSync(file(rel), 'utf8'); }
function write(rel, content) { fs.writeFileSync(file(rel), content, 'utf8'); }
function replaceAll(rel, pairs) {
  let content = read(rel);
  for (const [needle, replacement, required = true] of pairs) {
    if (required && !content.includes(needle) && !content.includes(replacement)) {
      throw new Error(`${rel}: padrão ausente: ${needle}`);
    }
    content = content.split(needle).join(replacement);
  }
  write(rel, content);
}

replaceAll('package.json', [[`"version": "${from}"`, `"version": "${to}"`, false]]);
replaceAll('package-lock.json', [[`"version": "${from}"`, `"version": "${to}"`]]);
replaceAll('public/version.json', [[`"version": "${from}"`, `"version": "${to}"`]]);
replaceAll('config/app-assets.json', [
  [`"version": "${from}"`, `"version": "${to}"`],
  [`responsive-polish-v${from}.css`, `responsive-polish-v${to}.css`]
]);
replaceAll('public/index.html', [[`responsive-polish-v${from}.css`, `responsive-polish-v${to}.css`]]);
replaceAll('public/sw.js', [
  [`const APP_VERSION = '${from}';`, `const APP_VERSION = '${to}';`],
  [`responsive-polish-v${from}.css`, `responsive-polish-v${to}.css`]
]);
replaceAll('src/index.js', [[`const APP_VERSION = "${from}";`, `const APP_VERSION = "${to}";`]]);
replaceAll('android/app/build.gradle', [
  [`versionCode ${oldCode}`, `versionCode ${newCode}`],
  [`versionName "${from}-mobile.1"`, `versionName "${to}-mobile.1"`]
]);

const oldCss = `public/css/responsive-polish-v${from}.css`;
const newCss = `public/css/responsive-polish-v${to}.css`;
if (!fs.existsSync(file(newCss))) {
  fs.copyFileSync(file(oldCss), file(newCss));
}

const contract = JSON.parse(read('config/release-contract.json'));
if (contract.version !== to || Number(contract.android?.versionCode) !== Number(newCode)) {
  throw new Error('config/release-contract.json não está em 10.64.46 / 106448');
}

for (const rel of ['package.json','package-lock.json','public/version.json','config/app-assets.json','public/index.html','public/sw.js','src/index.js','android/app/build.gradle']) {
  if (read(rel).includes(from)) throw new Error(`${rel}: referência residual a ${from}`);
}

console.log(`Release sincronizada: ${to}, Android code ${newCode}`);

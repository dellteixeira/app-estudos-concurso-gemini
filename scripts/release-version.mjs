#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('Uso: node scripts/release-version.mjs X.Y.Z');
  process.exit(1);
}
const now = new Date().toISOString();
const versionFile = path.join(root,'public/version.json');
fs.writeFileSync(versionFile, JSON.stringify({version,build:now},null,2)+'\n');

const replace = (rel, regex, value) => {
  const file = path.join(root,rel);
  let text = fs.readFileSync(file,'utf8');
  text = text.replace(regex,value);
  fs.writeFileSync(file,text);
};
replace('public/sw.js', /const APP_VERSION = '[^']+';/, `const APP_VERSION = '${version}';`);
replace('src/index.js', /const APP_VERSION = "[^"]+";/, `const APP_VERSION = "${version}";`);

const pkgFile = path.join(root,'package.json');
if (fs.existsSync(pkgFile)) {
  const pkg = JSON.parse(fs.readFileSync(pkgFile,'utf8'));
  pkg.version = version;
  fs.writeFileSync(pkgFile, JSON.stringify(pkg,null,2)+'\n');
}
console.log(`Versão sincronizada para ${version}.`);
console.log('Execute: npm test && node scripts/audit-release.mjs');

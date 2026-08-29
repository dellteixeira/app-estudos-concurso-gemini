#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const workflowDir = path.join(root, '.github', 'workflows');
const androidWorkflows = fs.readdirSync(workflowDir)
  .filter(name => /^android-.*\.ya?ml$/i.test(name))
  .sort();

const errors = [];
const fail = message => {
  errors.push(message);
  console.error(`ERRO ${message}`);
};

const forbidden = [
  [/ANDROID_VERSION_NAME:\s*['"]\d+\.\d+\.\d+/i, 'ANDROID_VERSION_NAME literal'],
  [/APP_VERSION_CODE:\s*['"]?\d+/i, 'APP_VERSION_CODE literal'],
  [/WEB_VERSION:\s*['"]\d+\.\d+\.\d+/i, 'WEB_VERSION literal'],
  [/RELEASE_TAG:\s*['"]v\d+\.\d+\.\d+/i, 'RELEASE_TAG literal'],
  [/grep\s+-q\s+['"][^'"\n]*versionCode\s+\d+/i, 'versionCode literal em validação'],
  [/grep\s+-q\s+['"][^'"\n]*versionName[^'"\n]*\d+\.\d+\.\d+/i, 'versionName literal em validação'],
  [/responsive-polish-v\d+\.\d+\.\d+\.css/i, 'CSS responsivo versionado manualmente'],
  [/EstudoAdaptativo-v\d+\.\d+\.\d+(?:-mobile\.\d+)?/i, 'artifact APK com versão literal']
];

for (const name of androidWorkflows) {
  const rel = `.github/workflows/${name}`;
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  if (!/scripts\/release-contract\.mjs\s+github/.test(text)) {
    fail(`${rel} não resolve config/release-contract.json via scripts/release-contract.mjs github`);
  }
  for (const [pattern, label] of forbidden) {
    if (pattern.test(text)) fail(`${rel}: ${label}`);
  }
}

if (errors.length) {
  console.error(`\n${errors.length} divergência(s) de contrato encontrada(s) nos workflows Android.`);
  process.exit(1);
}

console.log(`OK  ${androidWorkflows.length} workflows Android derivam identidade do contrato canônico sem literais de release.`);

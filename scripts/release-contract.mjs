#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const contract = JSON.parse(read('config/release-contract.json'));

const version = String(contract.version || '').trim();
const revision = Number(contract.android?.revision);
const versionCode = Number(contract.android?.versionCode);
const appPackage = String(contract.android?.package || '').trim();
const androidVersionName = `${version}-mobile.${revision}`;
const releaseTag = `v${version}`;
const responsiveCss = `responsive-polish-v${version}.css`;

function fail(message) {
  console.error(`RELEASE_CONTRACT_ERROR: ${message}`);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function parseGradle() {
  const gradle = read('android/app/build.gradle');
  return {
    versionCode: Number(gradle.match(/versionCode\s+(\d+)/)?.[1] || 0),
    versionName: gradle.match(/versionName\s+"([^"]+)"/)?.[1] || '',
    applicationId: gradle.match(/applicationId\s+"([^"]+)"/)?.[1] || ''
  };
}

function check() {
  assert(/^\d+\.\d+\.\d+$/.test(version), `version inválida: ${version || '(vazia)'}`);
  assert(Number.isInteger(revision) && revision >= 1, `android.revision inválida: ${contract.android?.revision}`);
  assert(Number.isInteger(versionCode) && versionCode > 0, `android.versionCode inválido: ${contract.android?.versionCode}`);
  assert(/^[a-zA-Z][a-zA-Z0-9_.]+$/.test(appPackage), `android.package inválido: ${appPackage || '(vazio)'}`);

  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const publicVersion = JSON.parse(read('public/version.json'));
  const assets = JSON.parse(read('config/app-assets.json'));
  const workerVersion = read('src/index.js').match(/const APP_VERSION = "([^"]+)"/)?.[1] || '';
  const swVersion = read('public/sw.js').match(/const APP_VERSION = '([^']+)'/)?.[1] || '';
  const gradle = parseGradle();

  assert(pkg.version === version, `package.json=${pkg.version} diverge do contrato=${version}`);
  assert(lock.version === version, `package-lock.json=${lock.version} diverge do contrato=${version}`);
  assert(lock.packages?.['']?.version === version, `package-lock root=${lock.packages?.['']?.version} diverge do contrato=${version}`);
  assert(publicVersion.version === version, `public/version.json=${publicVersion.version} diverge do contrato=${version}`);
  assert(assets.version === version, `config/app-assets.json=${assets.version} diverge do contrato=${version}`);
  assert(workerVersion === version, `src/index.js=${workerVersion} diverge do contrato=${version}`);
  assert(swVersion === version, `public/sw.js=${swVersion} diverge do contrato=${version}`);
  assert(gradle.versionName === androidVersionName, `Gradle versionName=${gradle.versionName} diverge do contrato=${androidVersionName}`);
  assert(gradle.versionCode === versionCode, `Gradle versionCode=${gradle.versionCode} diverge do contrato=${versionCode}`);
  assert(gradle.applicationId === appPackage, `Gradle applicationId=${gradle.applicationId} diverge do contrato=${appPackage}`);
  assert(fs.existsSync(path.join(root, 'public/css', responsiveCss)), `CSS canônico ausente: public/css/${responsiveCss}`);

  if (!process.exitCode) {
    console.log(`Release contract OK: web=${version} android=${androidVersionName} code=${versionCode} tag=${releaseTag}`);
  }
}

function writeGithubFiles() {
  const pairs = {
    WEB_VERSION: version,
    ANDROID_VERSION_NAME: androidVersionName,
    APP_VERSION_CODE: String(versionCode),
    APP_PACKAGE: appPackage,
    RELEASE_TAG: releaseTag,
    RESPONSIVE_CSS: responsiveCss
  };
  const envFile = process.env.GITHUB_ENV;
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!envFile || !outputFile) {
    fail('GITHUB_ENV/GITHUB_OUTPUT não disponíveis');
    return;
  }
  for (const [key, value] of Object.entries(pairs)) {
    fs.appendFileSync(envFile, `${key}=${value}\n`);
    fs.appendFileSync(outputFile, `${key.toLowerCase()}=${value}\n`);
  }
  console.log(`Resolved release contract: ${JSON.stringify(pairs)}`);
}

const command = process.argv[2] || 'check';
if (command === 'check') check();
else if (command === 'github') {
  check();
  if (!process.exitCode) writeGithubFiles();
} else if (command === 'json') {
  check();
  if (!process.exitCode) console.log(JSON.stringify({ version, androidVersionName, versionCode, appPackage, releaseTag, responsiveCss }, null, 2));
} else {
  fail(`comando desconhecido: ${command}`);
}

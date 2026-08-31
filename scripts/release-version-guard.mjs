#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const RUNTIME_PATHS = Object.freeze([
  'package.json',
  'public',
  'src',
  'wrangler.jsonc',
  'config',
  'android/app/build.gradle'
]);

function runGit(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (!allowFailure && result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} falhou${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

function readVersion() {
  const contract = JSON.parse(fs.readFileSync('config/release-contract.json', 'utf8'));
  const version = String(contract.version || '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`versão inválida no release contract: ${version || '(vazia)'}`);
  }
  return version;
}

function changedRuntimeFiles(baseSha, headSha) {
  const result = runGit(['diff', '--name-only', baseSha, headSha, '--', ...RUNTIME_PATHS]);
  return result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function tagExists(tag) {
  return runGit(['show-ref', '--tags', '--verify', '--quiet', `refs/tags/${tag}`], { allowFailure: true }).status === 0;
}

function runtimeMatches(refA, refB) {
  const result = runGit(['diff', '--quiet', refA, refB, '--', ...RUNTIME_PATHS], { allowFailure: true });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(`não foi possível comparar runtime entre ${refA} e ${refB}`);
}

function main() {
  const baseSha = String(process.env.RELEASE_GUARD_BASE_SHA || process.argv[2] || '').trim();
  const headSha = String(process.env.RELEASE_GUARD_HEAD_SHA || process.argv[3] || 'HEAD').trim();
  if (!baseSha) throw new Error('RELEASE_GUARD_BASE_SHA é obrigatório');

  runGit(['cat-file', '-e', `${baseSha}^{commit}`]);
  runGit(['cat-file', '-e', `${headSha}^{commit}`]);

  const changedFiles = changedRuntimeFiles(baseSha, headSha);
  if (!changedFiles.length) {
    console.log('Release version guard: nenhum arquivo de runtime alterado neste PR; version bump não é necessário.');
    return;
  }

  const version = readVersion();
  const tag = `v${version}`;
  runGit(['fetch', '--tags', '--force']);

  console.log(`Release version guard: runtime alterado (${changedFiles.length} arquivo(s)); validando ${tag}.`);
  console.log(changedFiles.map(file => `  - ${file}`).join('\n'));

  if (!tagExists(tag)) {
    console.log(`Release version guard OK: ${tag} ainda não existe; versão disponível para nova release.`);
    return;
  }

  const tagSha = runGit(['rev-list', '-n', '1', tag]).stdout.trim();
  if (runtimeMatches(tag, headSha)) {
    console.log(`Release version guard OK: ${tag} já existe em ${tagSha}, mas o runtime do PR é idêntico ao runtime canônico.`);
    return;
  }

  console.error(`::error title=Version bump obrigatório::A tag imutável ${tag} já existe em ${tagSha}, mas este PR altera o runtime. Atualize config/release-contract.json e todos os contratos derivados para uma nova versão antes do merge.`);
  console.error(`RELEASE_VERSION_GUARD_ERROR: ${tag} já está ocupado por outro runtime. Version bump obrigatório.`);
  process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`::error title=Release version guard falhou::${String(error?.message || error)}`);
  process.exitCode = 1;
}

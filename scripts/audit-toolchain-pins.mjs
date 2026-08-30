#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const workflowsDir = path.join(root, '.github/workflows');
const errors = [];
const fail = msg => { errors.push(msg); console.error(`ERRO ${msg}`); };
const ok = msg => console.log(`OK  ${msg}`);

const ciModePath = path.join(root, 'config/ci-mode.json');
const ciMode = JSON.parse(fs.readFileSync(ciModePath, 'utf8'));
const degradedMode = ciMode?.mode === 'degraded';

const files = fs.readdirSync(workflowsDir)
  .filter(name => /\.ya?ml$/i.test(name))
  .sort();

for (const name of files) {
  const text = fs.readFileSync(path.join(workflowsDir, name), 'utf8');

  if (/\bruns-on:\s*ubuntu-latest\b/.test(text)) {
    if (degradedMode) {
      ok(`${name}: ubuntu-latest permitido temporariamente no modo degradado`);
    } else {
      fail(`${name}: runner ubuntu-latest não está pinado`);
    }
  }

  if (/\bversion:\s*latest\b/.test(text)) fail(`${name}: ferramenta usa version: latest`);

  if (/uses:\s*actions\/(?:checkout|setup-node|upload-artifact)@v\d+/g.test(text)) {
    fail(`${name}: action oficial usa referência móvel em vez de SHA`);
  }

  if (/uses:\s*supabase\/setup-cli@v\d+/g.test(text)) {
    fail(`${name}: supabase/setup-cli usa referência móvel em vez de SHA`);
  }

  const nodeVersions = [...text.matchAll(/node-version:\s*['"]?([^'"\s]+)['"]?/g)].map(m => m[1]);
  for (const version of nodeVersions) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`${name}: node-version não é exato: ${version}`);
  }
}

const all = files.map(name => fs.readFileSync(path.join(workflowsDir, name), 'utf8')).join('\n');
const supabaseActionSha = '46f7f98c7f948ad727d22c1e67fab04c223a0520';
if (!new RegExp(`supabase/setup-cli@${supabaseActionSha}[\\s\\S]*?version:\\s*2\\.115\\.0`).test(all)) {
  fail('Supabase setup-cli/CLI não estão pinados no SHA de v3.0.0 / CLI 2.115.0');
} else ok('Supabase CLI pinado em 2.115.0 com setup-cli v3.0.0 por SHA');

if (!/wrangler@4\.120\.0\s+deploy/.test(all)) fail('Wrangler de produção não está pinado em 4.120.0');
else ok('Wrangler de produção permanece pinado em 4.120.0');

if (!/@playwright\/test@1\.55\.0/.test(all)) fail('Playwright não está pinado em 1.55.0');
else ok('Playwright pinado em 1.55.0');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.engines?.node !== '22.23.2') fail(`package.json engines.node=${pkg.engines?.node || '(vazio)'}; esperado=22.23.2`);
else ok('Node de desenvolvimento/CI pinado em 22.23.2');

if (errors.length) {
  console.error(`\nAUDITORIA DE TOOLCHAIN REPROVADA: ${errors.length} problema(s).`);
  process.exit(1);
}

console.log(`\nAUDITORIA DE TOOLCHAIN APROVADA: ${files.length} workflows sem referências móveis críticas; runner móvel tolerado apenas no modo degradado.`);

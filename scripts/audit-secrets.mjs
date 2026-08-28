import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root })
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

const dangerousBasenames = new Set([
  '.env',
  '.dev.vars',
  'key.properties',
  'local.properties',
]);

const dangerousExtensions = new Set([
  '.pem', '.key', '.p12', '.pfx', '.jks', '.keystore', '.apk', '.aab',
]);

const secretNamePattern = /(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_PASSWORD|SUPABASE_ACCESS_TOKEN|CLOUDFLARE_API_TOKEN|BACKUP_ENCRYPTION_PASSPHRASE|R2_BACKUP_SECRET_ACCESS_KEY|R2_SECRET_ACCESS_KEY|GITLAB_TOKEN|GITHUB_TOKEN)\s*[:=]\s*["']([^"'$][^"']*)["']/g;

const tokenPatterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----/],
  ['GitHub classic token', /\bghp_[A-Za-z0-9]{30,}\b/],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ['OpenAI-style secret', /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
];

function decodeBase64Url(segment) {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function findServiceRoleJwt(text) {
  const jwtRegex = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
  for (const token of text.match(jwtRegex) || []) {
    try {
      const payload = JSON.parse(decodeBase64Url(token.split('.')[1]));
      if (payload?.role === 'service_role') return true;
    } catch {
      // Ignore invalid JWT-like strings.
    }
  }
  return false;
}

const failures = [];

for (const rel of tracked) {
  const base = path.basename(rel);
  const ext = path.extname(base).toLowerCase();

  if (
    dangerousBasenames.has(base) ||
    /^\.env\./.test(base) ||
    /^\.dev\.vars\./.test(base) ||
    dangerousExtensions.has(ext)
  ) {
    failures.push(`${rel}: arquivo sensível/artefato não deve estar versionado`);
    continue;
  }

  const abs = path.join(root, rel);
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    continue;
  }
  if (!stat.isFile() || stat.size > 2_000_000) continue;

  const data = fs.readFileSync(abs);
  if (data.includes(0)) continue;
  const text = data.toString('utf8');

  for (const [label, pattern] of tokenPatterns) {
    if (pattern.test(text)) failures.push(`${rel}: possível ${label} em texto puro`);
  }

  secretNamePattern.lastIndex = 0;
  if (secretNamePattern.test(text)) {
    failures.push(`${rel}: variável sensível parece receber valor literal`);
  }

  if (findServiceRoleJwt(text)) {
    failures.push(`${rel}: JWT Supabase com role=service_role detectado`);
  }
}

if (failures.length) {
  console.error('Secret audit FAILED:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Secret audit OK: ${tracked.length} arquivos rastreados verificados.`);

import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();

const dangerousBasenames = new Set([
  '.env',
  '.dev.vars',
  'key.properties',
  'local.properties',
]);

const dangerousExtensions = new Set([
  '.pem', '.key', '.p12', '.pfx', '.jks', '.keystore',
]);

const secretNamePattern = /(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_PASSWORD|SUPABASE_ACCESS_TOKEN|CLOUDFLARE_API_TOKEN|BACKUP_ENCRYPTION_PASSPHRASE|R2_BACKUP_SECRET_ACCESS_KEY|R2_SECRET_ACCESS_KEY|GITLAB_TOKEN|GITHUB_TOKEN)\s*[:=]\s*["']([^"'$][^"']*)["']/;

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

function containsServiceRoleJwt(text) {
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

function isDangerousPath(rel) {
  const base = path.basename(rel);
  if (base === '.env.example') return false;
  if (dangerousBasenames.has(base)) return true;
  if (/^\.env\./.test(base)) return true;
  if (/^\.dev\.vars\./.test(base)) return true;
  return dangerousExtensions.has(path.extname(base).toLowerCase());
}

const findings = new Map();
function report(commit, location, label) {
  const key = `${commit}|${location}|${label}`;
  if (!findings.has(key)) findings.set(key, { commit, location, label });
}

const names = execFileSync('git', [
  'log', '--all', '--name-only', '--format=@@COMMIT:%H', '--no-renames',
], { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');

let commit = 'unknown';
for (const rawLine of names.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line) continue;
  if (line.startsWith('@@COMMIT:')) {
    commit = line.slice('@@COMMIT:'.length);
    continue;
  }
  if (isDangerousPath(line)) report(commit, line, 'arquivo sensível historicamente versionado');
}

const patches = execFileSync('git', [
  'log', '--all', '-p', '--no-ext-diff', '--no-renames', '--format=@@COMMIT:%H', '--',
], { cwd: root, maxBuffer: 256 * 1024 * 1024 }).toString('utf8');

commit = 'unknown';
let currentPath = '(unknown path)';
for (const rawLine of patches.split(/\r?\n/)) {
  if (rawLine.startsWith('@@COMMIT:')) {
    commit = rawLine.slice('@@COMMIT:'.length).trim();
    continue;
  }
  if (rawLine.startsWith('+++ b/')) {
    currentPath = rawLine.slice('+++ b/'.length).trim();
    continue;
  }
  if (!rawLine.startsWith('+') || rawLine.startsWith('+++')) continue;

  const added = rawLine.slice(1);
  for (const [label, pattern] of tokenPatterns) {
    if (pattern.test(added)) report(commit, currentPath, label);
  }
  if (secretNamePattern.test(added)) report(commit, currentPath, 'variável sensível com valor literal');
  if (containsServiceRoleJwt(added)) report(commit, currentPath, 'JWT Supabase role=service_role');
}

if (findings.size) {
  console.error(`Historical secret audit FAILED: ${findings.size} achado(s).`);
  for (const finding of findings.values()) {
    console.error(`- ${finding.label} | commit=${finding.commit} | path=${finding.location}`);
  }
  console.error('Nenhum valor de segredo é impresso por esta auditoria. Credenciais afetadas devem ser rotacionadas.');
  process.exit(1);
}

console.log('Historical secret audit OK: nenhum segredo conhecido ou arquivo sensível foi detectado no histórico Git.');

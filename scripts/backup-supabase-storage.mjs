#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '');
const outputRoot = path.resolve(process.env.STORAGE_BACKUP_DIR || 'backups/storage');
const bucketFilter = String(process.env.SUPABASE_STORAGE_BUCKETS || '').split(',').map(x => x.trim()).filter(Boolean);

if (!url || !key) {
  console.log('Storage backup ignorado: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados.');
  process.exit(0);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function request(endpoint, options = {}) {
  const res = await fetch(`${url}${endpoint}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${endpoint} -> ${res.status}: ${await res.text()}`);
  return res;
}

function encodePath(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

async function listBuckets() {
  const data = await (await request('/storage/v1/bucket')).json();
  return Array.isArray(data) ? data : [];
}

async function listPrefix(bucket, prefix = '') {
  const items = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const res = await request(`/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit, offset, sortBy: { column: 'name', order: 'asc' } })
    });
    const page = await res.json();
    if (!Array.isArray(page)) throw new Error(`Resposta inválida ao listar bucket ${bucket}`);
    items.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }
  return items;
}

async function collectObjects(bucket, prefix = '') {
  const entries = await listPrefix(bucket, prefix);
  const objects = [];
  for (const entry of entries) {
    if (!entry?.name) continue;
    const full = prefix ? `${prefix}/${entry.name}` : entry.name;
    // Pastas retornadas pela API de Storage normalmente não possuem id.
    if (!entry.id) objects.push(...await collectObjects(bucket, full));
    else objects.push(full);
  }
  return objects;
}

async function downloadObject(bucket, objectPath) {
  const res = await request(`/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodePath(objectPath)}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const file = path.join(outputRoot, bucket, ...objectPath.split('/'));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
  return { bucket, path: objectPath, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

const buckets = (await listBuckets()).filter(b => !bucketFilter.length || bucketFilter.includes(b.name));
const manifest = { generated_at: new Date().toISOString(), buckets: [], objects: [] };
await fs.mkdir(outputRoot, { recursive: true });

for (const bucket of buckets) {
  const name = bucket.name;
  if (!name) continue;
  const objects = await collectObjects(name);
  manifest.buckets.push({ name, public: Boolean(bucket.public), object_count: objects.length });
  for (const objectPath of objects) manifest.objects.push(await downloadObject(name, objectPath));
}

await fs.writeFile(path.join(outputRoot, 'storage-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Storage backup concluído: ${manifest.objects.length} objeto(s), ${manifest.buckets.length} bucket(s).`);

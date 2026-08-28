#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const vendorDir = path.join(root, 'public', 'vendor');

const assets = [
  ['supabase.js', 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/dist/umd/supabase.js'],
  ['chart.umd.min.js', 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js'],
  ['pdf.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'],
  ['pdf_viewer.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf_viewer.min.js'],
  ['pdf_viewer.min.css', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf_viewer.min.css'],
  ['pdf.worker.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js']
];

await fs.mkdir(vendorDir, { recursive: true });

for (const [name, url] of assets) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Falha ao obter ${name}: HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length < 100) throw new Error(`Asset ${name} veio vazio ou incompleto.`);
  await fs.writeFile(path.join(vendorDir, name), body);
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  console.log(`${name} ${body.length} bytes sha256:${digest}`);
}

console.log('Vendor assets Android preparados em public/vendor.');

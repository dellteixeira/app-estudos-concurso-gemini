#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const indexPath = path.join(root, 'public/index.html');
const auditPath = path.join(root, 'scripts/audit-inline-csp.mjs');
let html = fs.readFileSync(indexPath, 'utf8');
let audit = fs.readFileSync(auditPath, 'utf8');

const countHandlers = text => [...text.matchAll(/\son[a-z]+\s*=\s*["'][^"']*["']/gi)].length;
const before = countHandlers(html);
if (before !== 220) throw new Error(`Baseline inesperado: ${before}; esperado=220`);

const safePath = String.raw`([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)`;
const migrations = [
  { event: 'onclick', attr: 'data-action="call" data-call', pattern: new RegExp(`\\s+onclick="${safePath}\\(\\)"`, 'g') },
  { event: 'onchange', attr: 'data-change-call', pattern: new RegExp(`\\s+onchange="${safePath}\\(\\)"`, 'g') },
  { event: 'oninput', attr: 'data-input-call', pattern: new RegExp(`\\s+oninput="${safePath}\\(\\)"`, 'g') },
  { event: 'onfocus', attr: 'data-focus-call', pattern: new RegExp(`\\s+onfocus="${safePath}\\(\\)"`, 'g') },
  { event: 'ondblclick', attr: 'data-dblclick-call', pattern: new RegExp(`\\s+ondblclick="${safePath}\\(\\)"`, 'g') }
];

let migrated = 0;
for (const migration of migrations) {
  html = html.replace(migration.pattern, (whole, callable) => {
    if (callable === 'event' || callable.startsWith('event.') || callable === 'this' || callable.startsWith('this.')) return whole;
    migrated += 1;
    if (migration.event === 'onclick') return ` data-action="call" data-call="${callable}"`;
    return ` ${migration.attr}="${callable}"`;
  });
}

const after = countHandlers(html);
if (after !== before - migrated) throw new Error(`Contagem inconsistente: antes=${before}, migrados=${migrated}, depois=${after}`);
if (migrated < 35) throw new Error(`Batch 2 migrou apenas ${migrated} handlers; mínimo seguro esperado=35`);

audit = audit.replace('const HANDLER_BUDGET = 220;', `const HANDLER_BUDGET = ${after};`);
if (!audit.includes(`const HANDLER_BUDGET = ${after};`)) throw new Error('Falha ao atualizar HANDLER_BUDGET.');

fs.writeFileSync(indexPath, html);
fs.writeFileSync(auditPath, audit);
console.log(`Batch 2 concluído: handlers ${before} -> ${after} (-${migrated}).`);

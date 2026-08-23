#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const headers = fs.readFileSync(path.join(root, 'public/_headers'), 'utf8');
const errors = [];
const fail = msg => { errors.push(msg); console.error(`ERRO ${msg}`); };
const ok = msg => console.log(`OK  ${msg}`);

const csp = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/mi)?.[1] || '';
if (!csp) fail('Content-Security-Policy ausente em public/_headers');

const scriptSrc = csp.match(/(?:^|;\s*)script-src\s+([^;]+)/)?.[1] || '';
const scriptElem = csp.match(/(?:^|;\s*)script-src-elem\s+([^;]+)/)?.[1] || '';
const scriptAttr = csp.match(/(?:^|;\s*)script-src-attr\s+([^;]+)/)?.[1] || '';

if (scriptSrc.includes("'unsafe-inline'")) fail("script-src ainda permite 'unsafe-inline'");
else ok('script-src sem unsafe-inline');
if (scriptElem.includes("'unsafe-inline'")) fail("script-src-elem ainda permite 'unsafe-inline'");
else ok('script-src-elem sem unsafe-inline');
if (!scriptAttr.includes("'unsafe-inline'")) fail('script-src-attr foi endurecido antes da migração completa dos handlers legados');
else ok('handlers legados isolados somente em script-src-attr');

const inlineScriptBlocks = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .filter(match => match[1].trim().length > 0);
if (inlineScriptBlocks.length) fail(`${inlineScriptBlocks.length} bloco(s) <script> inline encontrados no index`);
else ok('index.html sem blocos script inline executáveis');

const inlineHandlers = [...html.matchAll(/\son[a-z]+\s*=\s*["'][^"']*["']/gi)];
const inlineStyles = [...html.matchAll(/\sstyle\s*=\s*["'][^"']*["']/gi)];

// Baseline endurecido em 2026-08-23. A partir daqui a dívida só pode diminuir.
const HANDLER_BUDGET = 0;
const STYLE_BUDGET = 3;
if (inlineHandlers.length > HANDLER_BUDGET) fail(`handlers inline=${inlineHandlers.length} excedem baseline=${HANDLER_BUDGET}`);
else ok(`handlers inline congelados/reduzidos: ${inlineHandlers.length}/${HANDLER_BUDGET}`);
if (inlineStyles.length > STYLE_BUDGET) fail(`style= inline=${inlineStyles.length} excedem baseline=${STYLE_BUDGET}`);
else ok(`estilos inline congelados/reduzidos: ${inlineStyles.length}/${STYLE_BUDGET}`);

if (!/object-src 'self' blob:/.test(csp)) fail("object-src esperado não está explícito");
if (!/base-uri 'self'/.test(csp)) fail("base-uri 'self' ausente");
if (!/frame-ancestors 'none'/.test(csp)) fail("frame-ancestors 'none' ausente");

if (errors.length) {
  console.error(`\nAUDITORIA CSP REPROVADA: ${errors.length} problema(s).`);
  process.exit(1);
}
console.log('\nAUDITORIA CSP APROVADA: scripts inline de bloco bloqueados e dívida inline não pode crescer.');

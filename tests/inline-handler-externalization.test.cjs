'use strict';
// Contrato da migração integral dos handlers estáticos e dinâmicos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('index não contém handlers de evento inline', () => {
  const html = read('public/index.html');
  assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["']/i);
});

test('app-ui não gera handlers de evento inline dinamicamente', () => {
  const ui = read('public/js/app-ui.js');
  assert.doesNotMatch(ui, /\son[a-z]+\s*=\s*["']/i);
});

test('handlers complexos usam adapters externos sem execução dinâmica', () => {
  const ui = read('public/js/app-ui.js');
  assert.match(ui, /INLINE_HANDLER_ADAPTERS_START/);
  assert.match(ui, /externalizedInlineHandler/);
  assert.match(ui, /element\.addEventListener\(type/);
  assert.match(ui, /adapter\.call\(this, event\)/);
  const adapterBlock = ui.match(/INLINE_HANDLER_ADAPTERS_START[\s\S]*INLINE_HANDLER_ADAPTERS_END/)?.[0] || '';
  assert.doesNotMatch(adapterBlock, /\beval\s*\(|\bnew\s+Function\b/);
});

test('navegação desktop usa metadado semântico em vez de inspecionar onclick', () => {
  const html = read('public/index.html');
  const ui = read('public/js/app-ui.js');
  assert.match(html, /data-tab-target="tab-edital"/);
  assert.match(ui, /btn\.dataset\.tabTarget === tabId/);
  assert.doesNotMatch(ui, /getAttribute\(['"]onclick['"]\)/);
});

test('budget CSP de handlers estáticos é zero', () => {
  const audit = read('scripts/audit-inline-csp.mjs');
  assert.match(audit, /const HANDLER_BUDGET = 0;/);
});

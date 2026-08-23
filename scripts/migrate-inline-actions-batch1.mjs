#!/usr/bin/env node
// Batch 1: migração determinística dos primeiros controles estáticos do index.html.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const indexPath = path.join(root, 'public/index.html');
const auditPath = path.join(root, 'scripts/audit-inline-csp.mjs');
let html = fs.readFileSync(indexPath, 'utf8');
let audit = fs.readFileSync(auditPath, 'utf8');

const countHandlers = text => [...text.matchAll(/\son[a-z]+\s*=\s*["'][^"']*["']/gi)].length;
const before = countHandlers(html);
if (before !== 246) {
  throw new Error(`Baseline inesperado antes do batch 1: ${before}; esperado=246`);
}

const replacements = [
  [/\s+onclick="applyPwaUpdate\(\)"/, ' data-action="pwa-update"'],
  [/\s+onclick="installPwaApp\(\)"/, ' data-action="pwa-install"'],
  [/\s+onclick="dismissPwaBanner\(\)"/, ' data-action="pwa-dismiss"'],
  [/\s+onclick="handleLogin\(\)"/, ' data-action="auth-login"'],
  [/\s+onclick="handleSignUp\(\)"/, ' data-action="auth-signup"'],
  [/\s+onclick="toggleModernTools\(\)"/, ' data-action="toggle-modern-tools"'],
  [/\s+onchange="changeConcurso\(this\.value\)"/, ' data-change-action="change-concurso"'],
  [/\s+onclick="openModalNovoConcurso\(\)"/, ' data-action="new-concurso"'],
  [/\s+onclick="renomearConcursoAtual\(\)"/, ' data-action="rename-concurso"'],
  [/\s+onclick="removerConcursoAtual\(this\)"/, ' data-action="delete-concurso"'],
  [/\s+onclick="openAccountModal\(\)"/, ' data-action="open-account"'],
  [/\s+onclick="toggleDarkMode\(\)"/, ' data-action="toggle-theme"'],
  [/\s+onclick="handleLogout\(\)"/, ' data-action="logout"'],
  [/\s+onclick="openGlobalSearchModal\(\)"/, ' data-action="global-search"'],
  [/\s+onclick="switchTab\('tab-edital', this\)"/, ' data-action="switch-tab" data-tab="tab-edital"'],
  [/\s+onclick="switchTab\('tab-calendario', this\)"/, ' data-action="switch-tab" data-tab="tab-calendario"'],
  [/\s+onclick="switchTab\('tab-biblioteca', this\)"/, ' data-action="switch-tab" data-tab="tab-biblioteca"'],
  [/\s+onclick="switchTab\('tab-flashcards', this\)"/, ' data-action="switch-tab" data-tab="tab-flashcards"'],
  [/\s+onclick="switchTab\('tab-anotacoes', this\)"/, ' data-action="switch-tab" data-tab="tab-anotacoes"'],
  [/\s+onclick="openOpportunityStudyModal\(\)"/, ' data-action="opportunity-study"'],
  [/\s+onclick="editarDataProva\(\)"/, ' data-action="edit-exam-date"'],
  [/\s+onclick="openRetentionMetricDetails\('risk'\)"/, ' data-action="retention-details" data-metric="risk"'],
  [/\s+onclick="openRetentionMetricDetails\('overdue'\)"/, ' data-action="retention-details" data-metric="overdue"'],
  [/\s+onclick="openRetentionMetricDetails\('mastered'\)"/, ' data-action="retention-details" data-metric="mastered"'],
  [/\s+onclick="openRetentionMoreModal\(\)"/, ' data-action="retention-more"']
];

for (const [pattern, replacement] of replacements) {
  const matches = html.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)) || [];
  if (matches.length !== 1) {
    throw new Error(`Alvo deve ocorrer exatamente uma vez (${pattern}); encontrado=${matches.length}`);
  }
  html = html.replace(pattern, replacement);
}

const after = countHandlers(html);
const expected = 221;
if (after !== expected) {
  throw new Error(`Batch 1 reduziu handlers para ${after}; esperado=${expected}`);
}
if (html.includes('onclick="switchTab(')) {
  throw new Error('Navegação principal ainda contém switchTab inline após o batch 1.');
}

audit = audit.replace('const HANDLER_BUDGET = 246;', `const HANDLER_BUDGET = ${expected};`);
if (!audit.includes(`const HANDLER_BUDGET = ${expected};`)) {
  throw new Error('Não foi possível atualizar o budget de handlers CSP.');
}

fs.writeFileSync(indexPath, html);
fs.writeFileSync(auditPath, audit);
console.log(`Batch 1 concluído: handlers ${before} -> ${after} (-${before - after}).`);

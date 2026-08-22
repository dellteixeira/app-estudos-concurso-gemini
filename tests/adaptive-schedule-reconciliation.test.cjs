const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const reconciliation = read('public/js/adaptive-schedule-reconciliation.js');
const loader = read('public/js/pdf/pdf-library-ordering.js');
const sw = read('public/sw.js');

test('módulo adaptativo possui sintaxe JavaScript válida', () => {
  const result = spawnSync(process.execPath, ['--check', path.join(root, 'public/js/adaptive-schedule-reconciliation.js')], { encoding:'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('cronograma reagendado prevalece sobre nextReviewAt antigo para cálculo de atraso', () => {
  assert.match(reconciliation, /effectiveNext/);
  assert.match(reconciliation, /pendingFuture/);
  assert.match(reconciliation, /effectiveNext < validPending/);
  assert.match(reconciliation, /overdue:\s*ctx\.overdue/);
  assert.match(reconciliation, /nextAt:ctx\.effectiveNext/);
});

test('assunto pendente futuro não entra no diagnóstico antes do início real do novo ciclo', () => {
  assert.match(reconciliation, /getCycleAnchor/);
  assert.match(reconciliation, /firstStudyAt/);
  assert.match(reconciliation, /isMeaningfulStudySession/);
  assert.match(reconciliation, /StudyDomain\.getSessionMinutes/);
  assert.match(reconciliation, /dormantPending/);
  assert.match(reconciliation, /if\(ctx\.dormantPending\)return null/);
});

test('itens antigos pendentes redistribuídos são removidos do passado sem apagar concluídos', () => {
  assert.match(reconciliation, /compactPastRedistributedPending/);
  assert.match(reconciliation, /futureTopics/);
  assert.match(reconciliation, /if\(s\.done\)return true/);
  assert.match(reconciliation, /futureTopics\.has\(s\.cleanTop\)/);
});

test('geradores de cronograma e reorganização passam pela reconciliação adaptativa', () => {
  assert.match(reconciliation, /gerarCronogramaInteligente/);
  assert.match(reconciliation, /gerarCronogramaMetodo2/);
  assert.match(reconciliation, /reorganizarMateriasCronograma/);
  assert.match(reconciliation, /reconcileAfterScheduleGeneration/);
  assert.match(reconciliation, /adaptiveScheduleAnchor/);
});

test('reconciliação é instalada somente após o carregamento do aplicativo', () => {
  assert.match(reconciliation, /document\.readyState==='complete'/);
  assert.match(reconciliation, /addEventListener\('load'/);
  assert.match(reconciliation, /typeof renderRetentionDiagnostics!==['"]function['"]/);
  assert.match(loader, /adaptive-schedule-reconciliation\.js/);
});

test('reconciliação faz parte do app shell offline', () => {
  assert.match(sw, /\.\/js\/adaptive-schedule-reconciliation\.js/);
  assert.match(sw, /\/js\/adaptive-schedule-reconciliation\.js/);
});

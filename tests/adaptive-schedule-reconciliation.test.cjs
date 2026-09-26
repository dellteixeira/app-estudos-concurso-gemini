const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// O cache-buster dinâmico deve acompanhar a versão canônica de package.json.
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const reconciliation = read('public/js/adaptive-schedule-reconciliation.js');
const appCore = read('public/js/app-core.js');
const pwa = read('public/js/app-pwa.js');
const sw = read('public/sw.js');
const packageVersion = JSON.parse(read('package.json')).version;
const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('módulo adaptativo possui sintaxe JavaScript válida', () => {
  const result = spawnSync(process.execPath, ['--check', path.join(root, 'public/js/adaptive-schedule-reconciliation.js')], { encoding:'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('separa necessidade cognitiva de revisão vencida no cronograma', () => {
  assert.match(reconciliation, /retentionNextAt/);
  assert.match(reconciliation, /retentionDue/);
  assert.match(reconciliation, /retentionDueDays/);
  assert.match(reconciliation, /scheduledPending/);
  assert.match(reconciliation, /scheduledOverdue/);
  assert.match(reconciliation, /scheduledOverdueDays/);
  assert.match(reconciliation, /overdue:ctx\.scheduledOverdue/);
  assert.match(reconciliation, /const overdue=rows\.filter\(row=>row\.scheduledOverdue\)/);
});

test('cronograma futuro pode prevalecer sobre nextReviewAt cognitivo sem apagar o sinal do cérebro', () => {
  assert.match(reconciliation, /effectiveNext/);
  assert.match(reconciliation, /pendingFuture/);
  assert.match(reconciliation, /effectiveNext < validPending/);
  assert.match(reconciliation, /retentionNextAt:ctx\.retentionNextAt/);
  assert.match(reconciliation, /nextAt:ctx\.scheduledPending\?ctx\.pendingDate:ctx\.effectiveNext/);
});

test('assunto pendente futuro não entra no diagnóstico antes do início real do novo ciclo', () => {
  assert.match(reconciliation, /getCycleAnchor/);
  assert.match(reconciliation, /firstStudyAt/);
  assert.match(reconciliation, /isMeaningfulStudySession/);
  assert.match(reconciliation, /StudyDomain\.getSessionMinutes/);
  assert.match(reconciliation, /dormantPending/);
  assert.match(reconciliation, /if\(ctx\.dormantPending\)return null/);
});

test('risco cognitivo é preservado mesmo sem revisão agendada vencida', () => {
  assert.match(reconciliation, /row\.retention<70\|\|row\.retentionDue\|\|row\.scheduledOverdue/);
  assert.match(reconciliation, /cognitiveDueSignal/);
  assert.match(reconciliation, /scheduledDelaySignal/);
  assert.match(reconciliation, /mastered=rows\.filter\(row=>row\.retention>=85&&!row\.retentionDue&&!row\.scheduledOverdue/);
});

test('itens antigos pendentes redistribuídos são removidos do passado sem apagar concluídos', () => {
  assert.match(reconciliation, /compactPastRedistributedPending/);
  assert.match(reconciliation, /futureTopics/);
  assert.match(reconciliation, /if\(s\.done\)return true/);
  assert.match(reconciliation, /futureTopics\.has\(s\.cleanTop\)/);
});

test('geração, reorganização e limpeza passam pela mesma reconciliação de mutação', () => {
  assert.match(reconciliation, /reconcileAfterScheduleMutation/);
  assert.match(reconciliation, /wrapScheduleMutation/);
  assert.match(reconciliation, /gerarCronogramaInteligente/);
  assert.match(reconciliation, /gerarCronogramaMetodo2/);
  assert.match(reconciliation, /reorganizarMateriasCronograma/);
  assert.match(reconciliation, /limparCronogramaMesAtual/);
  assert.match(reconciliation, /\{cleared:true,compact:false\}/);
  assert.match(reconciliation, /delete contest\.adaptiveScheduleAnchor/);
});

test('reconciliação atualiza calendário, diagnóstico, overview e IA contextual', () => {
  assert.match(reconciliation, /renderMonthCalendar\(\)/);
  assert.match(reconciliation, /renderDelayedPanel\(\)/);
  assert.match(reconciliation, /renderRetentionDiagnostics\(\)/);
  assert.match(reconciliation, /updateModernOverview\(\)/);
  assert.match(reconciliation, /AppLearningAdvisor\?\.refresh/);
});

test('reconciliação é carregada pelo núcleo PWA sem depender da Biblioteca PDF', () => {
  assert.match(reconciliation, /typeof renderRetentionDiagnostics!==['"]function['"]/);
  assert.match(pwa, /loadAdaptiveScheduleReconciliation/);
  assert.match(pwa, new RegExp(`adaptive-schedule-reconciliation\\.js\\?v=${escapeRegex(packageVersion)}`));
  assert.match(pwa, /data-adaptive-schedule-reconciliation/);
  assert.doesNotMatch(pwa, /pdf-library-ordering/);
});

test('reconciliação faz parte do app shell offline', () => {
  assert.match(sw, /\.\/js\/adaptive-schedule-reconciliation\.js/);
  assert.match(sw, /\/js\/adaptive-schedule-reconciliation\.js/);
});


test('recomendação por retenção não é rotulada como cronograma vencido sem scheduledOverdue', () => {
  assert.match(appCore, /const scheduledOverdue = !!scheduleContext\?\.scheduledOverdue/);
  assert.match(appCore, /scheduledOverdue\s*\? 'Revisão vencida no cronograma'/);
  assert.match(appCore, /due \? 'Revisão recomendada pelo nível de retenção'/);
  assert.doesNotMatch(appCore, /Revisão vencida ou prevista para agora/);
});

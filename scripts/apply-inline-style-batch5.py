from pathlib import Path

INDEX = Path('public/index.html')
raw = INDEX.read_bytes()
replacements = [
    (b'<div style="background: rgba(0,0,0,0.25); padding: 1.2rem; border-radius: 8px; border: 1px solid var(--primary-blue); margin-bottom: 1.5rem;">', b'<div class="flashcard-bulk-import">'),
    (b'<p style="font-size: 0.85rem; opacity: 0.9; margin-bottom: 10px;">Escolha a mat\xc3\xa9ria e o assunto que receber\xc3\xa3o os cart\xc3\xb5es e cole o conte\xc3\xbado em lote.</p>', b'<p class="flashcard-bulk-help">Escolha a mat\xc3\xa9ria e o assunto que receber\xc3\xa3o os cart\xc3\xb5es e cole o conte\xc3\xbado em lote.</p>'),
    (b'<div class="flashcard-bulk-targets" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;">', b'<div class="flashcard-bulk-targets">'),
    (b'<select id="fcMateriaSelect" data-change-call="updateFcAssuntoOptions" style="flex:1; min-width: 180px;">', b'<select id="fcMateriaSelect" class="flashcard-bulk-select" data-change-call="updateFcAssuntoOptions">'),
    (b'<select id="fcAssuntoSelect" style="flex:1; min-width: 180px;">', b'<select id="fcAssuntoSelect" class="flashcard-bulk-select">'),
    (b'<textarea id="fcPasteTextArea" placeholder="P: Qual o prazo do recurso?&#10;R: 15 dias \xc3\xbateis&#10;&#10;Qual a capital do Cear\xc3\xa1?; Fortaleza" style="min-height: 120px; font-family: monospace; font-size: 0.88rem; margin-bottom: 10px;"></textarea>', b'<textarea id="fcPasteTextArea" class="flashcard-bulk-textarea" placeholder="P: Qual o prazo do recurso?&#10;R: 15 dias \xc3\xbateis&#10;&#10;Qual a capital do Cear\xc3\xa1?; Fortaleza"></textarea>'),
    (b'<div style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap:wrap; gap:10px;">\r\n                    <h4 style="color: var(--header-materia-text); display: flex; align-items: center; gap: 8px; margin:0;">', b'<div class="flashcard-anki-header">\r\n                    <h4 class="flashcard-anki-title">'),
    (b'<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">\r\n                        <button class="btn btn-secondary btn-sm" type="button" data-action="call" data-call="exportAllFlashcards"', b'<div class="flashcard-anki-actions">\r\n                        <button class="btn btn-secondary btn-sm" type="button" data-action="call" data-call="exportAllFlashcards"'),
    (b'<p id="pdfLinkDocumentTitle" style="opacity:.8"></p>', b'<p id="pdfLinkDocumentTitle" class="pdf-link-document-title"></p>'),
    (b'<div class="modal-overlay" id="modalBackupManager" style="z-index:1350;">', b'<div class="modal-overlay modal-backup-manager" id="modalBackupManager">'),
    (b'<div class="modal" style="max-width:760px;">\r\n            <h3>Backup e Recupera\xc3\xa7\xc3\xa3o Local</h3>', b'<div class="modal backup-manager-dialog">\r\n            <h3>Backup e Recupera\xc3\xa7\xc3\xa3o Local</h3>'),
    (b'<div class="modal-actions" style="justify-content:space-between; flex-wrap:wrap;">\r\n                <button class="btn btn-success" type="button" data-action="call" data-call="createBackupNow">', b'<div class="modal-actions backup-manager-actions">\r\n                <button class="btn btn-success" type="button" data-action="call" data-call="createBackupNow">'),
    (b'<p style="font-size:0.9rem; opacity:0.85;">Selecione como prefere planejar sua rotina de estudos:</p>', b'<p class="schedule-method-help">Selecione como prefere planejar sua rotina de estudos:</p>'),
    (b'<div style="display:flex; flex-direction:column; gap:12px; margin: 10px 0;">', b'<div class="schedule-method-options">'),
    (b'<div class="form-group" style="background: rgba(59, 130, 246, 0.1); border: 1px solid var(--primary-blue); padding: 1rem; border-radius: 8px;">\r\n                <label><strong>Data de In\xc3\xadcio do Cronograma:</strong></label>\r\n                <input type="date" id="m2DataInicio">', b'<div class="form-group schedule-start-card">\r\n                <label><strong>Data de In\xc3\xadcio do Cronograma:</strong></label>\r\n                <input type="date" id="m2DataInicio">'),
    (b'<select id="m2RevisionStrategy" style="width:100%;">', b'<select id="m2RevisionStrategy" class="form-control-full">'),
    (b'<p style="font-size:0.9rem; opacity:0.85;">\r\n                Configure seus hor\xc3\xa1rios de estudo. O sistema alocar\xc3\xa1 <strong>100% dos t\xc3\xb3picos organizados por PRIORIDADE</strong>.\r\n            </p>', b'<p class="schedule-method-help">\r\n                Configure seus hor\xc3\xa1rios de estudo. O sistema alocar\xc3\xa1 <strong>100% dos t\xc3\xb3picos organizados por PRIORIDADE</strong>.\r\n            </p>'),
    (b'<div class="form-group" style="background: rgba(59, 130, 246, 0.1); border: 1px solid var(--primary-blue); padding: 1rem; border-radius: 8px;">\r\n                <label><strong>Data de In\xc3\xadcio do Cronograma:</strong></label>\r\n                <input type="date" id="cfgDataInicio">', b'<div class="form-group schedule-start-card">\r\n                <label><strong>Data de In\xc3\xadcio do Cronograma:</strong></label>\r\n                <input type="date" id="cfgDataInicio">'),
    (b'<input type="number" id="cfgManhaQtd" value="1" min="0" max="12" style="width:70px;">', b'<input type="number" id="cfgManhaQtd" class="schedule-hours-input" value="1" min="0" max="12">'),
    (b'<input type="number" id="cfgTardeQtd" value="1" min="0" max="12" style="width:70px;">', b'<input type="number" id="cfgTardeQtd" class="schedule-hours-input" value="1" min="0" max="12">'),
    (b'<input type="number" id="cfgNoiteQtd" value="1" min="0" max="12" style="width:70px;">', b'<input type="number" id="cfgNoiteQtd" class="schedule-hours-input" value="1" min="0" max="12">'),
    (b'<div style="display:flex; gap:1.5rem; flex-wrap:wrap;">\r\n                <label><input type="checkbox" id="cfgIncluirSabado" checked> Incluir S\xc3\xa1bado</label>', b'<div class="schedule-weekend-options">\r\n                <label><input type="checkbox" id="cfgIncluirSabado" checked> Incluir S\xc3\xa1bado</label>'),
    (b'<select id="m1RevisionStrategy" style="width:100%;">', b'<select id="m1RevisionStrategy" class="form-control-full">'),
]

for old, new in replacements:
    count = raw.count(old)
    if count != 1:
        raise SystemExit(f'index target count={count}, expected 1: {old[:120]!r}')
    raw = raw.replace(old, new, 1)

INDEX.write_bytes(raw)

css_path = Path('public/css/base.css')
css = css_path.read_text(encoding='utf-8')
marker = '/* INLINE_STYLE_BATCH5_AUXILIARY_COMPONENTS */'
block = '''\n\n/* INLINE_STYLE_BATCH5_AUXILIARY_COMPONENTS */
.flashcard-bulk-import { background: rgba(0,0,0,.25); padding: 1.2rem; border-radius: 8px; border: 1px solid var(--primary-blue); margin-bottom: 1.5rem; }
.flashcard-bulk-help { font-size: .85rem; opacity: .9; margin-bottom: 10px; }
.flashcard-bulk-targets { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.flashcard-bulk-select { flex: 1; min-width: 180px; }
.flashcard-bulk-textarea { min-height: 120px; font-family: monospace; font-size: .88rem; margin-bottom: 10px; }
.flashcard-anki-header { margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.flashcard-anki-title { color: var(--header-materia-text); display: flex; align-items: center; gap: 8px; margin: 0; }
.flashcard-anki-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pdf-link-document-title { opacity: .8; }
.modal-backup-manager { z-index: 1350; }
.backup-manager-dialog { max-width: 760px; }
.backup-manager-actions { justify-content: space-between; flex-wrap: wrap; }
.schedule-method-help { font-size: .9rem; opacity: .85; }
.schedule-method-options { display: flex; flex-direction: column; gap: 12px; margin: 10px 0; }
.schedule-start-card { background: rgba(59,130,246,.1); border: 1px solid var(--primary-blue); padding: 1rem; border-radius: 8px; }
.form-control-full { width: 100%; }
.schedule-hours-input { width: 70px; }
.schedule-weekend-options { display: flex; gap: 1.5rem; flex-wrap: wrap; }
'''
if marker in css:
    raise SystemExit('batch5 CSS marker already exists')
css_path.write_text(css.rstrip() + block + '\n', encoding='utf-8')

audit_path = Path('scripts/audit-inline-csp.mjs')
audit = audit_path.read_text(encoding='utf-8')
if 'const STYLE_BUDGET = 68;' not in audit:
    raise SystemExit('expected STYLE_BUDGET 68 not found')
audit_path.write_text(audit.replace('const STYLE_BUDGET = 68;', 'const STYLE_BUDGET = 45;', 1), encoding='utf-8')

test_path = Path('tests/inline-style-batch5.test.cjs')
test_path.write_text("""'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');

test('batch5 reduces static inline-style budget from 68 to 45',()=>{
  const html=read('public/index.html');
  assert.equal((html.match(/\\sstyle\\s*=\\s*[\"']/gi)||[]).length,45);
  assert.match(read('scripts/audit-inline-csp.mjs'),/const STYLE_BUDGET = 45;/);
});

test('batch5 auxiliary targets use semantic classes',()=>{
  const html=read('public/index.html');
  for(const cls of ['flashcard-bulk-import','flashcard-bulk-help','flashcard-bulk-targets','flashcard-bulk-select','flashcard-bulk-textarea','flashcard-anki-header','flashcard-anki-title','flashcard-anki-actions','pdf-link-document-title','modal-backup-manager','backup-manager-dialog','backup-manager-actions','schedule-method-help','schedule-method-options','schedule-start-card','form-control-full','schedule-hours-input','schedule-weekend-options']){
    assert.match(html,new RegExp(`\\\\b${cls}\\\\b`),`missing .${cls}`);
  }
});

test('batch5 migrated component CSS preserves presentation',()=>{
  const css=read('public/css/base.css');
  assert.match(css,/\\.flashcard-bulk-import\\s*\\{[^}]*background:[^}]*padding:\\s*1\\.2rem;/);
  assert.match(css,/\\.flashcard-bulk-select\\s*\\{[^}]*flex:\\s*1;[^}]*min-width:\\s*180px;/);
  assert.match(css,/\\.backup-manager-dialog\\s*\\{\\s*max-width:\\s*760px;/);
  assert.match(css,/\\.schedule-start-card\\s*\\{[^}]*border:\\s*1px solid var\\(--primary-blue\\);/);
  assert.match(css,/\\.schedule-hours-input\\s*\\{\\s*width:\\s*70px;/);
});
""",encoding='utf-8')

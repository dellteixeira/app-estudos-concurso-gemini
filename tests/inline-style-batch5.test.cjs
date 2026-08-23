'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');

test('batch5 keeps inline-style debt at or below 44',()=>{
  const html=read('public/index.html');
  assert.ok((html.match(/\sstyle\s*=\s*["']/gi)||[]).length <= 44);
});

test('batch5 auxiliary targets use semantic classes',()=>{
  const html=read('public/index.html');
  for(const cls of ['flashcard-bulk-import','flashcard-bulk-help','flashcard-bulk-targets','flashcard-bulk-select','flashcard-bulk-textarea','flashcard-anki-header','flashcard-anki-title','flashcard-anki-actions','pdf-link-document-title','modal-backup-manager','backup-manager-dialog','backup-manager-actions','schedule-method-help','schedule-method-options','schedule-start-card','form-control-full','schedule-hours-input','schedule-weekend-options']){
    assert.match(html,new RegExp(`\\b${cls}\\b`),`missing .${cls}`);
  }
});

test('batch5 migrated component CSS preserves presentation',()=>{
  const css=read('public/css/base.css');
  assert.match(css,/\.flashcard-bulk-import\s*\{[^}]*background:[^}]*padding:\s*1\.2rem;/);
  assert.match(css,/\.flashcard-bulk-select\s*\{[^}]*flex:\s*1;[^}]*min-width:\s*180px;/);
  assert.match(css,/\.backup-manager-dialog\s*\{\s*max-width:\s*760px;/);
  assert.match(css,/\.schedule-start-card\s*\{[^}]*border:\s*1px solid var\(--primary-blue\);/);
  assert.match(css,/\.schedule-hours-input\s*\{\s*width:\s*70px;/);
});

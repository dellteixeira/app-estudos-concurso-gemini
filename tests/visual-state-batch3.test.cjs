'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');

test('batch3 removes seven static inline visual states',()=>{
  const html=read('public/index.html');
  const ids=['authStatusMessage','superUserBadge','customDailyHoursPanel','notaTituloCustomGroup','btnDownloadEdital','btnRemoveEdital','modalPdfNoteEditor'];
  assert.equal((html.match(/\sstyle\s*=\s*["']/gi)||[]).length,75);
  for(const id of ids){
    const tag=html.match(new RegExp(`<[^>]+\bid=["']${id}["'][^>]*>`,`i`))?.[0]||'';
    assert.ok(tag,`missing #${id}`);
    assert.match(tag,/\shidden(?:\s|>|=)/i);
    assert.doesNotMatch(tag,/\sstyle\s*=/i);
  }
});

test('batch3 JS uses semantic visibility',()=>{
  const ai=read('public/js/app-ai.js'), core=read('public/js/app-core.js'), reader=read('public/js/pdf/pdf-reader.js'), domain=read('public/js/study-domain.js');
  assert.doesNotMatch(ai,/btn(?:Download|Remove)\.style\.display/);
  assert.doesNotMatch(ai,/badge\.style\.display|status\.style\.display/);
  assert.doesNotMatch(core,/titleGroup\.style\.display/);
  assert.doesNotMatch(reader,/modalPdfNoteEditor[^\n]{0,120}style\.display/);
  assert.doesNotMatch(domain,/box\.style\.(?:display|background|borderColor|color)/);
});

test('semantic CSS preserves visual modes',()=>{
  const base=read('public/css/base.css'), pdf=read('public/css/pdf-reader.css');
  assert.match(base,/\.auth-status-message\s*\{/);
  assert.match(base,/\.auth-status-message\.is-error\s*\{/);
  assert.match(base,/\.super-user-badge\.is-open\s*\{\s*display:\s*inline-block;/);
  assert.match(pdf,/\.pdf-note-modal\.is-open\{display:flex\}/);
});

'use strict';
// PR #191: visual-state inline-style hardening gate.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');

test('state-style batch keeps historical 85 to 82 contract while later batches may reduce further',()=>{
  const html=read('public/index.html');
  const budget=JSON.parse(read('security/inline-style-state-budget.json'));
  const count=(html.match(/\sstyle\s*=\s*["']/gi)||[]).length;
  assert.equal(budget.baseline,85);
  assert.equal(budget.budget,82);
  assert.equal(budget.migrated,3);
  assert.ok(count <= budget.budget,`current inline styles ${count} must not exceed historical budget ${budget.budget}`);
});

test('permanently hidden file inputs use native hidden attribute',()=>{
  const html=read('public/index.html');
  for(const id of ['jsonInput','flashcardsImportFile','editalFileInput']){
    const tag=html.match(new RegExp(`<input[^>]*\\bid=["']${id}["'][^>]*>`,`i`))?.[0] || '';
    assert.ok(tag,`missing #${id}`);
    assert.match(tag,/\shidden(?:\s|>|=)/i,`#${id} must use hidden`);
    assert.doesNotMatch(tag,/\sstyle\s*=/i,`#${id} must not use inline style`);
  }
});

test('state-style batch does not reintroduce inline event handlers',()=>{
  const html=read('public/index.html');
  const ui=read('public/js/app-ui.js');
  assert.doesNotMatch(html,/\son[a-z]+\s*=\s*["']/i);
  assert.doesNotMatch(ui,/\son[a-z]+\s*=\s*["']/i);
});

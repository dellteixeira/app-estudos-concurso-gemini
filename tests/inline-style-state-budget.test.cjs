'use strict';
// PR #191: visual-state inline-style hardening gate.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');

test('state-style batch reduces inline-style budget below 85',()=>{
  const budget=JSON.parse(read('security/inline-style-state-budget.json'));
  assert.equal(budget.baseline,85);
  assert.ok(budget.budget < 85, `expected budget < 85, got ${budget.budget}`);
  assert.ok(budget.migrated > 0);
});

test('state-style batch does not reintroduce inline event handlers',()=>{
  const html=read('public/index.html');
  const ui=read('public/js/app-ui.js');
  assert.doesNotMatch(html,/\son[a-z]+\s*=\s*["']/i);
  assert.doesNotMatch(ui,/\son[a-z]+\s*=\s*["']/i);
});

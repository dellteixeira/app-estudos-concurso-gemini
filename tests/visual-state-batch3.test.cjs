'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');

test('batch3 plan preserves inline-style baseline contract',()=>{
  const plan=JSON.parse(read('security/visual-state-batch3-plan.json'));
  assert.equal(plan.baselineInlineStyles,82);
  assert.ok(Array.isArray(plan.targets));
  assert.ok(plan.targets.length>=7);
});

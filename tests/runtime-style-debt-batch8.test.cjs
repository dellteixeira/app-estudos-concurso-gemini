'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=fs.readFileSync('public/js/app-core.js','utf8');
const ui=fs.readFileSync('public/js/app-ui.js','utf8');
const css=fs.readFileSync('public/css/base.css','utf8');
const budget=JSON.parse(fs.readFileSync('security/runtime-style-debt.json','utf8'));

test('runtime display mutations are reduced and guarded',()=>{
  assert.match(core,/RUNTIME_STYLE_DEBT_BATCH8/);
  assert.match(core,/function setRuntimeDisplay/);
  assert.ok(budget.migratedDisplay.core + budget.migratedDisplay.ui > 0);
  assert.equal((core.match(/\.style\.display\b/g)||[]).length,budget.remaining.coreStyleDisplay);
  assert.equal((ui.match(/\.style\.display\b/g)||[]).length,budget.remaining.uiStyleDisplay);
});

test('dynamic percentage bars use bounded classes instead of style.width in migrated UI',()=>{
  assert.match(core,/function setProgressWidthClass/);
  assert.match(css,/\.u-progress-w-100\{width:100%\}/);
  assert.doesNotMatch(ui,/retention-risk-progress[^\n]*style=/);
  assert.doesNotMatch(core,/topic-plan-progress[^\n]*style=/);
});

test('known static runtime template styles are externalized',()=>{
  assert.match(css,/\.backup-slot-reason\{opacity:\.7\}/);
  assert.match(core,/class=\"backup-slot-reason\"/);
  assert.match(ui,/global-search-empty/);
});

test('pass2 removes remaining display mutation and known generated style attributes',()=>{
  const budget2=JSON.parse(fs.readFileSync('security/runtime-style-debt.json','utf8'));
  assert.equal(budget2.remaining.coreStyleDisplay,0);
  assert.equal(budget2.remaining.uiStyleDisplay,0);
  assert.equal(budget2.remaining.uiTemplateStyle,0);
  assert.ok(budget2.remaining.coreTemplateStyle < 15);
  assert.match(css,/RUNTIME_STYLE_DEBT_BATCH8_PASS2/);
});

test('final budget keeps generated UI style attributes at zero',()=>{
  const finalBudget=JSON.parse(fs.readFileSync('security/runtime-style-debt.json','utf8'));
  assert.equal(finalBudget.remaining.coreStyleDisplay,0);
  assert.equal(finalBudget.remaining.uiStyleDisplay,0);
  assert.equal(finalBudget.remaining.coreTemplateStyle,0);
  assert.equal(finalBudget.remaining.uiTemplateStyle,0);
  assert.equal(finalBudget.remaining.coreSetProperty,0);
  assert.equal(finalBudget.remaining.uiSetProperty,0);
  assert.equal(finalBudget.migratedDisplay.core,55);
  assert.deepEqual(finalBudget.geometryExceptions[0].properties,['width','left','top']);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');

test('UI exposes semantic visual-state helper',()=>{
  const ui=read('public/js/app-ui.js');
  assert.match(ui,/function setVisualState\(element, visible\)/);
  assert.match(ui,/const isVisible = Boolean\(visible\)/);
  assert.match(ui,/classList\.toggle\('is-open', isVisible\)/);
  assert.match(ui,/element\.hidden = !isVisible/);
  assert.match(ui,/setAttribute\('aria-hidden', visible \? 'false' : 'true'\)/);
});

test('modal overlay has semantic open state',()=>{
  const css=read('public/css/base.css');
  assert.match(css,/\.modal-overlay\.is-open\s*\{\s*display:\s*flex;\s*\}/);
});

test('migrated app-ui modals do not mutate style.display',()=>{
  const ui=read('public/js/app-ui.js');
  for(const id of ['modalMobileEditalField','modalGlobalSearch','modalLayeredReview','modalRetentionMetricDetails','modalRetentionMore']){
    const escaped=id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    assert.doesNotMatch(ui,new RegExp(`${escaped}[^\\n]{0,500}style\\.display`));
  }
});

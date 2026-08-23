'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');

test('batch4 reduces static inline-style budget from 75 to 68',()=>{
  const html=read('public/index.html');
  assert.equal((html.match(/\sstyle\s*=\s*["']/gi)||[]).length,68);
  const audit=read('scripts/audit-inline-csp.mjs');
  assert.match(audit,/const STYLE_BUDGET = 68;/);
});

test('batch4 static targets use semantic classes instead of style attributes',()=>{
  const html=read('public/index.html');
  const targets=[
    ['email','auth-field auth-field-spaced'],
    ['password','auth-field'],
    ['studyActivityDistribution','study-activity-distribution']
  ];
  for(const [id,className] of targets){
    const marker=`id="${id}"`;
    const pos=html.indexOf(marker);
    assert.ok(pos>=0,`missing #${id}`);
    const start=html.lastIndexOf('<',pos);
    const end=html.indexOf('>',pos);
    const tag=html.slice(start,end+1);
    assert.doesNotMatch(tag,/\sstyle\s*=/i,`#${id} still has inline style`);
    for(const token of className.split(/\s+/)) assert.match(tag,new RegExp(`\\b${token}\\b`));
  }
  assert.match(html,/<div class="auth-action-row">/);
  assert.match(html,/<th class="edital-priority-column">Prioridade<\/th>/);
  assert.match(html,/<div class="notes-section-header">/);
  assert.match(html,/<div class="flashcards-header">/);
});

test('batch4 CSS preserves migrated presentation',()=>{
  const css=read('public/css/base.css');
  assert.match(css,/\.auth-field\s*\{\s*width:\s*100%;\s*\}/);
  assert.match(css,/\.auth-action-row\s*\{[^}]*display:\s*flex;[^}]*gap:\s*\.5rem;/);
  assert.match(css,/\.study-activity-distribution\s*\{[^}]*margin-top:\s*12px;[^}]*font-size:\s*\.78rem;[^}]*opacity:\s*\.8;/);
  assert.match(css,/\.edital-priority-column\s*\{\s*width:\s*90px;/);
  assert.match(css,/\.notes-section-header\s*\{[^}]*margin-bottom:\s*1\.5rem;/);
  assert.match(css,/\.flashcards-header\s*\{[^}]*margin-bottom:\s*1rem;/);
});

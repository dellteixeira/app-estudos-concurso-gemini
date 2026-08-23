'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');

test('HTML source has zero inline style attributes',()=>{
  const html=read('public/index.html');
  assert.equal((html.match(/\sstyle\s*=\s*["']/gi)||[]).length,0);
  assert.match(read('scripts/audit-inline-csp.mjs'),/const STYLE_BUDGET = 0;/);
});

test('remaining visibility states use semantic hidden state',()=>{
  const html=read('public/index.html');
  for(const id of ['btnResetFcFilter','appPromptHelp']){
    const tag=html.match(new RegExp(`<[^>]+id=["']${id}["'][^>]*>`,'i'))?.[0]||'';
    assert.ok(tag,`${id} missing`);
    assert.match(tag,/\shidden(?:\s|>|$)/i,`${id} should start hidden`);
    assert.doesNotMatch(tag,/\sstyle=/i,`${id} must not use inline style`);
  }
  const core=read('public/js/app-core.js');
  assert.match(core,/setVisualState\(btnReset, Boolean\(activeFcMateriaFilter \|\| activeFcAssuntoFilter\)\)/);
  assert.match(core,/setVisualState\(help, Boolean\(options\.help\)\)/);
});

test('Pomodoro progress is class-based and does not write style properties',()=>{
  const html=read('public/index.html');
  const ring=html.match(/<div[^>]+id=["']pomodoroRing["'][^>]*>/i)?.[0]||'';
  assert.match(ring,/pomodoro-progress-0/);
  assert.doesNotMatch(ring,/\sstyle=/i);
  const core=read('public/js/app-core.js');
  assert.match(core,/const progressClass = `pomodoro-progress-\$\{progressPercent\}`/);
  assert.doesNotMatch(core,/ringEl\.style\.setProperty\(['"]--timer-(?:progress|accent)/);
  const css=read('public/css/base.css');
  assert.match(css,/INLINE_STYLE_RUNTIME_ZERO/);
  assert.match(css,/\.pomodoro-progress-0\s*\{\s*--timer-progress:\s*0\.00;/);
  assert.match(css,/\.pomodoro-progress-100\s*\{\s*--timer-progress:\s*1\.00;/);
  assert.match(css,/\.pomodoro-ring\[data-mode=["']focus["']\]/);
});

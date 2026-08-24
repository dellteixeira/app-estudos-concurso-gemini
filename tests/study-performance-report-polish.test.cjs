const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=fs.readFileSync('public/js/study-performance-report-core.js','utf8');
const loader=fs.readFileSync('public/js/study-performance-report.js','utf8');

test('legend swatches are vertically aligned with their text baseline',()=>{
  assert.match(core,/rect\(p,MX\+7,p\.cursor-1,9,9,m\.color\)/);
  assert.doesNotMatch(core,/rect\(p,MX,p\.cursor-6,8,8,m\.color\)/);
});

test('report has stronger manual-aligned visual hierarchy',()=>{
  assert.match(core,/REPORT_MANUAL_VISUAL_THEME/);
  assert.match(core,/rect\(p,0,0,PAGE_W,PAGE_H,'#010612'\)/);
  assert.match(core,/text\(p,44,805,'DESEMPENHO',7\.2,true,'#218cff'\)/);
  assert.match(core,/ESTUDO ADAPTATIVO INTELIGENTE/);
  assert.match(core,/strokeRect/);
  assert.match(core,/Legenda das matérias/);
  assert.match(core,/trackW\*clamp\(m\.progress,0,100\)\/100/);
  assert.doesNotMatch(core,/rect\(p,0,770,PAGE_W,72,'#0b2233'\)/);
});

test('study and export buttons have exact parity on desktop and mobile',()=>{
  assert.match(core,/retention-study-now-v1072,\.retention-report-actions \.retention-export-report-btn\{width:182px!important;min-width:182px!important;height:54px!important;min-height:54px!important/);
  assert.match(core,/@media\(max-width:700px\)[\s\S]*width:100%!important;min-width:0!important;height:54px!important;min-height:54px!important/);
});

test('report loader uses explicit cache-busting revision',()=>{
  assert.match(loader,/study-performance-report-core\.js\?rev=20260822-5/);
  assert.match(loader,/study-performance-report-v2\.js\?rev=20260822-5/);
});

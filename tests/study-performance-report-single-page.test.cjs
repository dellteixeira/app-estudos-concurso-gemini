const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=fs.readFileSync('public/js/study-performance-report-core.js','utf8');
const loader=fs.readFileSync('public/js/study-performance-report.js','utf8');

test('all subject bars are rendered on one chart page',()=>{
  assert.match(core,/const subjects=Array\.isArray\(data\.subjects\)\?data\.subjects:\[\]/);
  assert.match(core,/return \[p\];/);
  assert.doesNotMatch(core,/subjects\.length;i\+=8/);
  assert.doesNotMatch(core,/Gráfico \$\{ci\+1\}/);
});

test('bar and legend density adapt to many subjects',()=>{
  assert.match(core,/Math\.max\(9,Math\.min\(31,slot\*\.56\)\)/);
  assert.match(core,/count>16\?5\.7:count>12\?6\.2:count>8\?7:8/);
  assert.match(core,/subjects\.length>16\?6\.2:subjects\.length>12\?6\.7:subjects\.length>8\?7\.2:8\.1/);
});

test('export button inherits study-now class and accent appearance',()=>{
  assert.match(core,/b\.className=study\.className\+' retention-export-report-btn'/);
  assert.match(core,/background:var\(--accent,#19d3c5\)!important/);
  assert.match(core,/border:1px solid var\(--accent,#19d3c5\)!important/);
});

test('loader revision is bumped to avoid stale report UI',()=>{
  assert.match(loader,/study-performance-report-core\.js\?rev=20260822-5/);
  assert.match(loader,/study-performance-report-v2\.js\?rev=20260822-5/);
});

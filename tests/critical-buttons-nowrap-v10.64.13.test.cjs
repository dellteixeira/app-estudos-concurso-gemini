const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('public/css/learning-advisor.css','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

test('botões de pontos críticos não quebram seus rótulos',()=>{
  assert.match(css,/\.critical-point-controls button\{[^}]*white-space:nowrap!important[^}]*overflow-wrap:normal!important[^}]*word-break:keep-all!important/s);
  assert.match(css,/grid-template-columns:minmax\(0,1\.15fr\) minmax\(0,1\.12fr\) minmax\(0,\.88fr\)/);
});

test('correção permanece na linha canônica 10.64.x',()=>{
  assert.match(pkg.version,/^10\.64\.\d+$/);
});

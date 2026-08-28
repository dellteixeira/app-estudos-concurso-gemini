const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('public/css/learning-advisor.css','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
test('pontos críticos mantêm três ações na mesma linha',()=>{
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/\.critical-point-ai\{grid-column:auto\}/);
  assert.match(css,/white-space:nowrap/);
  assert.match(css,/@media\(max-width:700px\)[\s\S]*repeat\(3,minmax\(0,1fr\)\)/);
});
test('release do ajuste visual é 10.64.12',()=>assert.equal(pkg.version,'10.64.12'));

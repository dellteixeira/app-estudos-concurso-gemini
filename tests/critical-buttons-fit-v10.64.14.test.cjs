const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('public/css/learning-advisor.css','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

test('botões dos pontos críticos cabem sem sobreposição',()=>{
  assert.match(css,/V10\.64\.14 — Pontos críticos: botões dimensionados sem sobreposição/);
  assert.match(css,/font-size:\.68rem!important/);
  assert.match(css,/@media\(max-width:820px\)[^{]*\{[\s\S]*font-size:\.62rem!important/);
  assert.match(css,/gap:6px!important/);
  assert.match(css,/max-width:100%!important/);
});

test('release do ajuste permanece na linha canônica 10.64.x',()=>assert.match(pkg.version,/^10\.64\.\d+$/));

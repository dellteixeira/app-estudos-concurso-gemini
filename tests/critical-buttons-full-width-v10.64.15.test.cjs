const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('public/js/critical-points-actions.js','utf8');
const css=fs.readFileSync('public/css/learning-advisor.css','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

test('ações críticas são filhas diretas do card e não da coluna de texto',()=>{
  assert.match(js,/article\.appendChild\(controls\);/);
  assert.doesNotMatch(js,/copy\.appendChild\(controls\)/);
});

test('grupo de ações atravessa a coluna de conteúdo até o fim do card',()=>{
  assert.match(css,/V10\.64\.15 — Pontos críticos: ações ocupam toda a largura útil do card/);
  assert.match(css,/critical-actions-enabled > \.critical-point-controls\{[\s\S]*grid-column:2 \/ -1 !important/);
  assert.match(css,/grid-template-columns:minmax\(0,1\.2fr\) minmax\(0,1\.16fr\) minmax\(0,\.9fr\) !important/);
  assert.match(css,/font-size:\.65rem !important/);
  assert.match(css,/white-space:nowrap !important/);
});

test('release canônica não regride abaixo da correção estrutural 10.64.15',()=>{
  const match=String(pkg.version||'').match(/^10\.64\.(\d+)$/);
  assert.ok(match,'versão deve permanecer na linha canônica 10.64.x');
  assert.ok(Number(match[1])>=15,`patch ${match[1]} não pode regredir abaixo de 15`);
});

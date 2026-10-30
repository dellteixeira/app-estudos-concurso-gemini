const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const css=fs.readFileSync('public/css/edital-cross-tool.css','utf8');
const ui=fs.readFileSync('public/js/edital-cross-ui.js','utf8');

test('modal de cruzamento cresce em telas largas sem max-width legado',()=>{
  assert.match(css,/\.cross-edital-modal\{[\s\S]*width:min\(1560px,calc\(100vw - 36px\)\)/);
  assert.match(css,/@media\(min-width:1400px\)[\s\S]*width:min\(1640px,calc\(100vw - 48px\)\)/);
});

test('texto do cruzamento nao pode colapsar em quebra vertical letra a letra',()=>{
  assert.match(css,/\.cross-edital-modal,[\s\S]*word-break:normal/);
  assert.match(css,/overflow-wrap:normal/);
  assert.match(css,/\.cross-create-panel\{[\s\S]*grid-template-columns:minmax\(360px,1\.65fr\)/);
  assert.match(css,/\.cross-materia-head\{[\s\S]*grid-template-columns:24px minmax\(220px,1\.8fr\)/);
});

test('layout possui breakpoints dedicados para desktop notebook tablet e celular',()=>{
  for(const query of ['@media(min-width:1400px)','@media(max-width:1180px)','@media(max-width:980px)','@media(max-width:680px)']){
    assert.ok(css.includes(query),query);
  }
});

test('stylesheet do cruzamento usa cache-buster da release atual',()=>{
  assert.match(ui,/edital-cross-tool\.css\?v=10\.64\.57/);
});

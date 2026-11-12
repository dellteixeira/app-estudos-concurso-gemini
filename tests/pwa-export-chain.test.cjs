'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const pwa=fs.readFileSync('public/js/app-pwa.js','utf8');
const runtime=[
  fs.readFileSync('public/js/app-core.js','utf8'),
  fs.readFileSync('public/js/app-auth.js','utf8'),
  fs.readFileSync('public/js/app-ui.js','utf8'),
  pwa
].join('\n');

test('todos os exports simples do app-pwa referenciam símbolos já definidos',()=>{
  const exports=[...pwa.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*;/g)];
  for(const match of exports){
    const name=match[2];
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const declared=new RegExp('(?:function\\s+'+escaped+'\\s*\\(|(?:const|let|var)\\s+'+escaped+'\\b|class\\s+'+escaped+'\\b)').test(runtime);
    assert.ok(declared,'export do app-pwa referencia símbolo indefinido: '+name);
  }
});

test('toggleDarkMode é definido no runtime crítico antes de ser exportado',()=>{
  const def=pwa.indexOf('function toggleDarkMode()');
  const exp=pwa.indexOf('window.toggleDarkMode = toggleDarkMode;');
  assert.ok(def>=0,'toggleDarkMode precisa existir no app-pwa');
  assert.ok(exp>def,'toggleDarkMode precisa ser definido antes do export');
});

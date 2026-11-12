'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const nav=fs.readFileSync('public/js/ui/navigation.js','utf8');
const ui=fs.readFileSync('public/js/app-ui.js','utf8');
const runtime=[
  fs.readFileSync('public/js/app-core.js','utf8'),
  fs.readFileSync('public/js/app-auth.js','utf8'),
  fs.readFileSync('public/js/app-pwa.js','utf8'),
  fs.readFileSync('public/js/app-ui.js','utf8'),
  fs.readFileSync('public/js/app-ai.js','utf8')
].join('\n');

const unique=values=>[...new Set(values)];
const values=(re,source)=>unique([...source.matchAll(re)].map(m=>m[1]));

test('todo data-action está registrado no roteador',()=>{
  const actions=values(/data-action="([^"]+)"/g,html);
  const handlers=values(/^\s*'([^']+)'\s*:/gm,nav);
  for(const action of actions) assert.ok(handlers.includes(action),'ação sem handler: '+action);
});

test('todo adaptador inline está mapeado e não há adaptadores órfãos do menu antigo',()=>{
  const inlineIds=values(/data-inline-[a-z]+="([^"]+)"/g,html);
  const adapters=values(/'(ih-\d+)'\s*:/g,ui);
  for(const id of inlineIds) assert.ok(adapters.includes(id),'inline sem adapter: '+id);
  for(const id of ['ih-001','ih-002','ih-003','ih-004','ih-005']) assert.ok(!adapters.includes(id),'adapter legado ainda presente: '+id);
});

test('ações data-call simples possuem função disponível no runtime',()=>{
  const calls=unique([
    ...values(/data-call="([^"]+)"/g,html),
    ...values(/data-change-call="([^"]+)"/g,html),
    ...values(/data-input-call="([^"]+)"/g,html),
    ...values(/data-focus-call="([^"]+)"/g,html),
    ...values(/data-dblclick-call="([^"]+)"/g,html)
  ]).filter(name=>!name.includes('.'));
  for(const name of calls){
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const declared=new RegExp('(?:function\\s+'+escaped+'\\s*\\(|window\\.'+escaped+'\\s*=|global\\.'+escaped+'\\s*=)').test(runtime);
    assert.ok(declared,'call sem função disponível: '+name);
  }
});

test('menu compacto chama diretamente os contratos corretos',()=>{
  assert.match(nav,/'sync-now': element => callGlobal\('forceFullSync', \{ target: element \}\)/);
  assert.match(nav,/'view-edital-pdf': \(\) => callGlobal\('openModalViewEdital'\)/);
  assert.match(nav,/'analyze-edital-ai': \(\) => callGlobal\('openModalAnaliseEditalIA'\)/);
  assert.match(nav,/'json-ai-help': \(\) => callGlobal\('openModalPromptIA'\)/);
  assert.match(nav,/changeAction === 'import-json'[\s\S]*callGlobal\('importJSON', event\)/);
});

// Migração temporária v10.24.7 — funcionalidade já aplicada; remover após o merge.
import fs from 'node:fs';
import path from 'node:path';
const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);
for(const p of ['package.json','public/version.json','public/sw.js','src/index.js']) if(fs.existsSync(p)) write(p,read(p).replaceAll('10.24.6','10.24.7'));
const p='public/js/pdf/pdf-library-ui.js';
let s=read(p);
const anchor=`let st;function onSearch(v){clearTimeout(st);st=setTimeout(()=>{state.search=String(v||'').trim();load().catch(handle)},180)}\n`;
const insertion=`let st;function onSearch(v){clearTimeout(st);st=setTimeout(()=>{state.search=String(v||'').trim();load().catch(handle)},180)}\nlet libraryActivationTimer=null;\nfunction scheduleLibraryActivationRefresh(){clearTimeout(libraryActivationTimer);libraryActivationTimer=setTimeout(()=>{initialize(true).catch(handle)},0)}\ndocument.addEventListener('click',event=>{const btn=event.target?.closest?.('button');if(!btn)return;const onclick=btn.getAttribute('onclick')||'';if(onclick.includes("'tab-biblioteca'")||btn.dataset?.tab==='tab-biblioteca')scheduleLibraryActivationRefresh()});\n`;
if(!s.includes(anchor)) throw new Error('library activation anchor not found');
s=s.replace(anchor,insertion);
write(p,s);
if(fs.existsSync('tests')){const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const q=path.join(d,e.name);if(e.isDirectory())walk(q);else if(/\.test\.cjs$/.test(e.name)){let t=read(q);if(t.includes('10.24.6'))write(q,t.replaceAll('10.24.6','10.24.7'));}}};walk('tests');}
write('tests/v10-24-7-library-auto-load.test.cjs',`const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const r=p=>fs.readFileSync(p,'utf8');test('v10.24.7 biblioteca atualiza ao abrir a guia',()=>{const js=r('public/js/pdf/pdf-library-ui.js'),pkg=require('../package.json');assert.equal(pkg.version,'10.24.7');assert.ok(js.includes('function scheduleLibraryActivationRefresh()'));assert.ok(js.includes('initialize(true).catch(handle)'));assert.ok(js.includes('tab-biblioteca'));assert.ok(js.includes("btn.dataset?.tab==='tab-biblioteca'"));});\n`);
console.log('V10.24.7 library auto-load applied.');

// Migração temporária v10.24.6 — funcionalidade já aplicada; remover após o merge.
import fs from 'node:fs';
import path from 'node:path';
const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);
for(const p of ['package.json','public/version.json','public/sw.js','src/index.js']) if(fs.existsSync(p)) write(p,read(p).replaceAll('10.24.5','10.24.6'));
const p='public/index.html';
let s=read(p);
const block=`                    <div id="countdownBadge" class="countdown-badge" onclick="editarDataProva()" title="Clique para alterar a data da prova">\r\n                        Sem data de prova\r\n                    </div>\r\n`;
if(!s.includes(block)) throw new Error('countdownBadge header block not found');
s=s.replace(block,'');
write(p,s);
if(fs.existsSync('tests')){const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const q=path.join(d,e.name);if(e.isDirectory())walk(q);else if(/\.test\.cjs$/.test(e.name)){let t=read(q);if(t.includes('10.24.5'))write(q,t.replaceAll('10.24.5','10.24.6'));}}};walk('tests');}
write('tests/v10-24-6-remove-header-exam-date.test.cjs',`const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const r=p=>fs.readFileSync(p,'utf8');test('v10.24.6 remove data duplicada do cabeçalho e mantém retenção',()=>{const html=r('public/index.html'),pkg=require('../package.json');assert.equal(pkg.version,'10.24.6');assert.doesNotMatch(html,/id="countdownBadge"/);assert.match(html,/id="retentionExamPhase"/);assert.match(html,/Definir data da prova/);});\n`);
console.log('V10.24.6 header exam date removed.');
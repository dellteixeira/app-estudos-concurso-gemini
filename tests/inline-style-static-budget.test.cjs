const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');
test('inline style budget only permits state/dynamic styles after static migration',()=>{const h=read('public/index.html');const c=read('public/css/base.css');const b=JSON.parse(read('security/inline-style-budget.json'));const count=(h.match(/\sstyle\s*=\s*[\"']/gi)||[]).length;assert.ok(count<=b.budget,`inline style budget exceeded: ${count} > ${b.budget}`);assert.ok(b.migrated>0);assert.match(c,/INLINE_STATIC_BATCH1_START/);assert.match(c,/\.u-static-\d{3}\{/);});
test('safe presentation-only inline styles are not reintroduced',()=>{const h=read('public/index.html');const allowed=new Set(['margin','margin-top','margin-right','margin-bottom','margin-left','padding','padding-top','padding-right','padding-bottom','padding-left','gap','row-gap','column-gap','flex','flex-grow','flex-shrink','flex-basis','cursor','text-align','font-size','font-weight','font-style','line-height','letter-spacing','white-space','border','border-top','border-right','border-bottom','border-left','border-radius','color','text-decoration']);for(const m of h.matchAll(/\sstyle=\"([^\"]*)\"/gi)){const ps=m[1].split(';').map(x=>x.trim()).filter(Boolean).map(x=>x.split(':',1)[0].trim().toLowerCase());assert.ok(ps.some(p=>!allowed.has(p)),`safe static inline style should be CSS: ${m[1]}`);}});

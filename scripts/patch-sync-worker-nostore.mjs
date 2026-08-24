import fs from 'node:fs';
const path='src/index.js';
let src=fs.readFileSync(path,'utf8');
const before='"/js/study-domain.js", "/js/app-core.js", "/js/pdf/pdf-core.js"';
const after='"/js/study-domain.js", "/js/app-core.js", "/js/app-state.js", "/js/sync-engine.js", "/js/pdf/pdf-core.js"';
if(!src.includes(after)) {
  if(!src.includes(before)) throw new Error('CORE_NO_STORE_PATHS anchor not found');
  src=src.replace(before,after);
}
fs.writeFileSync(path,src);
console.log('Cloudflare Worker no-store paths patched');

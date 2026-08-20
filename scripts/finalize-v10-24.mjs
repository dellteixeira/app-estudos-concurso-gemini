import fs from 'node:fs';

function patch(path, from, to){
  let s=fs.readFileSync(path,'utf8');
  if(s.includes(to)){console.log(path,'already finalized');return;}
  if(!s.includes(from))throw new Error(`Finalization pattern not found in ${path}`);
  s=s.replace(from,to);
  fs.writeFileSync(path,s);
}

patch('public/css/pdf-reader.css',
  '.pdf-reader-selection-bar{display:grid!important;grid-template-columns:minmax(0,1fr) 360px!important;align-items:center!important}',
  '.pdf-reader-selection-bar{display:grid!important;grid-template-columns:auto minmax(0,1fr) 360px!important;align-items:center!important}'
);

patch('public/css/pdf-library.css',
  'grid-template-columns:minmax(155px,.8fr) minmax(180px,1fr) minmax(160px,1fr) minmax(170px,1fr) minmax(220px,1.5fr) auto!important',
  'grid-template-columns:minmax(220px,1.4fr) minmax(155px,.9fr) minmax(180px,1fr) minmax(160px,1fr) minmax(170px,1fr)!important'
);

let test=fs.readFileSync('tests/library-reader-v10-24.test.cjs','utf8');
if(!test.includes('auto minmax(0,1fr) 360px')){
  test=test.replace("assert.match(rc,/pdf-note-paper/);", "assert.match(rc,/pdf-note-paper/);assert.match(rc,/grid-template-columns:auto minmax\\(0,1fr\\) 360px/);assert.match(lc,/minmax\\(220px,1\\.4fr\\).*minmax\\(170px,1fr\\)/);");
  fs.writeFileSync('tests/library-reader-v10-24.test.cjs',test);
}
console.log('V10.24 final alignment applied.');

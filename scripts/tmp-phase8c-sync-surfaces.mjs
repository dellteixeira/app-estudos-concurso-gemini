import fs from 'node:fs';

function edit(file, transform){
  const before=fs.readFileSync(file,'utf8');
  const after=transform(before);
  if(after===before)throw new Error(`${file}: expected Phase 8C surface changes not applied`);
  fs.writeFileSync(file,after);
}
function removeAll(text,tokens){
  let out=text;
  for(const token of tokens)out=out.split(token).join('');
  return out;
}

edit('public/sw.js',text=>removeAll(text,[
  " './css/study-optimization.css',",
  " './js/core/study-optimization-dashboard.js',",
  " '/css/study-optimization.css',",
  " '/js/core/study-optimization-dashboard.js',",
  "'./css/study-optimization.css', ",
  "'./js/core/study-optimization-dashboard.js', ",
  "'/css/study-optimization.css', ",
  "'/js/core/study-optimization-dashboard.js', "
]));

edit('src/index.js',text=>removeAll(text,[
  ' "/css/study-optimization.css",',
  ' "/js/core/study-optimization-dashboard.js",',
  '"/css/study-optimization.css", ',
  '"/js/core/study-optimization-dashboard.js", '
]));

edit('public/_headers',text=>{
  let out=text.replace('/js/core/domain-risk-dashboard.js\n  Cache-Control: no-cache, no-store, must-revalidate','/js/core/topic-assessment.js\n  Cache-Control: no-cache, no-store, must-revalidate');
  out=out.replace(/\n\/js\/core\/study-optimization-dashboard\.js\n  Cache-Control: no-cache, no-store, must-revalidate\n/g,'\n');
  out=out.replace(/\n\/css\/study-optimization\.css\n  Cache-Control: no-cache, no-store, must-revalidate\n/g,'\n');
  return out;
});

for(const file of ['public/sw.js','src/index.js','public/_headers']){
  const text=fs.readFileSync(file,'utf8');
  if(text.includes('study-optimization-dashboard.js')||text.includes('study-optimization.css'))throw new Error(`${file}: retired asset reference remains`);
  if(file==='public/_headers'&&!text.includes('/js/core/topic-assessment.js'))throw new Error('public/_headers: topic assessment no-store rule missing');
}

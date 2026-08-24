'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const full=path.join(dir,entry.name);
    return entry.isDirectory()?walk(full):[full];
  });
}

function runtimeStyleOffenders(){
  const files=walk('public').filter(file=>/\.(?:js|html)$/i.test(file));
  const patterns=[
    /\.style\s*\./g,
    /\.style\s*\[/g,
    /\.style\s*=/g,
    /\.style\.setProperty\s*\(/g,
    /\.style\.cssText\s*=/g,
    /setAttribute\(\s*['"]style['"]/g,
    /\sstyle\s*=\s*['"`]/g
  ];
  const offenders=[];
  for(const file of files){
    const text=fs.readFileSync(file,'utf8');
    const lines=text.split(/\r?\n/);
    lines.forEach((line,index)=>{
      if(patterns.some(re=>{re.lastIndex=0;return re.test(line)})) offenders.push(`${file}:${index+1}: ${line.trim().slice(0,220)}`);
    });
  }
  return offenders;
}

test('style-src-attr can be locked to none without runtime style attributes',()=>{
  const offenders=runtimeStyleOffenders();
  assert.deepEqual(offenders,[],`Runtime style attribute debt remains:\n${offenders.join('\n')}`);
});

test('CSP explicitly blocks style attributes',()=>{
  const headers=fs.readFileSync('public/_headers','utf8');
  const csp=headers.match(/^\s*Content-Security-Policy:\s*(.+)$/mi)?.[1]||'';
  assert.match(csp,/(?:^|;\s*)style-src-attr\s+'none'(?:;|$)/);
});

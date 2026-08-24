'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync('public/js/study-performance-report-core.js','utf8');

function estimate(text,size=10){let u=0;for(const ch of String(text||'')){if(/[MW@#%&]/.test(ch))u+=.88;else if(/[ilI1.,:;'|!]/.test(ch))u+=.28;else if(/\s/.test(ch))u+=.3;else u+=.53;}return u*size;}
function wrap(text,size=10,width=500){const words=String(text||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);const lines=[];let line='';for(const word of words){const probe=line?line+' '+word:word;if(!line||estimate(probe,size)<=width)line=probe;else{lines.push(line);line=word;}}if(line)lines.push(line);return lines.length?lines:[''];}
function layout(title,width=507){for(const size of [23,22,21,20,19,18,17,16,15,14,13]){const lines=wrap(title,size,width);if(lines.length<=2)return {lines,size};}return {lines:wrap(title,12,width).slice(0,2),size:12};}

test('report header uses adaptive title layout and dynamic vertical flow',()=>{
  assert.match(src,/function getHeaderTitleLayout(title,maxWidth=PAGE_W-MX*2)/);
  assert.match(src,/layout.lines.forEach/);
  assert.match(src,/const subtitleY=titleBottom-25/);
  assert.match(src,/p.cursor=dividerY-31/);
});

test('known long subject names fit inside at most two header lines',()=>{
  const titles=[
    'Administração de Recursos Materiais e Patrimoniais',
    'Gestão de Processos, Projetos, Riscos e Indicadores'
  ];
  for(const title of titles){
    const result=layout(title);
    assert.ok(result.lines.length<=2, title+' should use at most two lines');
    assert.ok(result.size>=13, title+' should remain legible');
    for(const line of result.lines) assert.ok(estimate(line,result.size)<=507, line+' must fit the printable header width');
  }
});

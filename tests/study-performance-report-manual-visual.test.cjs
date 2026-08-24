'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../public/js/study-performance-report-core.js'),'utf8');

test('performance report uses manual visual design system',()=>{
  assert.match(src,/REPORT_MANUAL_VISUAL_THEME/);
  assert.match(src,/ESTUDO ADAPTATIVO INTELIGENTE/);
  assert.match(src,/Relatório de Desempenho/);
  assert.match(src,/Quando o tempo é curto/);
  assert.match(src,/#010612/);
  assert.match(src,/#218cff/);
});

test('legacy white executive cards are removed',()=>{
  assert.doesNotMatch(src,/rect\(p,x,y,cw,ch,'#f6f9fb'\)/);
  assert.doesNotMatch(src,/rect\(p,0,770,PAGE_W,72,'#0b2233'\)/);
});

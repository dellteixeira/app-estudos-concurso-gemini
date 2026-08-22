'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const loader=fs.readFileSync(path.join(root,'public/js/study-performance-report.js'),'utf8');

test('Exportar dados mantém as mesmas dimensões de Estudar agora',()=>{
  assert.match(loader,/\.retention-report-actions \.retention-study-now-v1072,/);
  assert.match(loader,/\.retention-report-actions \.retention-export-report-btn\{/);
  assert.match(loader,/width:182px/);
  assert.match(loader,/height:54px/);
  assert.match(loader,/justify-content:center/);
  assert.match(loader,/@media\(max-width:700px\)/);
  assert.match(loader,/width:100%/);
});

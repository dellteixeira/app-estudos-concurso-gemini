import fs from 'node:fs';

const corePath='public/js/study-performance-report-core.js';
const testPath='tests/study-performance-report-long-title.test.cjs';
const workflowPath='.github/workflows/quality-check.yml';
let core=fs.readFileSync(corePath,'utf8');

const oldHeader=`function addHeader(p,title,subtitle=''){
  text(p,44,805,'DESEMPENHO',7.2,true,'#218cff');
  line(p,118,808,PAGE_W-44,808,'#0b4e97',.7);
  text(p,44,772,title,23,true,'#f5f8ff');
  if(subtitle)text(p,44,748,subtitle,9.2,false,'#c4cedd');
  line(p,44,731,252,731,'#1b78d0',.8);
  p.cursor=700;
}`;

const newHeader=`function getHeaderTitleLayout(title,maxWidth=PAGE_W-MX*2){
  const value=String(title||'').replace(/\\s+/g,' ').trim();
  const sizes=[23,22,21,20,19,18,17,16,15,14,13];
  for(const size of sizes){
    const lines=wrap(value,size,maxWidth);
    if(lines.length<=2)return {lines,size,leading:Math.max(17,size*1.08)};
  }
  const size=12;
  const lines=wrap(value,size,maxWidth);
  return {lines:lines.slice(0,2),size,leading:17};
}
function addHeader(p,title,subtitle=''){
  text(p,44,805,'DESEMPENHO',7.2,true,'#218cff');
  line(p,118,808,PAGE_W-44,808,'#0b4e97',.7);
  const layout=getHeaderTitleLayout(title);
  const titleY=772;
  layout.lines.forEach((ln,index)=>text(p,44,titleY-index*layout.leading,ln,layout.size,true,'#f5f8ff'));
  const titleBottom=titleY-(layout.lines.length-1)*layout.leading;
  const subtitleY=titleBottom-25;
  if(subtitle)text(p,44,subtitleY,subtitle,9.2,false,'#c4cedd');
  const dividerY=(subtitle?subtitleY:titleBottom)-17;
  line(p,44,dividerY,252,dividerY,'#1b78d0',.8);
  p.cursor=dividerY-31;
}`;

if(!core.includes(oldHeader)) throw new Error('addHeader antigo não encontrado');
core=core.replace(oldHeader,newHeader);
fs.writeFileSync(corePath,core,'utf8');

const test=`'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync('public/js/study-performance-report-core.js','utf8');

function estimate(text,size=10){let u=0;for(const ch of String(text||'')){if(/[MW@#%&]/.test(ch))u+=.88;else if(/[ilI1.,:;'|!]/.test(ch))u+=.28;else if(/\\s/.test(ch))u+=.3;else u+=.53;}return u*size;}
function wrap(text,size=10,width=500){const words=String(text||'').replace(/\\s+/g,' ').trim().split(' ').filter(Boolean);const lines=[];let line='';for(const word of words){const probe=line?line+' '+word:word;if(!line||estimate(probe,size)<=width)line=probe;else{lines.push(line);line=word;}}if(line)lines.push(line);return lines.length?lines:[''];}
function layout(title,width=507){for(const size of [23,22,21,20,19,18,17,16,15,14,13]){const lines=wrap(title,size,width);if(lines.length<=2)return {lines,size};}return {lines:wrap(title,12,width).slice(0,2),size:12};}

test('report header uses adaptive title layout and dynamic vertical flow',()=>{
  assert.match(src,/function getHeaderTitleLayout\(title,maxWidth=PAGE_W-MX\*2\)/);
  assert.match(src,/layout\.lines\.forEach/);
  assert.match(src,/const subtitleY=titleBottom-25/);
  assert.match(src,/p\.cursor=dividerY-31/);
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
`;
fs.writeFileSync(testPath,test,'utf8');

const canonical=`name: Quality Check\n\non:\n  push:\n    branches: [main]\n  pull_request:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n\njobs:\n  test-and-audit:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 30\n    steps:\n      - name: Checkout\n        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4\n\n      - name: Setup Node\n        uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4\n        with:\n          node-version: '22.23.2'\n\n      - name: Syntax check\n        run: node --check src/index.js\n\n      - name: Automated tests\n        run: npm test\n\n      - name: Structural audit\n        env:\n          AUDIT_ALLOW_ANY_ROOT: '1'\n        run: npm run audit\n\n      - name: Install Playwright test runner\n        run: npm install --no-save --package-lock=false @playwright/test@1.55.0\n\n      - name: Install Playwright browsers\n        run: npx playwright install --with-deps chromium firefox webkit\n\n      - name: Browser responsive audit\n        run: npm run test:browser\n\n      - name: Upload Playwright report and screenshots\n        if: always()\n        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4\n        with:\n          name: playwright-responsive-audit-\${{ github.run_id }}\n          path: |\n            playwright-report/\n            test-results/\n          if-no-files-found: ignore\n          retention-days: 14\n`;

// The temporary branch workflow will overwrite this file before execution and the runner restores it here.
fs.writeFileSync(workflowPath,canonical,'utf8');
try{fs.unlinkSync('scripts/patch-report-long-title-layout.mjs')}catch(_){ }

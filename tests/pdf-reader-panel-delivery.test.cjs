'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const loader=fs.readFileSync(path.join(root,'public/js/study-performance-report.js'),'utf8');

test('bootstrap instala expansão do painel sem depender de módulo auxiliar',()=>{
  assert.match(loader,/installReaderPanelExpansion/);
  assert.match(loader,/__panelExpansionV2/);
  assert.match(loader,/PdfStudyReader=Object\.freeze/);
});

test('painel colapsado força corpo e canvas a ocupar toda a largura',()=>{
  assert.match(loader,/side-collapsed \.pdf-reader-body/);
  assert.match(loader,/grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(loader,/side-collapsed #pdfReaderCanvasWrap/);
  assert.match(loader,/width:100%!important/);
});

test('modos largura e página são recalculados após mudança do painel',()=>{
  assert.match(loader,/fitWidthActive/);
  assert.match(loader,/reader\.fitWidth\(\)/);
  assert.match(loader,/reader\.fitPage\(\)/);
});

test('zoom manual acompanha proporcionalmente a largura liberada',()=>{
  assert.match(loader,/afterWidth\/beforeWidth/);
  assert.match(loader,/customScale\*ratio/);
  assert.match(loader,/reader\.zoom\(target-customScale\)/);
});

test('mobile mantém painel como sobreposição sem alterar zoom',()=>{
  assert.match(loader,/max-width:700px/);
  assert.match(loader,/if\(mobile\)return/);
});

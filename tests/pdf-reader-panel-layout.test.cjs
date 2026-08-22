'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const panel=fs.readFileSync(path.join(root,'public/js/pdf/pdf-reader-panel-layout.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'public/js/study-performance-report.js'),'utf8');

test('botão Painel alterna a classe estrutural do Reader',()=>{
  assert.match(panel,/classList\.toggle\('side-collapsed'\)/);
  assert.match(panel,/data-panel-collapsed/);
});

test('modos Largura e Página recalculam o encaixe após o painel mudar',()=>{
  assert.match(panel,/fitWidthActive/);
  assert.match(panel,/reader\.fitWidth\(\)/);
  assert.match(panel,/fitPageActive/);
  assert.match(panel,/reader\.fitPage\(\)/);
});

test('zoom customizado acompanha proporcionalmente a largura liberada pelo painel',()=>{
  assert.match(panel,/beforeWidth=canvasWrap\.clientWidth/);
  assert.match(panel,/afterWidth=canvasWrap\.clientWidth/);
  assert.match(panel,/widthRatio=afterWidth\/beforeWidth/);
  assert.match(panel,/customScale\*widthRatio/);
  assert.match(panel,/reader\.zoom\(target-customScale\)/);
});

test('mobile mantém PDF em largura total e não força novo zoom ao abrir drawer',()=>{
  assert.match(panel,/MOBILE_BREAKPOINT='\(max-width:700px\)'/);
  assert.match(panel,/if\(mobile\)return/);
});

test('módulo de layout do painel é carregado pelo bootstrap já existente',()=>{
  assert.match(loader,/\.\/js\/pdf\/pdf-reader-panel-layout\.js/);
  assert.match(loader,/data-pdf-reader-panel-layout/);
});

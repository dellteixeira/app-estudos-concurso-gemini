'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');

const layout=fs.readFileSync('public/js/pdf/pdf-library-layout-fix.js','utf8');
const mobile=fs.readFileSync('public/js/ui/mobile.js','utf8');

test('mobile library contains cards and exposes horizontal rails',()=>{
  cp.execFileSync(process.execPath,['--check','public/js/pdf/pdf-library-layout-fix.js'],{stdio:'pipe'});
  assert.match(layout,/@media \(max-width:700px\)/);
  assert.match(layout,/#pdfLibraryWorkspace[\s\S]*overflow-x:hidden!important/);
  assert.match(layout,/\.pdf-library-grid[\s\S]*grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(layout,/\.pdf-library-card[\s\S]*max-width:100%!important/);
  assert.match(layout,/\.pdf-library-actions,[\s\S]*\.pdf-library-filters,[\s\S]*#pdfOfflineManager \.pdf-offline-controls[\s\S]*padding:0 14px 9px 2px!important/);
  assert.match(layout,/::-webkit-scrollbar[\s\S]*height:8px!important/);
  assert.match(layout,/scrollbar-color:rgba\(83,227,213,\.48\)/);
});

test('mobile edital keeps delete actions side by side and sync compact',()=>{
  cp.execFileSync(process.execPath,['--check','public/js/ui/mobile.js'],{stdio:'pipe'});
  assert.match(mobile,/#tab-edital \.edital-manual-actions[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(mobile,/grid-column:auto!important/);
  assert.match(mobile,/header\.modern-header \.header-sync-status[\s\S]*height:44px!important/);
});

test('Mais owns the mobile action-bar visibility',()=>{
  assert.match(mobile,/\.action-bar:not\(\.mobile-open\)[\s\S]*display:none!important/);
  assert.match(mobile,/\.action-bar\.mobile-open[\s\S]*display:grid!important/);
  assert.match(mobile,/function setMobileToolsState\(open\)/);
  assert.match(mobile,/bar\.classList\.toggle\('mobile-open', shouldOpen\)/);
  assert.match(mobile,/setAttribute\('aria-expanded', shouldOpen \? 'true' : 'false'\)/);
  assert.match(mobile,/if \(window\.innerWidth <= 900\) setMobileToolsState\(false\)/);
});

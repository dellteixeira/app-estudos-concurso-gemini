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
  assert.match(layout,/#pdfOfflineManager \.pdf-offline-actions\{display:contents!important;\}/);
  assert.match(layout,/#pdfOfflineManager \.pdf-offline-actions button\{[\s\S]*flex:0 0 auto!important;[\s\S]*min-width:116px!important/);
});

test('mobile edital keeps delete actions side by side and sync compact',()=>{
  cp.execFileSync(process.execPath,['--check','public/js/ui/mobile.js'],{stdio:'pipe'});
  assert.match(mobile,/#tab-edital \.edital-manual-actions[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(mobile,/grid-column:auto!important/);
  assert.match(mobile,/header\.modern-header \.header-sync-status[\s\S]*height:44px!important/);
});

test('mobile helper não reintroduz a action-bar aposentada nem sobrescreve o menu compacto',()=>{
  assert.doesNotMatch(mobile,/\.action-bar\b/);
  assert.doesNotMatch(mobile,/\.mobile-tools-toggle\b/);
  assert.doesNotMatch(mobile,/function\s+setMobileToolsState\s*\(/);
  assert.doesNotMatch(mobile,/function\s+toggleModernTools\s*\(/);
  assert.doesNotMatch(mobile,/global\.toggleModernTools\s*=/);
  assert.doesNotMatch(mobile,/mobile-open/);
});

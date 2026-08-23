'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');

test('batch6 reduces fixed inline layout budget',()=>{
  const html=read('public/index.html');
  assert.equal((html.match(/\sstyle\s*=\s*["']/gi)||[]).length,5);
  assert.match(read('scripts/audit-inline-csp.mjs'),/const STYLE_BUDGET = 5;/);
});

test('batch6 generated layout classes are present',()=>{
  const css=read('public/css/base.css');
  assert.match(css,/INLINE_STYLE_BATCH6_FIXED_LAYOUTS/);
  assert.ok((css.match(/\.u-layout-b6-/g)||[]).length >= 29);
});

test('batch6 leaves runtime-hidden and PDF reader styles untouched',()=>{
  const html=read('public/index.html');
  const reset=html.match(/<button[^>]+id=["']btnResetFcFilter["'][^>]*>/i)?.[0]||'';
  assert.match(reset,/style=["']display:\s*none;?["']/i);
  const readerTag=html.match(/<section\b[^>]*\bid=["']pdfReaderOverlay["'][^>]*>/i)?.[0]||'';
  assert.ok(readerTag,'PDF Reader overlay missing');
});

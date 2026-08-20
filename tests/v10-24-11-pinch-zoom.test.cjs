const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const r=fs.readFileSync('public/js/pdf/pdf-reader.js','utf8');
const c=fs.readFileSync('public/css/pdf-reader.css','utf8');
test('Reader mobile possui pinch-to-zoom por dois toques',()=>{
  for(const token of ['function beginPinch()','function updatePinch(e)','function commitPinch()','function bindPinchZoom()']) assert.ok(r.includes(token),token);
  for(const eventName of ['pointerdown','pointermove','pointerup','pointercancel']) assert.match(r,new RegExp(eventName));
  assert.match(r,/Math\.min\(4,Math\.max\(\.4/);
  assert.match(r,/bindPinchZoom\(\)/);
});
test('pinch preserva ponto focal e navegação de um dedo',()=>{
  assert.match(r,/requestAnimationFrame/);
  assert.match(r,/scrollLeft=Math\.max\(0,\(left\+ax\)\*ratio-ax\)/);
  assert.match(r,/scrollTop=Math\.max\(0,\(top\+ay\)\*ratio-ay\)/);
  assert.match(c,/pinch-to-zoom mobile/);
  assert.match(c,/touch-action:pan-x pan-y!important/);
  assert.match(c,/is-pinching\{touch-action:none!important/);
});

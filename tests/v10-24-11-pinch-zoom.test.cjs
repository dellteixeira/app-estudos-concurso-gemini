const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const r=fs.readFileSync('public/js/pdf/pdf-reader.js','utf8');
const c=fs.readFileSync('public/css/pdf-reader.css','utf8');
test('Reader mobile possui pinch-to-zoom por dois toques',()=>{
  for(const token of ['function beginPinch()','function updatePinch(e)','function commitPinch()','function bindPinchZoom()']) assert.ok(r.includes(token),token);
  assert.match(r,/pointerdown/);assert.match(r,/pointermove/);assert.match(r,/pointerup/);
  assert.match(r,/Math\.min\(4,Math\.max\(\.4/);
  assert.match(r,/bindPinchZoom\(\)/);
});
test('pinch preserva navegação de um dedo e ativa modo exclusivo durante gesto',()=>{
  assert.match(c,/pinch-to-zoom mobile/);
  assert.match(c,/touch-action:pan-x pan-y!important/);
  assert.match(c,/is-pinching\{touch-action:none!important/);
});

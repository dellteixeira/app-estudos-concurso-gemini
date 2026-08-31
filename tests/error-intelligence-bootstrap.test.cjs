const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('navigation loads Error Intelligence before cognitive runtime',()=>{
  const nav=fs.readFileSync('public/js/ui/navigation.js','utf8');
  const errorIndex=nav.indexOf("./js/core/error-intelligence.js");
  const runtimeIndex=nav.indexOf("./js/core/cognitive-profile-runtime.js");
  assert.ok(errorIndex>=0,'Error Intelligence must be part of the modular bootstrap');
  assert.ok(runtimeIndex>errorIndex,'Error Intelligence must load before cognitive runtime');
});

test('cognitive runtime persists recurringErrors without schedule mutation',()=>{
  const runtime=fs.readFileSync('public/js/core/cognitive-profile-runtime.js','utf8');
  assert.match(runtime,/AppErrorIntelligence/);
  assert.match(runtime,/recurringErrors/);
  assert.doesNotMatch(runtime,/setStudyDate|rescheduleStudy|schedule\.push/);
});

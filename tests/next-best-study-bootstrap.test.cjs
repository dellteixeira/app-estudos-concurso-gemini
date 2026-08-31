const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('navigation loads next best study action after Error Intelligence and before cognitive runtime',()=>{
  const source=fs.readFileSync('public/js/ui/navigation.js','utf8');
  const errorIndex=source.indexOf("./js/core/error-intelligence.js");
  const nextIndex=source.indexOf("./js/core/next-best-study-action.js");
  const runtimeIndex=source.indexOf("./js/core/cognitive-profile-runtime.js");
  assert.ok(errorIndex>=0,'Error Intelligence must be loaded');
  assert.ok(nextIndex>errorIndex,'Next Best Study Action must load after Error Intelligence');
  assert.ok(runtimeIndex>nextIndex,'Cognitive runtime must load after recommendation engine');
});

test('recommendation engine stays advisory and does not reference scheduler mutations',()=>{
  const source=fs.readFileSync('public/js/core/next-best-study-action.js','utf8');
  assert.doesNotMatch(source,/scheduleStudy|updateSchedule|calendarData|saveSchedule|rebuildRetentionEngineForContest/);
  assert.match(source,/priorityScore/);
  assert.match(source,/reasons/);
  assert.match(source,/alternatives/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const core=fs.readFileSync('public/js/app-core.js','utf8');

test('adição manual permite o mesmo tópico em datas diferentes',()=>{
  const start=core.indexOf('async function confirmAddTopicWithSwap');
  const end=core.indexOf('async function toggleCheckFromModal',start);
  assert.notEqual(start,-1);
  const fn=core.slice(start,end);
  assert.doesNotMatch(fn,/findNormalTopicLocation\(/);
  assert.doesNotMatch(fn,/manual_advance/);
  assert.doesNotMatch(fn,/já aparece no cronograma/);
  assert.match(fn,/contest\.dateSchedule\[activeSelectedDateKey\]\.push\(newFullString\)/);
});

test('adição manual continua bloqueando duplicidade no mesmo dia',()=>{
  const start=core.indexOf('async function confirmAddTopicWithSwap');
  const end=core.indexOf('async function toggleCheckFromModal',start);
  const fn=core.slice(start,end);
  assert.match(fn,/alreadyOnSelectedDay/);
  assert.match(fn,/normalizeScheduledTopicForStudy\(item\) === newFullString/);
  assert.match(fn,/Este tópico já está agendado neste dia\./);
});

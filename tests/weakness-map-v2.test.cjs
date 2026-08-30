const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const map=fs.readFileSync('public/js/weakness-map-v2.js','utf8');
const adaptive=fs.readFileSync('public/js/adaptive-ai-experience.js','utf8');

test('mapa deriva métricas do Learning Advisor sem criar nova prioridade',()=>{
  assert.match(map,/collectCandidates\?\.\(5\)/);
  assert.match(map,/localIntervention/);
  assert.match(map,/frictionScore/);
  assert.match(map,/retention/);
  assert.match(map,/accuracy/);
  assert.match(map,/lapseCount/);
  assert.doesNotMatch(map,/\.sort\s*\(/);
  assert.doesNotMatch(map,/priorityIndex\s*=/);
  assert.doesNotMatch(map,/prioridade\s*=/);
});

test('mapa é estritamente diagnóstico e não controla cronograma',()=>{
  assert.match(map,/authority:'diagnostic-only'/);
  assert.doesNotMatch(map,/nextReviewDate\s*=/);
  assert.doesNotMatch(map,/autoSchedule/);
  assert.doesNotMatch(map,/cronograma\s*=/);
});

test('experiência adaptativa carrega o mapa sem duplicar script',()=>{
  assert.match(adaptive,/data-weakness-map-v2/);
  assert.match(adaptive,/weakness-map-v2\.js/);
  assert.match(adaptive,/AppWeaknessMapV2/);
});

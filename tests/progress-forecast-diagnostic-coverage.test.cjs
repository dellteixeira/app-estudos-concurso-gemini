const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const forecast=fs.readFileSync('public/js/progress-forecast.js','utf8');

test('forecast prefere cobertura diagnóstica ampla e mantém fallback compatível',()=>{
  assert.match(forecast,/AppDiagnosticCandidateProvider/);
  assert.match(forecast,/provider\?\.collect\?\.\(40\)/);
  assert.match(forecast,/advisor\?\.collectCandidates\?\.\(12\)/);
});

test('forecast não cria ranking ou autoridade de agenda',()=>{
  assert.doesNotMatch(forecast,/\.sort\s*\(/);
  assert.doesNotMatch(forecast,/nextReviewDate\s*=/);
  assert.doesNotMatch(forecast,/priorityIndex\s*=/);
  assert.match(forecast,/authority:'forecast-only'/);
});

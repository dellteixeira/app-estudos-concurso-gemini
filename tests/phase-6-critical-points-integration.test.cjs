const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const critical=fs.readFileSync('public/js/critical-points-actions.js','utf8');
const dashboard=fs.readFileSync('public/js/core/study-optimization-dashboard.js','utf8');
const css=fs.readFileSync('public/css/study-optimization.css','utf8');

test('standalone Phase 6 dashboards stay hidden',()=>{
  assert.match(css,/#phase6aDomainRiskPanel,#phase6bStudyOptimizationPanel\{display:none!important;\}/);
  assert.match(dashboard,/const UI_ENABLED=false;/);
  assert.match(dashboard,/function ensurePanel\(\)\{\n  if\(!UI_ENABLED\)return null;/);
});

test('Critical Points consumes Phase 6A domain risk without adding visible markup',()=>{
  assert.match(critical,/domainRisk:topic\.domainRisk\|\|null/);
  assert.match(critical,/domainComponent=Number\.isFinite\(domainRiskValue\)/);
  assert.match(critical,/phase6:\{masteryScore:/);
  assert.match(critical,/dataset\.phase6Mastery/);
  assert.doesNotMatch(critical,/Fase 6A|Fase 6B|Student Model|Study Optimizer/);
});

test('Critical Points prepares Phase 6B optimization before existing layered review',()=>{
  assert.match(critical,/AppStudyOptimization\?\.plan\?global\.AppStudyOptimization\.plan\(30,\{profile,source:'critical-points'\}\):null/);
  assert.match(critical,/surface:'critical-points'/);
  assert.match(critical,/preferredAction:block\.method/);
  assert.match(critical,/critical-points:phase6-prepared/);
  assert.match(critical,/importedOrderMutation:false/);
  assert.match(critical,/openLayeredReviewModal\(numericIndex\)/);
});

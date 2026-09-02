const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('public/index.html','utf8');
const engine=fs.readFileSync('public/js/core/study-optimization-engine.js','utf8');
test('Phase 8C remove fisicamente fachada e CSS de apresentação legados',()=>{
  assert.equal(fs.existsSync('public/js/core/study-optimization-dashboard.js'),false); assert.equal(fs.existsSync('public/css/study-optimization.css'),false); assert.doesNotMatch(html,/study-optimization-dashboard.js|study-optimization.css/);
});
test('engine cognitivo permanece ativo sem dashboard removido',()=>{ assert.match(engine,/AppStudyOptimization/); assert.match(engine,/AppTopicAssessment/); assert.doesNotMatch(engine,/AppStudyOptimizationDashboard/); });
test('shell não contém painéis autônomos da antiga Fase 6',()=>{ assert.doesNotMatch(html,/phase6aDomainRiskPanel|phase6bStudyOptimizationPanel/); });

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const guidance=fs.readFileSync('public/js/core/study-guidance-engine.js','utf8');
const critical=fs.readFileSync('public/js/critical-points-actions.js','utf8');
const index=fs.readFileSync('public/index.html','utf8');
const manifest=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));

test('study guidance consumes predictive tutor without becoming a new UI surface',()=>{
  assert.match(guidance,/function predictiveEnrichment\(guidance,context=\{\}\)/);
  assert.match(guidance,/AppPredictiveAdaptiveTutor\.tutorDecision/);
  assert.match(guidance,/authority:'predictive-adaptive-tutor'/);
  assert.match(guidance,/goalProbability/);
  assert.doesNotMatch(guidance,/createElement|innerHTML|appendChild/);
});

test('critical points prepares 6C prediction without changing card markup contract',()=>{
  assert.match(critical,/AppPredictiveAdaptiveTutor\?\.resolve/);
  assert.match(critical,/predictedPerformance:/);
  assert.match(critical,/goalProbability:/);
  assert.match(critical,/importedOrderMutation:false/);
  assert.doesNotMatch(critical,/phase6c-panel|predictive-panel|tutor-panel/);
});

test('predictive tutor is loaded after optimization engine and has cache contracts',()=>{
  const optimization=index.indexOf('./js/core/study-optimization-engine.js');
  const predictive=index.indexOf('./js/core/predictive-adaptive-tutor.js');
  assert.ok(optimization>=0&&predictive>optimization);
  for(const key of ['criticalAppShell','networkFirstPaths','workerNoStorePaths','headersNoStorePaths']){
    assert.ok(manifest[key].includes('/js/core/predictive-adaptive-tutor.js'),`${key} must contain predictive tutor`);
  }
});

test('phase 6C preserves imported ordering contract',()=>{
  const source=fs.readFileSync('public/js/core/predictive-adaptive-tutor.js','utf8');
  assert.match(source,/importedOrderMutation:false/);
  assert.doesNotMatch(source,/topicState\s*\[[^\]]+\]\s*=/);
});

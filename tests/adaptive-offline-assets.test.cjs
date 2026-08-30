const fs=require('fs');const path=require('path');const test=require('node:test');const assert=require('node:assert/strict');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../config/app-assets.json'),'utf8'));
const sw=fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf8');

const adaptiveAssets=[
  '/js/adaptive-ai-experience.js','/css/adaptive-ai-experience.css','/js/adaptive-feedback-loop.js','/js/method-calibration.js',
  '/js/session-orchestrator.js','/css/session-orchestrator.css','/js/session-continuity.js','/css/session-continuity.css','/js/session-completion.js',
  '/js/daily-adaptive-planner.js','/js/exam-proximity-strategy.js','/js/weakness-map-v2.js','/css/weakness-map-v2.css',
  '/js/question-performance-intelligence.js','/js/intelligent-error-notebook.js','/js/adaptive-flashcards.js','/js/study-evidence-timeline.js',
  '/js/explainable-recommendations.js','/js/adaptive-confidence.js','/js/adaptive-pomodoro-bridge.js','/js/learning-advisor-headless.js',
  '/js/progress-forecast.js','/js/adaptive-weekly-review.js'
];

test('todos os módulos adaptativos dinâmicos têm cache offline opcional',()=>{
  for(const asset of adaptiveAssets)assert.ok(manifest.optionalOfflineAssets.includes(asset),`faltando no optionalOfflineAssets: ${asset}`);
});

test('módulos adaptativos não inflam o app shell crítico',()=>{
  for(const asset of adaptiveAssets)assert.ok(!manifest.criticalAppShell.includes(asset),`asset adaptativo indevidamente crítico: ${asset}`);
});

test('service worker precacheia exatamente os assets adaptativos opcionais',()=>{
  for(const asset of adaptiveAssets){const relative=`.${asset}`;assert.ok(sw.includes(`'${relative}'`)||sw.includes(`\"${relative}\"`),`faltando no service worker: ${relative}`)}
  assert.match(sw,/Promise\.allSettled\(OPTIONAL_OFFLINE_ASSETS\.map/);
  assert.match(sw,/ignoreSearch:true/);
});

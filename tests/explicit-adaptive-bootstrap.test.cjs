const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const pwa=fs.readFileSync('public/js/app-pwa.js','utf8');
const adaptive=fs.readFileSync('public/js/adaptive-ai-experience.js','utf8');
const loader=fs.readFileSync('public/js/performance-loader.js','utf8');

test('startup prepara apenas shell adaptativo leve',()=>{
  assert.match(pwa,/loadAdaptiveRuntimeShell/);
  assert.match(pwa,/performance-loader\.js/);
  assert.match(pwa,/adaptive-ai-experience\.js/);
  const shell=pwa.slice(pwa.indexOf('loadAdaptiveRuntimeShell'));
  assert.doesNotMatch(shell,/\.\/js\/learning-advisor\.js/);
  assert.doesNotMatch(shell,/\.\/js\/critical-points-actions\.js/);
  assert.doesNotMatch(shell,/\.\/js\/app-ai\.js/);
  assert.doesNotMatch(shell,/learning-advisor\.css/);
});

test('ação de calcular plano garante loader e bundle da IA',()=>{
  assert.match(adaptive,/async function ensurePerformanceLoader/);
  assert.match(adaptive,/performance-loader\.js/);
  assert.match(adaptive,/async function ensureAdvisor/);
  assert.match(adaptive,/await ensurePerformanceLoader\(\)/);
  assert.match(adaptive,/loader\.loadBundle\('ai'\)/);
  const refresh=adaptive.indexOf('async function refresh');
  const ensure=adaptive.indexOf('await ensureAdvisor()',refresh);
  assert.ok(refresh>=0&&ensure>refresh);
});

test('bundle de IA inclui estilo e scripts mas não é carregado implicitamente',()=>{
  assert.match(loader,/ai: Object\.freeze/);
  assert.match(loader,/\.\/css\/learning-advisor\.css/);
  assert.match(loader,/\.\/js\/app-ai\.js/);
  assert.match(loader,/\.\/js\/learning-advisor\.js/);
  assert.match(loader,/\.\/js\/critical-points-actions\.js/);
  assert.doesNotMatch(loader,/const warmAi/);
  assert.doesNotMatch(loader,/pointerenter', warmAi/);
  assert.doesNotMatch(loader,/touchstart', warmAi/);
  assert.doesNotMatch(loader,/focus', warmAi/);
  assert.doesNotMatch(loader,/scheduleIdleTask\(\(\) => loadBundle\('ai'\)/);
});

test('startup não calcula recomendação automaticamente e feedback real pode atualizar',()=>{
  assert.doesNotMatch(adaptive,/setTimeout\(\(\)=>refresh\(\{refine:false\}\),500\)/);
  assert.match(adaptive,/adaptiveAiCalculate/);
  assert.match(adaptive,/addEventListener\('click',\(\)=>refresh\(\{refine:false\}\)\)/);
  assert.match(adaptive,/adaptive-feedback-evaluated/);
});

test('captura leve de desempenho em questões permanece no startup',()=>{
  assert.match(pwa,/loadQuestionPerformanceIntelligence/);
  assert.match(pwa,/question-performance-intelligence\.js/);
});

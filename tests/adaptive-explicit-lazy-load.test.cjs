const fs=require('fs');const path=require('path');const test=require('node:test');const assert=require('node:assert/strict');
const file=fs.readFileSync(path.join(__dirname,'../public/js/adaptive-ai-experience.js'),'utf8');
const initStart=file.indexOf('function init(){');
const initEnd=file.indexOf("if(document.readyState==='loading')",initStart);
const initBody=file.slice(initStart,initEnd);

test('startup da experiência adaptativa permanece leve',()=>{
  assert.ok(initStart>=0&&initEnd>initStart);
  assert.match(initBody,/ensureStyle\(\)/);
  assert.match(initBody,/ensurePanel\(\)/);
  assert.doesNotMatch(initBody,/ensureFeedbackLoop\(\)/);
  assert.doesNotMatch(initBody,/ensureCalibration\(\)/);
  assert.doesNotMatch(initBody,/ensureSessionOrchestrator\(\)/);
  assert.doesNotMatch(initBody,/ensureWeaknessMap\(\)/);
  assert.doesNotMatch(initBody,/ensureStudyEvidenceTimeline\(\)/);
  assert.doesNotMatch(initBody,/ensureExplainableRecommendations\(\)/);
  assert.doesNotMatch(initBody,/ensureAdaptiveConfidence\(\)/);
  assert.doesNotMatch(file,/setTimeout\(\(\)=>refresh\(\{refine:false\}\),500\)/);
});

test('módulos adaptativos são ativados dentro do fluxo explícito',()=>{
  assert.match(file,/async function activateAdaptiveModules\(\)/);
  assert.match(file,/ensureFeedbackLoop\(\);ensureCalibration\(\);ensureSessionOrchestrator\(\);ensureWeaknessMap\(\);ensureStudyEvidenceTimeline\(\);ensureExplainableRecommendations\(\);ensureAdaptiveConfidence\(\)/);
  assert.match(file,/await activateAdaptiveModules\(\);const advisor=await ensureAdvisor\(\)/);
  assert.match(file,/adaptiveAiCalculate[^]*refresh\(\{refine:false\}\)/);
});

test('feedback não reativa a IA antes de existir plano do usuário',()=>{
  assert.match(initBody,/adaptive-feedback-evaluated/);
  assert.match(initBody,/if\(currentPlan\)setTimeout\(\(\)=>refresh\(\{refine:false\}\),0\)/);
});

test('marcadores estáveis dos módulos continuam preservados',()=>{
  for(const marker of ['data-adaptive-feedback-loop','data-method-calibration','data-session-orchestrator','data-weakness-map-v2','data-study-evidence-timeline','data-explainable-recommendations','data-adaptive-confidence'])assert.match(file,new RegExp(marker));
});

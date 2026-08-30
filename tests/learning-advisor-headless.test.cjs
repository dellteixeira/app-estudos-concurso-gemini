const fs=require('fs');const path=require('path');const test=require('node:test');const assert=require('node:assert/strict');
const headless=fs.readFileSync(path.join(__dirname,'../public/js/learning-advisor-headless.js'),'utf8');
const experience=fs.readFileSync(path.join(__dirname,'../public/js/adaptive-ai-experience.js'),'utf8');

test('refinamento headless usa endpoint existente sem renderizar modal',()=>{
  assert.match(headless,/\/api\/ai\/learning-diagnosis/);
  assert.match(headless,/AppLearningAdvisorHeadless/);
  assert.doesNotMatch(headless,/renderInterventionShell/);
  assert.doesNotMatch(headless,/ensureDialog/);
  assert.doesNotMatch(headless,/innerHTML\s*=/);
});

test('resposta do provedor é validada e limitada',()=>{
  assert.match(headless,/ACTIONS\.has/);
  assert.match(headless,/DIAGNOSIS_TYPES\.has/);
  assert.match(headless,/SEVERITIES\.has/);
  assert.match(headless,/clamp\(raw\.suggestedMinutes\|\|local\.suggestedMinutes,5,90\)/);
  assert.match(headless,/topicId/);
});

test('dashboard não chama mais analyze para refinar',()=>{
  assert.match(experience,/AppLearningAdvisorHeadless/);
  assert.match(experience,/\.recommend\(/);
  assert.doesNotMatch(experience,/advisor\.analyze\(/);
  assert.match(experience,/data-learning-advisor-headless/);
});

test('headless não assume autoridade de prioridade ou agenda',()=>{
  assert.doesNotMatch(headless,/nextReviewDate\s*=/);
  assert.doesNotMatch(headless,/prioridade\s*=/);
  assert.doesNotMatch(headless,/priorityIndex\s*=/);
  assert.doesNotMatch(headless,/\.sort\s*\(/);
});

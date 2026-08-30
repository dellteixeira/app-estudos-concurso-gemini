const fs=require('fs');const test=require('node:test');const assert=require('node:assert/strict');
const forecast=fs.readFileSync('public/js/progress-forecast.js','utf8');
const experience=fs.readFileSync('public/js/adaptive-ai-experience.js','utf8');

test('forecast exige evidência mínima e limita histórico recente',()=>{
  assert.match(forecast,/const MAX_FEEDBACK=8/);
  assert.match(forecast,/feedback\.length>=3/);
  assert.match(forecast,/feedback\.length>=6&&executions\.length>=6/);
  assert.match(forecast,/feedback\.length>=3&&executions\.length>=3/);
});

test('forecast descreve trajetória e nunca probabilidade de aprovação',()=>{
  assert.match(forecast,/trajectory='insufficient'/);
  assert.match(forecast,/trajectory=averageFeedback>=5\?'improving':averageFeedback<=-5\?'declining':'stable'/);
  assert.match(forecast,/não estima chance de aprovação/);
  assert.match(forecast,/authority:'forecast-only'/);
  assert.doesNotMatch(forecast,/probability|approvalChance|chanceOfApproval/i);
});

test('forecast usa evidências existentes sem criar nova autoridade',()=>{
  assert.match(forecast,/AppStudyEvidenceTimeline/);
  assert.match(forecast,/AppIntelligentErrorNotebook/);
  assert.match(forecast,/AppExamProximityStrategy/);
  assert.match(forecast,/AppDailyAdaptivePlanner/);
  assert.doesNotMatch(forecast,/nextReviewDate\s*=/);
  assert.doesNotMatch(forecast,/prioridade\s*=/i);
  assert.doesNotMatch(forecast,/recommendedAction\s*=/);
  assert.doesNotMatch(forecast,/suggestedMinutes\s*=/);
  assert.doesNotMatch(forecast,/\.sort\s*\(/);
});

test('forecast permanece lazy e usa marcador estável',()=>{
  assert.match(experience,/progress-forecast\.js\?v=20260830/);
  assert.match(experience,/data-progress-forecast/);
  assert.match(experience,/ensureProgressForecast\(\)/);
  assert.doesNotMatch(experience,/setTimeout\(\(\)=>refresh\(\{refine:false\}\),500\)/);
});

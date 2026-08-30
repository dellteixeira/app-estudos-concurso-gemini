const fs=require('node:fs');const path=require('node:path');const test=require('node:test');const assert=require('node:assert/strict');
const review=fs.readFileSync(path.join(__dirname,'../public/js/adaptive-weekly-review.js'),'utf8');
const adaptive=fs.readFileSync(path.join(__dirname,'../public/js/adaptive-ai-experience.js'),'utf8');

test('revisão semanal usa janela fixa de 7 dias e evidências observadas',()=>{
  assert.match(review,/WINDOW_DAYS=7/);
  assert.match(review,/AppStudyEvidenceTimeline/);
  assert.match(review,/execution_finished/);
  assert.match(review,/type==='feedback'/);
  assert.match(review,/AppIntelligentErrorNotebook/);
  assert.match(review,/AppProgressForecast/);
});

test('melhor método exige evidência mínima e não vira motor de decisão',()=>{
  assert.match(review,/item\.count>=2&&item\.averageScore>0/);
  assert.match(review,/authority:'review-only'/);
  assert.doesNotMatch(review,/nextReviewDate\s*=/);
  assert.doesNotMatch(review,/priorityIndex\s*=/);
  assert.doesNotMatch(review,/recommendedAction\s*=/);
  assert.doesNotMatch(review,/suggestedMinutes\s*=/);
});

test('revisão mostra ganhos e sinais de ajuste sem prometer resultado',()=>{
  assert.match(review,/Funcionou bem/);
  assert.match(review,/Ajustar/);
  assert.match(review,/completionRate<\.7/);
  assert.match(review,/average\(scores\)<=-3/);
  assert.doesNotMatch(review,/chance de aprovação|probabilidade de aprovação/i);
});

test('loader mantém revisão semanal sob ativação explícita',()=>{
  assert.match(adaptive,/data-adaptive-weekly-review/);
  assert.match(adaptive,/adaptive-weekly-review\.js/);
  assert.match(adaptive,/ensureWeeklyReview\(\)/);
  const activateIndex=adaptive.indexOf('async function activateAdaptiveModules');
  const weeklyIndex=adaptive.indexOf('ensureWeeklyReview();',activateIndex);
  assert.ok(activateIndex>=0&&weeklyIndex>activateIndex);
  assert.doesNotMatch(adaptive,/setTimeout\(\(\)=>refresh\(\{refine:false\}\),500\)/);
});

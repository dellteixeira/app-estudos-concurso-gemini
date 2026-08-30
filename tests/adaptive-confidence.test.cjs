const fs=require('fs');const path=require('path');const test=require('node:test');const assert=require('node:assert/strict');
const confidence=fs.readFileSync(path.join(__dirname,'../public/js/adaptive-confidence.js'),'utf8');
const experience=fs.readFileSync(path.join(__dirname,'../public/js/adaptive-ai-experience.js'),'utf8');

test('confiança é somente informativa e não altera decisão',()=>{
  assert.match(confidence,/authority:'confidence-only'/);
  assert.doesNotMatch(confidence,/\.sort\s*\(/);
  assert.doesNotMatch(confidence,/nextReviewDate\s*=/);
  assert.doesNotMatch(confidence,/prioridade\s*=/);
  assert.doesNotMatch(confidence,/priorityIndex\s*=/);
  assert.doesNotMatch(confidence,/recommendedAction\s*=/);
  assert.doesNotMatch(confidence,/suggestedMinutes\s*=/);
});

test('confiança considera cobertura e conflito de evidências',()=>{
  assert.match(confidence,/metrics\.retention/);
  assert.match(confidence,/metrics\.accuracy/);
  assert.match(confidence,/metrics\.reviewCount/);
  assert.match(confidence,/metrics\.sessionCount/);
  assert.match(confidence,/getTopicProfile/);
  assert.match(confidence,/getTopicEntries/);
  assert.match(confidence,/getEntries/);
  assert.match(confidence,/retenção e acurácia divergem/);
  assert.match(confidence,/confidence>=75\?'high':confidence>=50\?'medium':'low'/);
});

test('confiança não persiste dados ou conteúdo de estudo',()=>{
  assert.doesNotMatch(confidence,/localStorage\.setItem/);
  assert.doesNotMatch(confidence,/(?:^|[{,\s])questionText\s*:/im);
  assert.doesNotMatch(confidence,/(?:^|[{,\s])answerText\s*:/im);
  assert.doesNotMatch(confidence,/(?:^|[{,\s])front\s*:/im);
  assert.doesNotMatch(confidence,/(?:^|[{,\s])back\s*:/im);
});

test('experiência carrega confiança com marcador estável',()=>{
  assert.match(experience,/data-adaptive-confidence/);
  assert.match(experience,/\.\/js\/adaptive-confidence\.js\?v=20260830/);
  assert.match(experience,/id=\"adaptiveAiConfidence\"/);
  assert.match(experience,/ensureAdaptiveConfidence\(\)/);
});

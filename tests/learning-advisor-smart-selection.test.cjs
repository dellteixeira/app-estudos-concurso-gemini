const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const client=fs.readFileSync(path.join(root,'public/js/learning-advisor.js'),'utf8');
const server=fs.readFileSync(path.join(root,'src/learning-diagnosis.js'),'utf8');

test('learning advisor persists recommendation history when advice is displayed',()=>{
  assert.match(client,/persistDisplayedRecommendations\(payload\)/);
  assert.match(client,/recordRecommendation\(intervention\?\.topicId,intervention\?\.recommendedAction/);
  assert.match(client,/recommendationHistory:getRecommendationHistory\(id\)/);
  assert.match(client,/recommendationHistory\}\)=>\(\{topicId/);
});

test('learning advisor supports 24h postpone without studying',()=>{
  assert.match(client,/const SNOOZE_MS=24\*60\*60\*1000/);
  assert.match(client,/data-learning-action="snooze"/);
  assert.match(client,/Adiar 24h/);
  assert.match(client,/snoozeTopic\(topicId,24\)/);
  assert.match(client,/if\(isSnoozed\(id\)\)return null/);
  assert.match(client,/Adiar não registra estudo nem altera a retenção/);
  assert.match(client,/global\.buildRetentionDiagnostics=function advisorAwareRetentionDiagnostics/);
  assert.match(client,/const keep=row=>!isSnoozed\(row\?\.state\?\.key\|\|''\)/);
});

test('AI recommendation is authoritative for the recommended local layer',()=>{
  assert.match(client,/const ACTION_LAYER=\{active_recall:1,short_review:2,questions:3,focused_restudy:4\}/);
  assert.match(client,/global\.getLayeredReviewPlan=function advisorAwareLayeredReviewPlan/);
  assert.match(client,/recommendedLayer:layer/);
  assert.match(client,/global\.__learningAdvisorLayerOverride=override/);
  assert.match(client,/openLocalIntervention\(Number\(button\.dataset\.rowIndex\),intervention\)/);
});

test('backend selector is constrained to the four layered interventions',()=>{
  assert.match(server,/SELECTOR_ACTIONS=new Set\(\['active_recall','short_review','questions','focused_restudy'\]\)/);
  assert.match(server,/enum:\[\.\.\.SELECTOR_ACTIONS\]/);
  assert.doesNotMatch(server,/enum:\[\.\.\.ACTIONS\]/);
});

test('backend penalizes and blocks immediate recommendation repetition',()=>{
  assert.match(server,/topic\.recommendationHistory\.forEach/);
  assert.match(server,/if\(index===history\.length-1\)penalty\+=34/);
  assert.match(server,/if\(lastAction&&selected===lastAction\)/);
  assert.match(server,/if\(lastAction&&aiAction===lastAction\)return fallback/);
  assert.match(server,/antiRepeat:true/);
});

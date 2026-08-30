const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const adaptive=fs.readFileSync(path.join(root,'public/js/adaptive-ai-experience.js'),'utf8');
const navigation=fs.readFileSync(path.join(root,'public/js/ui/navigation.js'),'utf8');
const style=fs.readFileSync(path.join(root,'public/css/adaptive-ai-experience.css'),'utf8');

test('adaptive experience keeps Learning Advisor as topic authority and Retention Engine as schedule authority',()=>{
  assert.match(adaptive,/collectCandidates\?\.\(1\)/);
  assert.match(adaptive,/localIntervention\?\.\(candidate\)/);
  assert.match(adaptive,/source:'learning-advisor'/);
  assert.match(adaptive,/agenda Retention Engine/);
  assert.doesNotMatch(adaptive,/autoSchedule\s*=\s*true/);
});

test('adaptive experience loads AI only through the on-demand bundle',()=>{
  assert.match(adaptive,/loader\?\.loadBundle/);
  assert.match(adaptive,/loadBundle\('ai'\)/);
  assert.match(adaptive,/Refinar com IA/);
});

test('dashboard exposes topic method and duration in one plan',()=>{
  assert.match(adaptive,/adaptiveAiTopic/);
  assert.match(adaptive,/adaptiveAiAction/);
  assert.match(adaptive,/adaptiveAiMinutes/);
  assert.match(adaptive,/suggestedMinutes/);
});

test('navigation bootstraps the adaptive experience without touching monolithic index',()=>{
  assert.match(navigation,/adaptive-ai-experience\.js/);
  assert.match(navigation,/ensureAdaptiveAIExperience/);
  assert.ok(style.length>100);
});

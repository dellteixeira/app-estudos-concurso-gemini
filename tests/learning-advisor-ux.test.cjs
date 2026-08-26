'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'public/js/learning-advisor.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/css/learning-advisor.css'),'utf8');

test('critical points use the unified advisor dialog with keyboard contract',()=>{
  assert.match(js,/openCriticalView/);
  assert.match(js,/\[data-action="retention-more"\]/);
  assert.match(js,/event\.key==='Escape'|e\.key==='Escape'/);
  assert.match(js,/event\.key==='Enter'|e\.key==='Enter'/);
  assert.match(js,/data-enter-default/);
  assert.doesNotMatch(js,/document\.getElementById\('learningAdvisorPanel'\)\?\.remove\(\)/);
});

test('retention metric cards share the unified details experience',()=>{
  assert.match(js,/METRIC_CONFIG/);
  assert.match(js,/risk:\{title:'Assuntos em risco'/);
  assert.match(js,/overdue:\{title:'Revisões vencidas'/);
  assert.match(js,/mastered:\{title:'Assuntos dominados'/);
  assert.match(js,/openMetricView/);
  assert.match(js,/\[data-action="retention-details"\]\[data-metric\]/);
  assert.match(js,/Revisar primeira vencida/);
  assert.match(js,/Domínio validado/);
});

test('AI advisor has a stable full-width entry point and keeps retention authority',()=>{
  assert.match(js,/learningAdvisorPanelButton/);
  assert.match(js,/\/api\/ai\/learning-diagnosis/);
  assert.match(js,/authority:'retention-engine'/);
  assert.match(css,/\.learning-advisor-bar\{/);
});

test('subject lifecycle exposes review-later and complete flows',()=>{
  assert.match(js,/review_later/);
  assert.match(js,/status:later\?'review_later':'completed'/);
  assert.match(js,/filterSchedule/);
  assert.match(css,/\.materia-completion-btn/);
  assert.match(css,/\.materia-lifecycle-badge/);
});

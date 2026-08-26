const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');

test('more critical points uses canonical modal and removes legacy modal class',()=>{
  const html=read('public/index.html');
  assert.match(html,/id="modalRetentionMore"[^>]*hidden[^>]*aria-hidden="true"/);
  assert.match(html,/class="modal retention-more-modal"/);
  assert.match(html,/aria-labelledby="retentionMoreTitle"/);
  assert.doesNotMatch(html,/retention-more-modal-content/);
});

test('critical cards expose review-later and complete actions with persistent manual disposition',()=>{
  const ui=read('public/js/app-ui.js');
  assert.match(ui,/data-dynamic-action="defer-retention-topic"/);
  assert.match(ui,/data-dynamic-action="complete-retention-topic"/);
  assert.match(ui,/manualReviewSnoozedUntil/);
  assert.match(ui,/manualCompletedAt/);
  assert.match(ui,/removeTopicFromFutureSchedule/);
  assert.match(ui,/event\.key === 'Escape'/);
  assert.match(ui,/event\.key === 'Enter'/);
});

test('manual completion counts as completed progress without overwriting retention evidence',()=>{
  const core=read('public/js/app-core.js');
  assert.match(core,/isManualComplete/);
  assert.match(core,/manualCompletedAt/);
});

test('learning advisor endpoint is routed by Worker and frontend surfaces failures',()=>{
  const worker=read('src/index.js');
  const advisor=read('public/js/learning-advisor.js');
  assert.match(worker,/handleLearningDiagnosis/);
  assert.match(worker,/\/api\/ai\/learning-diagnosis/);
  assert.match(worker,/\/css\/learning-advisor\.css/);
  assert.match(worker,/\/js\/learning-advisor\.js/);
  assert.match(advisor,/appNotice/);
  assert.match(advisor,/aria-busy/);
  assert.match(advisor,/VERSION='1\.2\.0'/);
});

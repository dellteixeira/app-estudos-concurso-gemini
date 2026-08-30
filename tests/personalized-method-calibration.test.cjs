const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const calibration=fs.readFileSync(path.join(root,'public/js/method-calibration.js'),'utf8');
const experience=fs.readFileSync(path.join(root,'public/js/adaptive-ai-experience.js'),'utf8');

test('calibration only acts on pedagogical method and duration',()=>{
  assert.match(calibration,/authority:'pedagogical-method-only'/);
  assert.match(calibration,/ALLOWED_BY_DIAGNOSIS/);
  assert.match(calibration,/MIN_SAMPLES=3/);
  assert.match(calibration,/SWITCH_MARGIN=8/);
  assert.doesNotMatch(calibration,/priority|prioridade|cronograma|schedule/i);
});

test('adaptive experience applies calibration after deterministic and AI recommendations',()=>{
  assert.match(experience,/calibrate\(advisor\.localIntervention/);
  assert.match(experience,/const intervention=calibrate\(raw\)/);
  assert.match(experience,/ensureCalibration\(\)/);
});

test('feedback remains the only efficacy source',()=>{
  assert.match(calibration,/AppAdaptiveFeedbackLoop\?\.getActionStats/);
  assert.doesNotMatch(calibration,/fetch\(|localStorage|sessionStorage/);
});

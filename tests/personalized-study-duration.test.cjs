const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const feedback=fs.readFileSync('public/js/adaptive-feedback-loop.js','utf8');
const calibration=fs.readFileSync('public/js/method-calibration.js','utf8');

test('duração usa somente histórico atribuído',()=>{
  assert.match(feedback,/attributedHistory\(\)/);
  assert.match(feedback,/item\?\.attributed===true/);
  assert.match(feedback,/getDurationStats/);
  assert.match(feedback,/executedMinutes/);
});

test('calibração exige amostra mínima, piso absoluto e margem contra outros buckets',()=>{
  assert.match(calibration,/const MIN_SAMPLES=3/);
  assert.match(calibration,/const DURATION_MARGIN=3/);
  assert.match(calibration,/const DURATION_ABSOLUTE_FLOOR=5/);
  assert.match(calibration,/const DURATION_MIN_COMPLETION=\.7/);
  assert.match(calibration,/row\.count>=MIN_SAMPLES/);
  assert.match(calibration,/const comparisonRows=rows\.filter\(row=>row!==best\)/);
  assert.match(calibration,/weightedAverage\(comparisonRows\)/);
});

test('ajuste de duração permanece limitado a vinte por cento',()=>{
  assert.match(calibration,/const MAX_MINUTES_DELTA=\.2/);
  assert.match(calibration,/1-MAX_MINUTES_DELTA/);
  assert.match(calibration,/1\+MAX_MINUTES_DELTA/);
});

test('calibração preserva autoridade de método e separa duração',()=>{
  assert.doesNotMatch(calibration,/collectCandidates/);
  assert.doesNotMatch(calibration,/autoSchedule\s*=\s*true/);
  assert.doesNotMatch(calibration,/nextReviewDate\s*=/);
  assert.match(calibration,/authority:'pedagogical-method-only'/);
  assert.match(calibration,/durationAuthority:'pedagogical-duration-only'/);
});

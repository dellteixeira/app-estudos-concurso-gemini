const fs=require('fs');const vm=require('vm');const test=require('node:test');const assert=require('node:assert/strict');
const source=fs.readFileSync('public/js/method-calibration.js','utf8');

function loadWith(rows){
  const window={AppAdaptiveFeedbackLoop:{getActionStats:()=>[],getDurationStats:()=>rows}};
  vm.runInNewContext(source,{window,console});
  return window.AppMethodCalibration;
}

test('um único bucket forte pode orientar ajuste conservador',()=>{
  const api=loadWith([{action:'active_recall',minutes:20,count:3,averageScore:6,averageCompletionRatio:.9}]);
  const result=api.chooseDuration('active_recall',15);
  assert.equal(result.minutes,18);
  assert.equal(result.reason,'personal-duration-positive-evidence');
});

test('um único bucket fraco não altera duração',()=>{
  const api=loadWith([{action:'active_recall',minutes:20,count:3,averageScore:2,averageCompletionRatio:.95}]);
  const result=api.chooseDuration('active_recall',15);
  assert.equal(result.minutes,15);
  assert.equal(result.reason,'insufficient-comparative-evidence');
});

test('comparação exclui o próprio melhor bucket da baseline',()=>{
  const api=loadWith([
    {action:'active_recall',minutes:20,count:3,averageScore:8,averageCompletionRatio:.9},
    {action:'active_recall',minutes:15,count:3,averageScore:4,averageCompletionRatio:.9}
  ]);
  const result=api.chooseDuration('active_recall',15);
  assert.equal(result.minutes,18);
  assert.equal(result.reason,'personal-duration-comparative-evidence');
});

test('margem insuficiente mantém a duração base',()=>{
  const api=loadWith([
    {action:'active_recall',minutes:20,count:3,averageScore:6,averageCompletionRatio:.9},
    {action:'active_recall',minutes:15,count:3,averageScore:4,averageCompletionRatio:.9}
  ]);
  const result=api.chooseDuration('active_recall',15);
  assert.equal(result.minutes,15);
  assert.equal(result.reason,'duration-margin-not-met');
});

test('baixa conclusão bloqueia ajuste mesmo com score alto',()=>{
  const api=loadWith([{action:'active_recall',minutes:20,count:3,averageScore:9,averageCompletionRatio:.6}]);
  const result=api.chooseDuration('active_recall',15);
  assert.equal(result.minutes,15);
  assert.equal(result.reason,'duration-completion-too-low');
});

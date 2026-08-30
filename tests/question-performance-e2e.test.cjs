const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const core=fs.readFileSync('public/js/app-core.js','utf8');
const intelligence=fs.readFileSync('public/js/question-performance-intelligence.js','utf8');

test('fluxo real de questões continua sendo a fonte de desempenho',()=>{
  assert.match(core,/async function submitQuestionPerformance\(\)/);
  assert.match(core,/session\.questionPerformance = performance/);
  assert.match(core,/session\.questionAccuracy = performance\.accuracy/);
  assert.match(core,/await saveConcursosMetadata\(metadata\)/);
});

test('inteligência envolve open/submit/close reais sem alterar app-core',()=>{
  assert.match(intelligence,/global\.openQuestionPerformanceModal/);
  assert.match(intelligence,/global\.submitQuestionPerformance/);
  assert.match(intelligence,/global\.closeQuestionPerformanceModal/);
  assert.match(intelligence,/submitOriginal\.apply/);
  assert.match(intelligence,/modal\?\.hidden===true/);
});

test('evento é emitido somente após submissão concluída',()=>{
  const awaitIndex=intelligence.indexOf('await submitOriginal.apply');
  const dispatchIndex=intelligence.indexOf("new CustomEvent('adaptive-question-result'");
  assert.ok(awaitIndex>=0&&dispatchIndex>awaitIndex);
  assert.match(intelligence,/completed=Boolean\(context\?\.topicId\)/);
  assert.match(intelligence,/correct:correct===total/);
  assert.match(intelligence,/errorCount:Math\.max\(0,Math\.round\(total-correct\)\)/);
  assert.match(intelligence,/accuracy:Math\.round\(\(correct\/total\)\*100\)/);
});

test('ponte não coleta conteúdo de questão ou resposta',()=>{
  assert.doesNotMatch(intelligence,/questionText|enunciado|alternativas|answerText|correctAnswer|pergunta|resposta/);
  assert.match(intelligence,/source:'core-question-performance'/);
  assert.match(intelligence,/authority:'diagnostic-only'/);
});

test('ponte é idempotente e tolera ordem de carregamento',()=>{
  assert.match(intelligence,/coreBridgeInstalled/);
  assert.match(intelligence,/scheduleCoreBridge/);
  assert.match(intelligence,/attempts>=40/);
  assert.match(intelligence,/installCoreBridge/);
});

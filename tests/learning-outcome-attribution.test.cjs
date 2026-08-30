const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const file=path.join(process.cwd(),'public/js/adaptive-feedback-loop.js');
const source=fs.readFileSync(file,'utf8');

test('feedback exige execução concluída antes de atribuir eficácia',()=>{
  assert.match(source,/executionStatus:'pending'/);
  assert.match(source,/entry\?\.executionStatus!=='completed'/);
  assert.match(source,/attributed:true/);
  assert.match(source,/filter\(item=>item\?\.attributed===true\)/);
});

test('interrupção e abandono não entram no histórico de eficácia',()=>{
  assert.match(source,/executionStatus==='interrupted'/);
  assert.match(source,/executionStatus==='abandoned'/);
  assert.match(source,/recordExecutionOutcome/);
  assert.match(source,/adaptive-session-execution-finished/);
});

test('atribuição continua sem autoridade sobre prioridade ou cronograma',()=>{
  assert.doesNotMatch(source,/setPriority|updatePriority|reorder|reschedule|scheduleDate|nextReviewDate/);
});

test('dados persistidos de execução permanecem operacionais',()=>{
  assert.doesNotMatch(source,/email\s*:|userId\s*:|prompt\s*:|response\s*:/);
  assert.match(source,/executedMinutes/);
  assert.match(source,/completionRatio/);
});

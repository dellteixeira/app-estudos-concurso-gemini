const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Learning Advisor sincroniza ciclo de vida com Retenção e Diagnóstico',()=>{
  const js=read('public/js/learning-advisor.js');
  assert.match(js,/subjectLifecycle/);
  assert.match(js,/status==='completed'/);
  assert.match(js,/status:later\?'review_later':'completed'/);
  assert.match(js,/installDiagnosticsLifecycleFilter/);
  assert.match(js,/global\.buildRetentionDiagnostics=wrapped/);
  assert.match(js,/rows\.reduce\(\(sum,row\)=>sum\+Number\(row\?\.retention\|\|0\),0\)\/rows\.length/);
  assert.match(js,/Revisar depois/);
  assert.match(js,/Finalizar/);
});

test('review_later preserva revisões e completed remove toda a matéria do cronograma',()=>{
  const js=read('public/js/learning-advisor.js');
  assert.match(js,/mode==='review_later'\?isRevisionScheduleText\(raw\):false/);
  assert.match(js,/if\(!later\)\{[\s\S]*item\.rev_24h=true;item\.rev_7d=true;item\.rev_30d=true;/);
  assert.match(js,/filterSchedule\(contest\.dateSchedule\|\|\{\},materia,mode\)/);
});

test('completed é excluído, review_later continua elegível nos diagnósticos',()=>{
  const js=read('public/js/learning-advisor.js');
  assert.match(js,/return !item\|\|!isCompletedMateria\(item\.materia\)/);
  assert.doesNotMatch(js,/status==='review_later'.*filterDiagnosticsRows/);
});

test('arquivo do advisor permanece textual e termina com newline',()=>{
  const js=read('public/js/learning-advisor.js');
  assert.ok(js.endsWith('\n'));
  assert.ok(!js.includes('\u0000'));
  assert.ok(!js.includes('\uFFFD'));
});

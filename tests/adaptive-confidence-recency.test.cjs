const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');

const source=fs.readFileSync('public/js/adaptive-confidence.js','utf8');

function loadConfidence(entries){
  const window={
    AppStudyEvidenceTimeline:{getEntries:()=>entries},
    AppQuestionPerformanceIntelligence:{getTopicProfile:()=>null},
    AppIntelligentErrorNotebook:{getTopicEntries:()=>[]},
    addEventListener(){},
    dispatchEvent(){}
  };
  const context={window,document:{readyState:'loading',addEventListener(){},getElementById(){return null}},CustomEvent:function(){},setTimeout(){}};
  vm.runInNewContext(source,context);
  return window.AppAdaptiveConfidence;
}

function plan(){return{candidate:{topicId:'topic-1',metrics:{}},intervention:{recommendedAction:'study',suggestedMinutes:30}}}
function daysAgo(days){return new Date(Date.now()-(days*24*60*60*1000)).toISOString()}

test('confiança usa janela comportamental de 30 dias',()=>{
  const oldEntries=[
    {type:'execution_finished',status:'completed',at:daysAgo(31)},
    {type:'feedback',score:90,at:daysAgo(31)}
  ];
  const recentEntries=[
    {type:'execution_finished',status:'completed',at:daysAgo(2)},
    {type:'feedback',score:90,at:daysAgo(1)}
  ];
  const oldResult=loadConfidence(oldEntries).score(plan());
  const recentResult=loadConfidence(recentEntries).score(plan());

  assert.equal(oldResult.evidenceWindowDays,30);
  assert.equal(oldResult.recentCompletedExecutions,0);
  assert.equal(oldResult.recentAttributedFeedback,0);
  assert.equal(oldResult.evidenceAgeDays,null);
  assert.match(oldResult.uncertaintyReasons.join(' '),/sem evidência comportamental recente \(30 dias\)/);
  assert.equal(recentResult.recentCompletedExecutions,1);
  assert.equal(recentResult.recentAttributedFeedback,1);
  assert.ok(recentResult.confidence>oldResult.confidence);
  assert.ok(recentResult.evidenceAgeDays>=0&&recentResult.evidenceAgeDays<=2);
});

test('execução interrompida e feedback sem score não contam mesmo quando recentes',()=>{
  const result=loadConfidence([
    {type:'execution_finished',status:'interrupted',at:daysAgo(1)},
    {type:'feedback',score:null,at:daysAgo(1)}
  ]).score(plan());

  assert.equal(result.recentCompletedExecutions,0);
  assert.equal(result.recentAttributedFeedback,0);
  assert.match(result.uncertaintyReasons.join(' '),/sem evidência comportamental recente/);
});

test('camada preserva autoridade confidence-only e não altera plano',()=>{
  const confidence=loadConfidence([]);
  const input=plan();
  const before=JSON.stringify(input);
  const result=confidence.score(input);

  assert.equal(result.authority,'confidence-only');
  assert.equal(JSON.stringify(input),before);
  assert.equal(input.intervention.recommendedAction,'study');
  assert.equal(input.intervention.suggestedMinutes,30);
});

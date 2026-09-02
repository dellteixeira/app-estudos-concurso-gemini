'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

function loadAssessment(){
  const events=[];
  const window={CustomEvent:function(name,init){this.type=name;this.detail=init?.detail},dispatchEvent:event=>events.push(event)};
  window.window=window;
  vm.runInNewContext(read('public/js/core/domain-risk-dashboard.js'),{window,console,Math,Number,String,Object,Array,Date,JSON,CustomEvent:window.CustomEvent});
  return {api:window.AppTopicAssessment,compat:window.AppDomainRiskDashboard,events};
}

test('8A removes active DOM/listener work from hidden dashboards',()=>{
  const domain=read('public/js/core/domain-risk-dashboard.js');
  const optimizerDashboard=read('public/js/core/study-optimization-dashboard.js');
  const css=read('public/css/study-optimization.css');
  assert.doesNotMatch(domain,/document\.(getElementById|querySelector|addEventListener)/);
  assert.doesNotMatch(domain,/MutationObserver|setTimeout\s*\(/);
  assert.match(optimizerDashboard,/disabled:true/);
  assert.doesNotMatch(optimizerDashboard,/buildPlan\s*\(/);
  assert.ok(css.length<300,'hidden dashboard CSS should remain a tiny compatibility rule');
});

test('8B normalizes nested and flattened cognitive candidates consistently',()=>{
  const {api}=loadAssessment();
  assert.ok(api);
  const nested={retention:70,accuracy:55,lapseCount:1,domainRisk:{masteryScore:32,forgettingRisk:82,predictedRetention7d:44,evidenceLevel:'high',trend:'declining'}};
  const flat={retention:70,accuracy:55,lapseCount:1,masteryScore:32,forgettingRisk:82,predictedRetention7d:44,evidenceLevel:'high',trend:'declining'};
  const a=api.normalizeTopicState(nested),b=api.normalizeTopicState(flat);
  assert.equal(a.mastery,b.mastery);
  assert.equal(a.forgettingRisk,b.forgettingRisk);
  assert.equal(a.predictedRetention7d,b.predictedRetention7d);
  assert.equal(a.evidenceLevel,b.evidenceLevel);
  assert.equal(api.expectedGain(nested,25),api.expectedGain(flat,25));
  assert.equal(api.optimizationScore(nested),api.optimizationScore(flat));
  assert.equal(api.chooseOptimizationMethod(nested).method,api.chooseOptimizationMethod(flat).method);
});

test('8B preserves imported order as contextual signal only',()=>{
  const {api}=loadAssessment();
  const state={materia:'A',assunto:'B',editalPriority:1,topicPriority:1,retention:60,accuracy:60,domainRisk:{masteryScore:60,forgettingRisk:50,predictedRetention7d:55,evidenceLevel:'medium'}};
  const result=api.assessTopic({topicState:{'a::b':state}},'a::b');
  assert.equal(result.editalPriority,1);
  assert.equal(result.topicPriority,1);
  assert.equal(result.importedOrderMutation,false);
});

test('optimizer delegates shared assessment and never creates blocks above 35 minutes',()=>{
  const source=read('public/js/core/study-optimization-engine.js');
  assert.match(source,/AppTopicAssessment/);
  assert.match(source,/MAX_BLOCK_MINUTES=35/);
  assert.doesNotMatch(source,/minutes:last\.minutes\+remaining/);
});

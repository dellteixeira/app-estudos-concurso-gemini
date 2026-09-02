'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const assessment=read('public/js/core/topic-assessment.js');
const optimizer=read('public/js/core/study-optimization-engine.js');
const nextBest=read('public/js/core/next-best-study-action.js');
const tutor=read('public/js/core/predictive-adaptive-tutor.js');

test('8D removes final DomainRiskDashboard compatibility global',()=>{
  assert.equal(assessment.includes('AppDomainRiskDashboard'),false);
});

test('8D makes TopicAssessment the single owner of shared cognitive semantics',()=>{
  assert.equal(optimizer.includes('legacySignals'),false);
  assert.equal(optimizer.includes("s.forgettingRisk*.30+(100-s.mastery)*.24"),false);
  assert.equal(nextBest.includes('const shared=assessment()?.normalizeTopicState'),false);
  assert.equal(tutor.includes('const domain=state.domainRisk||{}'),false);
  for(const source of [optimizer,nextBest,tutor]) assert.equal(source.includes('requireAssessment()'),true);
});

test('canonical priority contract is explicit and immutable',()=>{
  const window={};window.window=window;
  vm.runInNewContext(assessment,{window,Math,Number,String,Object,Array,Date,JSON});
  const contract=window.AppTopicAssessment.priorityContract;
  assert.equal(contract.importedOrderMutation,false);
  assert.equal(contract.editalPriority,'canonical-imported-order');
  assert.equal(contract.topicPriority,'canonical-imported-order');
  assert.equal(contract.learnerUrgency,'dynamic-context-only');
  assert.equal(contract.recommendationScore,'dynamic-context-only');
});

test('predictive tutor ready event is guarded for headless runtime',()=>{
  assert.equal(tutor.includes("typeof global.CustomEvent==='function'"),true);
  const window={AppTopicAssessment:{normalizeTopicState:()=>({})}};window.window=window;
  assert.doesNotThrow(()=>vm.runInNewContext(tutor,{window,Math,Number,String,Object,Array,Date,JSON,WeakMap}));
});

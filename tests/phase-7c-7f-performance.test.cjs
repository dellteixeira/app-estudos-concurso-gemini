const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function runBrowserModule(path,extras={}){
  const code=fs.readFileSync(path,'utf8');
  const events=[];
  const window={
    ...extras,
    dispatchEvent:event=>events.push(event),
    addEventListener:()=>{},
    setTimeout,
    clearTimeout,
    CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail}},
    localStorage:extras.localStorage||{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  };
  window.window=window;
  const context=vm.createContext({window,globalThis:window,CustomEvent:window.CustomEvent,setTimeout,clearTimeout,console,Date,Math,Object,Array,Map,WeakMap,JSON,Number,String,Boolean,RegExp});
  if(path==='public/js/core/predictive-adaptive-tutor.js'||path==='public/js/core/study-optimization-engine.js'){
    const assessmentCode=fs.readFileSync('public/js/core/topic-assessment.js','utf8');
    vm.runInContext(assessmentCode,context,{filename:'public/js/core/topic-assessment.js'});
  }
  vm.runInContext(code,context,{filename:path});
  return {window,events};
}

test('7C: patch incremental atualiza somente o tópico e incrementa revisão',()=>{
  const store=new Map();
  const localStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
  const {window}=runBrowserModule('public/js/core/cognitive-profile.js',{localStorage});
  const api=window.AppCognitiveProfile;
  const base=api.buildProfile({userId:'u1',contest:'c1',rows:[
    {materia:'Português',assunto:'Pontuação',retention:60,questionAccuracy:50,state:{sessionCount:1,reviewCount:1,difficulty:5}},
    {materia:'Direito',assunto:'Constitucional',retention:80,questionAccuracy:75,state:{sessionCount:1,reviewCount:1,difficulty:5}}
  ]});
  api.write(base);
  const untouched=base.topicState['direito::constitucional'];
  const patched=api.patchTopic({userId:'u1',contest:'c1',row:{materia:'Português',assunto:'Pontuação',retention:70,questionAccuracy:65,state:{sessionCount:2,reviewCount:2,difficulty:5}}});
  assert.equal(patched.revision,base.revision+1);
  assert.equal(patched.incremental.metricsStale,true);
  assert.equal(patched.topicState['direito::constitucional'],untouched);
  assert.equal(patched.topicState['português::pontuação'].retention,70);
  assert.equal(api.performanceDiagnostics().incrementalPatches,1);
});

test('7D: previsões repetidas usam cache por identidade do snapshot',()=>{
  const {window}=runBrowserModule('public/js/core/predictive-adaptive-tutor.js');
  const api=window.AppPredictiveAdaptiveTutor;
  const state={retention:75,accuracy:68,confidence:.8,lapseCount:1,domainRisk:{masteryScore:72,predictedRetention7d:66,forgettingRisk:35,evidenceLevel:'high',trend:'stable'}};
  const first=api.predictTopic(state);
  const second=api.predictTopic(state);
  assert.equal(first,second);
  const profile={revision:2,topicState:{'m::a':state}};
  const p1=api.predictProfile(profile);
  const p2=api.predictProfile(profile);
  assert.equal(p1,p2);
  const d=api.cacheDiagnostics();
  assert.equal(d.topicComputations,1);
  assert.ok(d.topicCacheHits>=1);
  assert.equal(d.profileComputations,1);
  assert.ok(d.profileCacheHits>=1);
});

test('7E: fast path por tópico não varre nem ordena o Student Model inteiro',()=>{
  const {window}=runBrowserModule('public/js/core/study-optimization-engine.js');
  const topicState={};
  for(let i=0;i<500;i++)topicState[`m::a${i}`]={canonicalIndex:i,materia:'M',assunto:`A${i}`,retention:60,accuracy:55,lapseCount:1,editalPriority:2,topicPriority:2,domainRisk:{masteryScore:58,forgettingRisk:52,predictedRetention7d:50,evidenceLevel:'medium',trend:'stable'}};
  const profile={topicState};
  const result=window.AppStudyOptimization.forTopic('m::a250',30,{profile});
  assert.equal(result.sourceTopicCount,1);
  assert.equal(result.block.topicId,'m::a250');
  const d=window.AppStudyOptimization.performanceDiagnostics();
  assert.equal(d.topicPlans,1);
  assert.equal(d.globalPlans,0);
  assert.equal(d.candidateScans,0);
});

test('7F: budgets permanentes protegem layout, ordem e fórmulas',()=>{
  const budget=JSON.parse(fs.readFileSync('config/performance-budget.json','utf8'));
  assert.equal(budget.contracts.layoutMutation,false);
  assert.equal(budget.contracts.importedOrderMutation,false);
  assert.equal(budget.contracts.pedagogicalFormulaMutation,false);
  assert.equal(budget.budgets.singleTopicCandidateScans,0);
  const critical=fs.readFileSync('public/js/critical-points-actions.js','utf8');
  assert.match(critical,/AppStudyOptimization\.forTopic/);
  assert.doesNotMatch(critical,/AppStudyOptimization\.plan\(30,\{profile,source:'critical-points'\}\)/);
});

test('7F: observabilidade incorpora diagnósticos de performance sem nova UI',()=>{
  const source=fs.readFileSync('public/js/core/study-observability.js','utf8');
  assert.match(source,/performance:Object\.freeze/);
  assert.match(source,/cognitiveProfile:/);
  assert.match(source,/predictionCache:/);
  assert.match(source,/studyOptimization:/);
});

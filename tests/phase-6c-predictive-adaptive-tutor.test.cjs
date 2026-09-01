const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/core/predictive-adaptive-tutor.js','utf8');

function boot(){
  const events=[];
  const window={
    console,
    currentUser:{id:'u1'},
    currentConcurso:'C1',
    AppStudyEvents:{emit(name,detail){events.push({name,detail})}},
    CustomEvent:function(name,options){this.type=name;this.detail=options?.detail},
    dispatchEvent(){},
    AppCognitiveProfile:{read(){return null}}
  };
  window.window=window;
  const context=vm.createContext({window,console,CustomEvent:window.CustomEvent});
  vm.runInContext(source,context);
  return{window,events};
}

function profile(){
  return{topicState:{
    'portugues::pontuacao':{materia:'Português',assunto:'Pontuação',retention:82,accuracy:58,confidence:72,lapseCount:1,editalPriority:1,topicPriority:1,domainRisk:{masteryScore:68,predictedRetention7d:76,forgettingRisk:34,evidenceLevel:'high',trend:'stable'}},
    'constitucional::controle':{materia:'Constitucional',assunto:'Controle',retention:46,accuracy:44,confidence:50,lapseCount:4,editalPriority:2,topicPriority:2,domainRisk:{masteryScore:38,predictedRetention7d:39,forgettingRisk:72,evidenceLevel:'medium',trend:'declining'}}
  }};
}

test('predictive tutor installs without UI or imported-order mutation',()=>{
  const {window}=boot();
  assert.ok(window.AppPredictiveAdaptiveTutor);
  assert.doesNotMatch(source,/createElement|innerHTML|appendChild/);
  assert.doesNotMatch(source,/topicState\s*\[[^\]]+\]\s*=/);
  assert.match(source,/importedOrderMutation:false/);
});

test('topic prediction differentiates strong and weak evidence states',()=>{
  const {window}=boot();
  const p=profile();
  const strong=window.AppPredictiveAdaptiveTutor.predictTopic(p.topicState['portugues::pontuacao']);
  const weak=window.AppPredictiveAdaptiveTutor.predictTopic(p.topicState['constitucional::controle']);
  assert.ok(strong.expectedPerformance>weak.expectedPerformance);
  assert.ok(strong.uncertainty<weak.uncertainty);
  assert.ok(weak.forgettingRisk>strong.forgettingRisk);
});

test('profile prediction preserves canonical topic order in output',()=>{
  const {window}=boot();
  const result=window.AppPredictiveAdaptiveTutor.predictProfile(profile());
  assert.equal(result.topics[0].topicId,'portugues::pontuacao');
  assert.equal(result.topics[0].canonicalIndex,0);
  assert.equal(result.topics[1].topicId,'constitucional::controle');
  assert.equal(result.topics[1].canonicalIndex,1);
});

test('goal probability is bounded and responds to target difficulty',()=>{
  const {window}=boot();
  const low=window.AppPredictiveAdaptiveTutor.probabilityOfGoal(profile(),50);
  const high=window.AppPredictiveAdaptiveTutor.probabilityOfGoal(profile(),85);
  assert.ok(low.probability>=0&&low.probability<=100);
  assert.ok(high.probability>=0&&high.probability<=100);
  assert.ok(low.probability>high.probability);
});

test('tutor switches intervention according to predicted state',()=>{
  const {window}=boot();
  const p=profile();
  const application=window.AppPredictiveAdaptiveTutor.tutorDecision(p.topicState['portugues::pontuacao'],{});
  const weak=window.AppPredictiveAdaptiveTutor.tutorDecision(p.topicState['constitucional::controle'],{});
  assert.equal(application.action,'questions');
  assert.equal(weak.action,'focused_restudy');
  assert.equal(application.importedOrderMutation,false);
  assert.equal(weak.importedOrderMutation,false);
});

test('resolve emits canonical prediction event',()=>{
  const {window,events}=boot();
  const p=profile();
  const result=window.AppPredictiveAdaptiveTutor.resolve({profile:p,target:70,topicId:'constitucional::controle'});
  assert.ok(result.goal);
  assert.ok(result.tutor);
  assert.ok(events.some(event=>event.name==='study:prediction-resolved'));
});

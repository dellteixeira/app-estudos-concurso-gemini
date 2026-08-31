const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function loadModule({boardSignal=null}={}){
  const source=fs.readFileSync('public/js/core/next-best-study-action.js','utf8');
  const listeners=new Map();
  const window={
    addEventListener(type,fn){listeners.set(type,fn);},
    dispatchEvent(){},
    AppCognitiveProfile:{read(){return null;}},
    AppExamBoardIntelligence:boardSignal?{signalForTopic:boardSignal}:undefined
  };
  window.window=window;
  class CustomEvent{constructor(type,init){this.type=type;this.detail=init?.detail;}}
  vm.runInNewContext(source,{window,CustomEvent,Date,Math,Number,String,Object,Array,JSON,console});
  return window.AppNextBestStudyAction;
}

test('recommend selects the topic with the highest cognitive priority',()=>{
  const api=loadModule();
  const profile={
    userId:'u1',contest:'TJ',metrics:{fatigueIndex:20},
    recurringErrors:[{topicId:'constitucional::controle',type:'forgetting',label:'Esquecimento',severity:82}],
    methodEffectiveness:{},
    topicState:{
      'português::pontuação':{materia:'Português',assunto:'Pontuação',retention:88,accuracy:84,confidence:.8,lapseCount:0,reviewCount:3,difficulty:5,lastStudyAt:'2026-08-30T10:00:00Z'},
      'constitucional::controle':{materia:'Constitucional',assunto:'Controle',retention:46,accuracy:58,confidence:.6,lapseCount:3,reviewCount:4,difficulty:8,lastStudyAt:'2026-08-20T10:00:00Z'}
    }
  };
  const result=api.recommend(profile,{now:Date.parse('2026-08-31T12:00:00Z')});
  assert.equal(result.topicId,'constitucional::controle');
  assert.equal(result.method,'active_recall');
  assert.ok(result.priorityScore>=80);
  assert.ok(result.reasons.some(item=>/retenção/.test(item)));
});

test('chooseMethod uses proven personal method effectiveness when samples are sufficient',()=>{
  const api=loadModule();
  const profile={methodEffectiveness:{
    questions:{samples:5,score:92},
    active_recall:{samples:6,score:58},
    short_review:{samples:8,score:61}
  }};
  const picked=api.chooseMethod(profile,{type:'forgetting'},{retention:50,accuracy:62});
  assert.equal(picked.method,'questions');
  assert.equal(picked.history.samples,5);
});

test('suggestedMinutes reduces session size under high fatigue',()=>{
  const api=loadModule();
  assert.equal(api.suggestedMinutes({metrics:{fatigueIndex:82}},95),15);
  assert.equal(api.suggestedMinutes({metrics:{fatigueIndex:60}},95),20);
  assert.equal(api.suggestedMinutes({metrics:{fatigueIndex:20}},85),35);
});

test('recommend exposes alternatives without mutating schedule state',()=>{
  const api=loadModule();
  const profile={userId:'u2',contest:'FCC',metrics:{fatigueIndex:10},recurringErrors:[],methodEffectiveness:{},topicState:{
    a:{materia:'A',assunto:'A1',retention:40,accuracy:50,difficulty:7},
    b:{materia:'B',assunto:'B1',retention:55,accuracy:60,difficulty:6},
    c:{materia:'C',assunto:'C1',retention:70,accuracy:72,difficulty:5}
  }};
  const result=api.recommend(profile,{now:Date.parse('2026-08-31T12:00:00Z')});
  assert.ok(result.alternatives.length>=2);
  assert.equal('schedule' in result,false);
  assert.equal('calendar' in result,false);
});

test('board evidence can break a near cognitive tie but remains bounded and auditable',()=>{
  const api=loadModule({boardSignal(_contest,materia){
    if(materia==='Direito Constitucional')return {board:'FCC',priority:100,confidence:100,questions:40,years:4,source:{title:'Provas FCC 2022-2026'},asOf:'2026-08-31'};
    return null;
  }});
  const profile={userId:'u3',contest:'TJ',metrics:{fatigueIndex:10},recurringErrors:[],methodEffectiveness:{},topicState:{
    adm:{materia:'Direito Administrativo',assunto:'Atos',retention:63,accuracy:67,difficulty:6,lastStudyAt:'2026-08-20T10:00:00Z'},
    const:{materia:'Direito Constitucional',assunto:'Controle',retention:65,accuracy:68,difficulty:6,lastStudyAt:'2026-08-20T10:00:00Z'}
  }};
  const result=api.recommend(profile,{now:Date.parse('2026-08-31T12:00:00Z')});
  assert.equal(result.topicId,'const');
  assert.equal(result.boardEvidence.board,'FCC');
  assert.equal(result.boardEvidence.source.title,'Provas FCC 2022-2026');
  assert.ok(result.reasons.some(item=>/incidência FCC/.test(item)));
  assert.ok(result.metrics.boardPriority===100);
});

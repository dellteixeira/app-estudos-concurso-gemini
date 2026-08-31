const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function loadModule(){
  const source=fs.readFileSync('public/js/core/intervention-effectiveness.js','utf8');
  const store=new Map();
  const listeners=new Map();
  const localStorage={
    getItem:key=>store.has(key)?store.get(key):null,
    setItem:(key,value)=>store.set(key,String(value))
  };
  const document={
    documentElement:{dataset:{}},
    addEventListener(){},
  };
  function CustomEvent(type,init={}){this.type=type;this.detail=init.detail}
  const window={
    localStorage,
    AppCognitiveDataSource:{snapshot:()=>({userId:'user-1',contest:'TJ'})},
    AppCognitiveProfile:{read:()=>null},
    addEventListener(type,fn){listeners.set(type,fn)},
    dispatchEvent(){return true}
  };
  vm.runInNewContext(source,{window,document,CustomEvent,console,Date,JSON,Math,Number,String,Object,Array,Map,Boolean,Symbol});
  return {api:window.AppInterventionEffectiveness,store};
}

test('intervention history is append-only and deduplicates rapid repeated starts',()=>{
  const {api}=loadModule();
  const first=api.start({topicId:'portugues::pontuacao',method:'active_recall',baseline:{retention:.6,accuracy:.5,sessionCount:1}});
  const second=api.start({topicId:'portugues::pontuacao',method:'active_recall',baseline:{retention:.6,accuracy:.5,sessionCount:1}});
  const events=api.readEvents('user-1','TJ');
  assert.equal(first.interventionId,second.interventionId);
  assert.equal(events.length,1);
  assert.equal(events[0].type,'started');
  assert.equal(events[0].baseline.retention,60);
  assert.equal(events[0].baseline.accuracy,50);
});

test('observeDue appends immediate, 24h and 7d observations without overwriting the start',()=>{
  const {api}=loadModule();
  const started=api.start({
    topicId:'constitucional::controle',
    method:'questions',
    baseline:{retention:55,accuracy:40,sessionCount:1,reviewCount:0,totalMinutes:30,lastStudyAt:'2026-08-01T10:00:00.000Z'}
  });
  const startMs=Date.parse(started.at);
  const topicState={
    'constitucional::controle':{retention:70,accuracy:65,sessionCount:2,reviewCount:1,totalMinutes:55,lastStudyAt:'2026-08-01T11:00:00.000Z'}
  };
  let added=api.observeDue({userId:'user-1',contest:'TJ',topicState,now:startMs+60*60*1000});
  assert.equal(added.length,1);
  assert.equal(added[0].window,'immediate');
  added=api.observeDue({userId:'user-1',contest:'TJ',topicState,now:startMs+24*60*60*1000});
  assert.equal(added.length,1);
  assert.equal(added[0].window,'h24');
  added=api.observeDue({userId:'user-1',contest:'TJ',topicState,now:startMs+7*24*60*60*1000});
  assert.equal(added.length,1);
  assert.equal(added[0].window,'d7');
  added=api.observeDue({userId:'user-1',contest:'TJ',topicState,now:startMs+8*24*60*60*1000});
  assert.equal(added.length,0);
  const events=api.readEvents('user-1','TJ');
  assert.equal(events.filter(event=>event.type==='started').length,1);
  assert.equal(events.filter(event=>event.type==='observed').length,3);
});

test('aggregate calculates retention gains and method score by intervention method',()=>{
  const {api}=loadModule();
  const started=api.start({topicId:'penal::crime',method:'focused_restudy',baseline:{retention:50,accuracy:45,sessionCount:1}});
  const state={'penal::crime':{retention:75,accuracy:70,sessionCount:2,totalMinutes:25,lastStudyAt:new Date().toISOString()}};
  api.observeDue({userId:'user-1',contest:'TJ',topicState:state,now:Date.parse(started.at)+1000});
  const result=api.aggregate('user-1','TJ');
  assert.equal(result.focused_restudy.samples,1);
  assert.equal(result.focused_restudy.observations,1);
  assert.equal(result.focused_restudy.immediateGain,25);
  assert.ok(result.focused_restudy.score>50);
  assert.equal(result.active_recall.samples,0);
});

test('dueWindow requires new study evidence for immediate observation',()=>{
  const {api}=loadModule();
  const started='2026-08-01T10:00:00.000Z';
  const baseline={retention:60,sessionCount:1,reviewCount:1,totalMinutes:40,lastStudyAt:started};
  const current={retention:65,sessionCount:1,reviewCount:1,totalMinutes:40,lastStudyAt:started};
  const window=api.dueWindow(started,[],'iv-1',current,baseline,Date.parse(started)+1000);
  assert.equal(window,null);
});

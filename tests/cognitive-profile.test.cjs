const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function loadModule(){
  const source=fs.readFileSync('public/js/core/cognitive-profile.js','utf8');
  const store=new Map();
  const window={
    localStorage:{
      getItem:key=>store.has(key)?store.get(key):null,
      setItem:(key,value)=>store.set(key,String(value))
    }
  };
  vm.runInNewContext(source,{window,console,Date,JSON,Math,Number,String,Object,Array,Map,Boolean});
  return window.AppCognitiveProfile;
}

test('buildProfile aggregates cognitive metrics without changing schedule state',()=>{
  const api=loadModule();
  const profile=api.buildProfile({
    userId:'u1',contest:'TJ',
    rows:[
      {materia:'Português',assunto:'Pontuação',retention:80,questionAccuracy:70,state:{sessionCount:2,reviewCount:1,totalMinutes:90,lapseCount:0,difficulty:5,questionStats:{confidence:.8}}},
      {materia:'Constitucional',assunto:'Controle',retention:45,questionAccuracy:40,state:{sessionCount:3,reviewCount:2,totalMinutes:120,lapseCount:2,difficulty:8,questionStats:{confidence:.5}}}
    ],
    sessions:[{minutes:40},{minutes:70}]
  });
  assert.equal(profile.schemaVersion,1);
  assert.equal(profile.metrics.totalObservedTopics,2);
  assert.equal(profile.metrics.avgRetention,63);
  assert.equal(profile.metrics.avgAccuracy,55);
  assert.ok(profile.metrics.forgettingRisk>0);
  assert.equal(profile.subjects.length,2);
  assert.equal(profile.weaknesses[0].materia,'Constitucional');
  assert.equal(profile.topicState['português::pontuação'].sessionCount,2);
  assert.equal('schedule' in profile,false);
});

test('refresh persists profile scoped by user and contest',()=>{
  const api=loadModule();
  const saved=api.refresh({userId:'user-x',contest:'FCC',rows:[{materia:'A',assunto:'B',retention:90,state:{sessionCount:1,totalMinutes:30}}]});
  const loaded=api.read('user-x','FCC');
  assert.equal(loaded.userId,'user-x');
  assert.equal(loaded.contest,'FCC');
  assert.equal(loaded.metrics.avgRetention,90);
  assert.equal(loaded.updatedAt,saved.updatedAt);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function loadEngine(){
  const source=fs.readFileSync('public/js/core/error-intelligence.js','utf8');
  const window={};
  window.window=window;
  vm.runInNewContext(source,{window,console,Math,Number,String,Object,Array,JSON});
  return window.AppErrorIntelligence;
}

test('classifies false mastery when retention is high but application is weak',()=>{
  const api=loadEngine();
  const findings=api.classifyTopic('constitucional::controle',{
    materia:'Constitucional',assunto:'Controle',retention:86,accuracy:48,confidence:.7,lapseCount:0,reviewCount:2,difficulty:6
  });
  assert.ok(findings.some(item=>item.type==='false_mastery'));
  assert.ok(findings.some(item=>item.type==='application')===false,'false mastery should be the dominant application diagnosis when retention is high');
});

test('classifies forgetting from low retention with lapses',()=>{
  const api=loadEngine();
  const findings=api.classifyTopic('penal::culpabilidade',{
    materia:'Penal',assunto:'Culpabilidade',retention:42,accuracy:72,confidence:.5,lapseCount:2,reviewCount:3,difficulty:7,lastRating:'forgot'
  });
  const forgetting=findings.find(item=>item.type==='forgetting');
  assert.ok(forgetting);
  assert.ok(forgetting.severity>=20);
});

test('detects overconfidence and persistent difficulty deterministically',()=>{
  const api=loadEngine();
  const findings=api.classifyTopic('português::pontuação',{
    materia:'Português',assunto:'Pontuação',retention:66,accuracy:50,confidence:.92,lapseCount:1,reviewCount:6,difficulty:9
  });
  assert.ok(findings.some(item=>item.type==='overconfidence'));
  assert.ok(findings.some(item=>item.type==='persistent'));
  assert.ok(findings.some(item=>item.type==='application'));
});

test('analyzeProfile sorts recurring errors by severity and aggregates patterns',()=>{
  const api=loadEngine();
  const profile={topicState:{
    a:{materia:'A',assunto:'A1',retention:40,accuracy:45,confidence:.9,lapseCount:3,reviewCount:6,difficulty:9,lastRating:'forgot'},
    b:{materia:'B',assunto:'B1',retention:90,accuracy:50,confidence:.8,lapseCount:0,reviewCount:1,difficulty:5}
  }};
  const findings=api.analyzeProfile(profile);
  const summary=api.aggregate(findings);
  assert.ok(findings.length>=3);
  assert.ok(findings[0].severity>=findings.at(-1).severity);
  assert.equal(summary.total,findings.length);
  assert.ok(summary.byType.length>=2);
  assert.ok(summary.bySubject.length>=2);
});

test('engine is analytical only and exposes no scheduling mutation API',()=>{
  const api=loadEngine();
  assert.equal('schedule' in api,false);
  assert.equal('reschedule' in api,false);
  assert.equal('setStudyDate' in api,false);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const profileSource=fs.readFileSync('public/js/core/cognitive-profile-source.js','utf8');
const profile=fs.readFileSync('public/js/core/cognitive-profile.js','utf8');
const runtime=fs.readFileSync('public/js/core/cognitive-profile-runtime.js','utf8');
const critical=fs.readFileSync('public/js/critical-points-actions.js','utf8');
const guidance=fs.readFileSync('public/js/core/study-guidance-engine.js','utf8');

test('7B cria índice canônico por assunto e elimina busca linear no caminho principal',()=>{
  assert.match(profileSource,/const byTopic=new Map\(\)/);
  assert.match(profileSource,/buildEditalIndex\(safeEdital\(\)\)/);
  assert.match(profileSource,/findEditalItem/);
  assert.match(runtime,/AppCognitiveDataSource\?\.priorityForTopic/);
  assert.match(guidance,/AppCognitiveDataSource\?\.findEditalItem/);
  assert.match(critical,/AppCognitiveDataSource\?\.findEditalItem/);
});

test('7A mantém Student Model em memória e Pontos Críticos usa fast path',()=>{
  assert.match(profile,/const profileCache=new Map\(\)/);
  assert.match(profile,/if\(profileCache\.has\(key\)\)/);
  assert.match(profile,/function peek\(/);
  assert.match(profile,/function cacheDiagnostics\(/);
  assert.match(critical,/AppCognitiveProfile\?\.peek\?\./);
});

test('7A calcula domainRisk uma vez por assunto durante buildProfile',()=>{
  assert.match(profile,/const domainByKey=Object\.fromEntries\(rows\.map\(row=>\[row\.key,estimateTopicDomainRisk/);
  assert.match(profile,/aggregateDomainRisk\(rows,previous\.topicState\|\|\{\},domainByKey\)/);
  assert.match(profile,/domainRisk:domainByKey\[row\.key\]/);
});

test('Pontos Críticos reaproveita modeledRow ao calcular risco global',()=>{
  assert.match(critical,/function computeGlobalRisk\(row,item,modeledRowOverride=null\)/);
  assert.match(critical,/computeGlobalRisk\(row,item,modeledRow\)/);
});

test('cache do perfil evita segunda leitura do localStorage',()=>{
  let gets=0;
  const store=new Map();
  const sandbox={window:null,console,Date,Math,Object,Array,Map,Number,String,JSON,setTimeout,clearTimeout};
  sandbox.window=sandbox;
  sandbox.localStorage={
    getItem(key){gets+=1;return store.get(key)||null},
    setItem(key,value){store.set(key,value)},
    removeItem(key){store.delete(key)}
  };
  vm.runInNewContext(profile,sandbox,{filename:'cognitive-profile.js'});
  const api=sandbox.AppCognitiveProfile;
  const built=api.buildProfile({userId:'u1',contest:'c1',rows:[],sessions:[]});
  api.write(built);
  const before=gets;
  assert.equal(api.read('u1','c1'),built);
  assert.equal(api.read('u1','c1'),built);
  assert.equal(gets,before);
  assert.ok(api.cacheDiagnostics().hits>=2);
});

test('índice do edital é construído uma vez por snapshot e reutilizado em lookups',()=>{
  const edital=Array.from({length:500},(_,i)=>({materia:`M${Math.floor(i/10)}`,assunto:`A${i}`,prioridade:(i%4)+1,assunto_prioridade:(i%10)+1}));
  const sandbox={window:null,console,Date,Math,Object,Array,Map,Number,String,JSON,editalItems:edital,currentConcurso:'C',currentUser:{id:'u'},getConcursosMetadata:()=>({C:{retentionEngine:{topics:{}}}})};
  sandbox.window=sandbox;
  vm.runInNewContext(profileSource,sandbox,{filename:'cognitive-profile-source.js'});
  const api=sandbox.AppCognitiveDataSource;
  api.snapshot();
  const afterSnapshot=api.indexDiagnostics();
  for(let i=0;i<100;i++)assert.ok(api.findEditalItem({materia:'M10',assunto:'A100'}));
  const afterLookups=api.indexDiagnostics();
  assert.equal(afterSnapshot.builds,1);
  assert.equal(afterLookups.builds,1);
  assert.equal(afterLookups.size,500);
  assert.ok(afterLookups.lookups>=100);
});

test('contrato de prioridade importada permanece explícito e sem mutação',()=>{
  assert.match(profile,/editalPriority:'immutable-imported-order'/);
  assert.match(profile,/topicPriority:'immutable-imported-order'/);
  assert.doesNotMatch(profileSource,/\.sort\(/);
});

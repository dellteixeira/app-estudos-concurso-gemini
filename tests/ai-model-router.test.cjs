'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const root=path.resolve(__dirname,'..');
const moduleUrl=pathToFileURL(path.join(root,'src/ai-model-router.js')).href;
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

async function router(){return import(`${moduleUrl}?t=${Date.now()}-${Math.random()}`)}

test('diagnóstico curto usa tier fast e mantém autoridade determinística',async()=>{
  const {routeAiModel}=await router();
  const route=routeAiModel({GEMINI_PRIMARY_MODEL:'primary-model',GEMINI_FAST_MODEL:'fast-model'},'learning_diagnosis',{topics:[{frictionScore:40}]});
  assert.equal(route.tier,'fast');
  assert.equal(route.model,'fast-model');
  assert.equal(route.authority,'retention-engine');
  assert.equal(route.autoSchedule,false);
});

test('diagnóstico com vários tópicos de alta fricção sobe no máximo para standard',async()=>{
  const {routeAiModel}=await router();
  const topics=[80,75,45,40].map(frictionScore=>({frictionScore}));
  const route=routeAiModel({GEMINI_PRIMARY_MODEL:'primary',GEMINI_STANDARD_MODEL:'standard'},'learning_diagnosis',{topics});
  assert.equal(route.tier,'standard');
  assert.equal(route.model,'standard');
  assert.notEqual(route.tier,'reasoning');
});

test('pergunta simples do Tutor pode usar fast',async()=>{
  const {routeAiModel}=await router();
  const route=routeAiModel({GEMINI_PRIMARY_MODEL:'primary',GEMINI_FAST_MODEL:'fast'},'contextual_tutor',{question:'Explique este conceito.',context:{}});
  assert.equal(route.tier,'fast');
  assert.equal(route.model,'fast');
});

test('pergunta contextual complexa e sensível a fonte pode usar reasoning',async()=>{
  const {routeAiModel}=await router();
  const question='Analise e fundamente a jurisprudência atual do STJ, compare os precedentes recentes e explique por que a banca pode explorar essa distinção em um caso concreto.';
  const context={recurringError:{severity:85},nextBestAction:{score:92},methodEvidence:[1,2,3,4],boardEvidence:{sampleSize:120}};
  const route=routeAiModel({GEMINI_PRIMARY_MODEL:'primary',GEMINI_REASONING_MODEL:'reasoning'},'contextual_tutor',{question,context});
  assert.equal(route.tier,'reasoning');
  assert.equal(route.model,'reasoning');
  assert.equal(route.risk,'source-sensitive');
});

test('sem modelos alternativos todos os tiers recaem no modelo primário configurado',async()=>{
  const {routeAiModel}=await router();
  const route=routeAiModel({GEMINI_PRIMARY_MODEL:'only-model'},'contextual_tutor',{question:'Analise e fundamente jurisprudência atual do STJ em um caso concreto.',context:{recurringError:{severity:90},nextBestAction:{score:90}}});
  assert.equal(route.model,'only-model');
  assert.equal(route.fallbackModel,'only-model');
  assert.equal(route.configuredAlternative,false);
});

test('endpoint codifica o nome do modelo',async()=>{
  const {modelEndpoint}=await router();
  assert.match(modelEndpoint('model test/1'),/model%20test%2F1:generateContent$/);
});

test('Tutor e Learning Advisor usam o roteador e preservam fallback local',()=>{
  const tutor=read('src/contextual-tutor.js');
  const diagnosis=read('src/learning-diagnosis.js');
  for(const source of [tutor,diagnosis]){
    assert.match(source,/routeAiModel/);
    assert.match(source,/modelEndpoint/);
    assert.match(source,/modelFallback/);
    assert.match(source,/authority:'retention-engine'/);
    assert.match(source,/autoSchedule:false/);
  }
  assert.match(tutor,/contextual_tutor/);
  assert.match(diagnosis,/learning_diagnosis/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/core/contextual-ai-tutor.js','utf8');
const backend=fs.readFileSync('src/contextual-tutor.js','utf8');
const worker=fs.readFileSync('src/worker.js','utf8');

test('Tutor contextual monta pacote somente com sinais medidos',()=>{
  const window={
    AppCognitiveProfile:{read:()=>({topicState:{'dir::tema':{materia:'Direito',assunto:'Tema',retention:48,accuracy:52,confidence:.8,lapseCount:2,reviewCount:4,difficulty:8,lastRating:'forgot'}},recurringErrors:[{topicId:'dir::tema',type:'forgetting',severity:82,reason:'retenção baixa'}]})},
    AppNextBestStudyAction:{rankCandidates:()=>[{topicId:'dir::tema',score:91,method:'active_recall',minutes:15,reasons:['retenção baixa']}]},
    AppInterventionEffectiveness:{aggregate:()=>({byMethod:{active_recall:{score:78,sampleSize:6}}})},
    AppExamBoardIntelligence:{signalForTopic:()=>({board:'FCC',incidence:76,confidence:.7,sampleSize:40,source:'provas importadas',asOf:'2026-08-31'})},
    addEventListener(){},dispatchEvent(){},supabaseClient:null
  };
  const document={readyState:'loading',documentElement:{dataset:{}},addEventListener(){},getElementById(){return null},createElement(){return{}},body:{appendChild(){}}};
  const sandbox={window,document,MutationObserver:function(){this.observe=()=>{}},console,fetch:async()=>{throw new Error('not used')}};
  vm.runInNewContext(source,sandbox);
  const context=window.AppContextualAiTutor.buildContext('dir::tema');
  assert.equal(context.authority,'retention-engine');
  assert.equal(context.autoSchedule,false);
  assert.equal(context.topic.retention,48);
  assert.equal(context.recurringError.type,'forgetting');
  assert.equal(context.nextBestAction.method,'active_recall');
  assert.equal(context.boardEvidence.source,'provas importadas');
  assert.equal(context.methodEvidence[0].sampleSize,6);
});

test('Tutor não expõe API de mutação de agenda',()=>{
  assert.doesNotMatch(source,/\b(schedule|reschedule|setStudyDate|dueDate\s*=|calendar\.push)\b/);
  assert.match(source,/authority:'retention-engine'/);
  assert.match(source,/autoSchedule:false/);
});

test('Backend autentica, limita contexto e declara autoridade determinística',()=>{
  assert.match(backend,/authenticate\(request,env\)/);
  assert.match(backend,/MAX_BODY_BYTES=32\*1024/);
  assert.match(backend,/Retention Engine é a autoridade/);
  assert.match(backend,/Não invente métricas/);
  assert.match(backend,/autoSchedule:false/);
});

test('Worker publica rota contextual separada do diagnóstico',()=>{
  assert.match(worker,/\/api\/ai\/contextual-tutor/);
  assert.match(worker,/handleContextualTutor/);
  assert.match(worker,/\/js\/core\/contextual-ai-tutor\.js/);
});

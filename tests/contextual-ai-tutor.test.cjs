const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/core/contextual-ai-tutor.js','utf8');
const backend=fs.readFileSync('src/contextual-tutor.js','utf8');
const worker=fs.readFileSync('src/worker.js','utf8');

test('Tutor contextual monta pacote com contratos reais das engines',()=>{
  let profileReadArgs=null;
  let boardArgs=null;
  const profile={
    userId:'u1',contest:'TJ-CE',
    topicState:{'dir::tema':{materia:'Direito',assunto:'Tema',retention:48,accuracy:52,confidence:.8,lapseCount:2,reviewCount:4,difficulty:8,lastRating:'forgot'}},
    recurringErrors:[{topicId:'dir::tema',type:'forgetting',severity:82,reason:'retenção baixa'}],
    methodEffectiveness:{active_recall:{score:78,samples:6,gain24h:8,gain7d:5}}
  };
  const window={
    currentUser:{id:'u1'},currentConcurso:'TJ-CE',
    AppCognitiveProfile:{read:(userId,contest)=>{profileReadArgs=[userId,contest];return profile}},
    AppNextBestStudyAction:{
      scoreTopic:()=>({topicId:'dir::tema',score:91,method:'active_recall',methodLabel:'Recuperação ativa',factors:['retenção baixa']}),
      suggestedMinutes:()=>15
    },
    AppExamBoardIntelligence:{signalForTopic:(contest,materia,assunto)=>{boardArgs=[contest,materia,assunto];return {board:'FCC',priority:76,confidence:70,questions:40,years:4,source:{title:'Provas importadas',type:'import',url:'https://example.test'},asOf:'2026-08-31'}}},
    addEventListener(){},dispatchEvent(){},supabaseClient:null
  };
  const document={readyState:'loading',documentElement:{dataset:{}},addEventListener(){},getElementById(){return null},createElement(){return{}},body:{appendChild(){}}};
  const sandbox={window,document,MutationObserver:function(){this.observe=()=>{}},console,fetch:async()=>{throw new Error('not used')}};
  vm.runInNewContext(source,sandbox);
  const context=window.AppContextualAiTutor.buildContext('dir::tema');
  assert.deepEqual(profileReadArgs,['u1','TJ-CE']);
  assert.deepEqual(boardArgs,['TJ-CE','Direito','Tema']);
  assert.equal(context.authority,'retention-engine');
  assert.equal(context.autoSchedule,false);
  assert.equal(context.topic.retention,48);
  assert.equal(context.recurringError.type,'forgetting');
  assert.equal(context.nextBestAction.method,'active_recall');
  assert.equal(context.nextBestAction.minutes,15);
  assert.equal(context.boardEvidence.source.title,'Provas importadas');
  assert.equal(context.boardEvidence.confidence,70);
  assert.equal(context.methodEvidence[0].sampleSize,6);
});

test('Tutor não expõe API de mutação de agenda',()=>{
  assert.doesNotMatch(source,/\b(reschedule|setStudyDate|calendar\.push)\b/);
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

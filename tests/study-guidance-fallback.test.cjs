const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','public','js','core','study-guidance-engine.js'),'utf8');

function runtime(options={}){
  const events=[];
  class CustomEvent{constructor(type,config={}){this.type=type;this.detail=config.detail}}
  const edital=options.edital||[
    {materia:'Português',assunto:'Pontuação',prioridade:2,assunto_prioridade:1,peso:2.0,questoes:true},
    {materia:'Constitucional',assunto:'Controle de Constitucionalidade',prioridade:1,assunto_prioridade:3,peso:2.0,teoria:true}
  ];
  const context={
    console,Date,JSON,Math,Object,Map,Set,Promise,structuredClone,CustomEvent,
    setTimeout,clearTimeout,
    currentUser:{id:'u1'},currentConcurso:'TJ-CE',
    AppState:{
      getSnapshot:()=>({user:{id:'u1'},currentContest:'TJ-CE'}),
      getEdital:()=>edital
    },
    AppStudyEvents:{
      EVENTS:{GUIDANCE_REQUESTED:'study:guidance-requested',GUIDANCE_RESOLVED:'study:guidance-resolved'},
      emit:(name,detail)=>{events.push({name,detail});return detail}
    },
    dispatchEvent(){return true;}
  };
  if(options.profile)context.AppCognitiveProfile={read:()=>options.profile};
  if(options.nextBest)context.AppNextBestStudyAction=options.nextBest;
  context.window=context;
  vm.runInNewContext(source,context,{filename:'study-guidance-engine.js'});
  context.__events=events;
  context.__edital=edital;
  return context;
}

test('fallback estratégico preserva a ordem importada do JSON sem mutá-la',()=>{
  const app=runtime();
  const before=JSON.stringify(app.__edital);
  const result=app.AppStudyGuidance.guideSync();
  assert.equal(result.source,'json_baseline');
  assert.equal(result.materia,'Constitucional');
  assert.equal(result.assunto,'Controle de Constitucionalidade');
  assert.equal(result.editalPriority,1);
  assert.equal(JSON.stringify(app.__edital),before);
});

test('falha de IA retorna recomendação local em vez de erro',async()=>{
  const app=runtime();
  const result=await app.AppStudyGuidance.guide({}, {
    aiProvider:async()=>{throw new Error('provider_down')},
    providerName:'test-ai',
    timeoutMs:1000
  });
  assert.equal(result.source,'local_fallback');
  assert.equal(result.aiUsed,false);
  assert.equal(result.provider,'test-ai');
  assert.equal(result.fallbackReason,'provider_down');
  assert.equal(result.materia,'Constitucional');
  assert.equal(app.__events.at(-1).name,'study:guidance-resolved');
});

test('timeout de IA também degrada para orientação local',async()=>{
  const app=runtime();
  const result=await app.AppStudyGuidance.guide({}, {
    aiProvider:()=>new Promise(()=>{}),
    providerName:'slow-ai',
    timeoutMs:20
  });
  assert.equal(result.source,'local_fallback');
  assert.equal(result.fallbackReason,'ai_timeout');
  assert.equal(result.materia,'Constitucional');
});

test('payload válido da IA é aceito sem destruir a prioridade estratégica',async()=>{
  const app=runtime();
  const result=await app.AppStudyGuidance.guide({}, {
    aiProvider:async()=>({
      materia:'Português',assunto:'Pontuação',action:'questions',suggestedMinutes:20,confidence:87,
      reasons:['treinar aplicação imediatamente']
    }),
    providerName:'fast-ai'
  });
  assert.equal(result.source,'ai');
  assert.equal(result.aiUsed,true);
  assert.equal(result.provider,'fast-ai');
  assert.equal(result.action,'questions');
  assert.equal(result.confidence,87);
});

test('motor cognitivo é preferido ao JSON quando há evidência do aluno',()=>{
  const profile={userId:'u1',contest:'TJ-CE',topicState:{'português::pontuação':{materia:'Português',assunto:'Pontuação',editalPriority:2,topicPriority:1}}};
  const nextBest={
    recommend:()=>({topicId:'português::pontuação',materia:'Português',assunto:'Pontuação',priorityScore:91,method:'questions',methodLabel:'Questões',suggestedMinutes:25,reasons:['erros recentes']}),
    latest:()=>null
  };
  const app=runtime({profile,nextBest});
  const result=app.AppStudyGuidance.guideSync();
  assert.equal(result.source,'local_engine');
  assert.equal(result.materia,'Português');
  assert.equal(result.recommendationScore,91);
  assert.equal(result.editalPriority,2);
});

test('contexto atual ainda gera sugestão quando não há perfil nem edital',()=>{
  const app=runtime({edital:[]});
  const result=app.AppStudyGuidance.guideSync({materia:'AFO',assunto:'Créditos adicionais',availableMinutes:10});
  assert.equal(result.source,'context_fallback');
  assert.equal(result.materia,'AFO');
  assert.equal(result.suggestedMinutes,10);
});

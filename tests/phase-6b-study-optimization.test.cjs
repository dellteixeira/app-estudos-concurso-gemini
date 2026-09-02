const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function load(){
  const assessmentCode=fs.readFileSync(path.join(process.cwd(),'public/js/core/topic-assessment.js'),'utf8');
  const code=fs.readFileSync(path.join(process.cwd(),'public/js/core/study-optimization-engine.js'),'utf8');
  const events=[];
  const window={
    AppStudyEvents:{emit:(name,detail)=>events.push({name,detail})},
    dispatchEvent:()=>{},
    CustomEvent:function(name,options){this.type=name;this.detail=options?.detail}
  };
  const context=vm.createContext({window,CustomEvent:window.CustomEvent,console,setTimeout,clearTimeout});
  vm.runInContext(assessmentCode,context,{filename:'topic-assessment.js'});
  vm.runInContext(code,context,{filename:'study-optimization-engine.js'});
  return {engine:window.AppStudyOptimization,events};
}

function profile(){
  return {
    topicState:{
      'constitucional::controle':{
        materia:'Direito Constitucional',assunto:'Controle de constitucionalidade',
        retention:82,accuracy:48,lapseCount:1,editalPriority:1,topicPriority:2,
        domainRisk:{masteryScore:56,forgettingRisk:52,predictedRetention7d:73,evidenceLevel:'high',trend:'stable'}
      },
      'portugues::pontuacao':{
        materia:'Língua Portuguesa',assunto:'Pontuação',
        retention:51,accuracy:55,lapseCount:2,editalPriority:2,topicPriority:1,
        domainRisk:{masteryScore:49,forgettingRisk:68,predictedRetention7d:43,evidenceLevel:'medium',trend:'declining'}
      },
      'administrativo::atos':{
        materia:'Direito Administrativo',assunto:'Atos administrativos',
        retention:86,accuracy:84,lapseCount:0,editalPriority:1,topicPriority:3,
        domainRisk:{masteryScore:83,forgettingRisk:22,predictedRetention7d:79,evidenceLevel:'high',trend:'stable'}
      }
    }
  };
}

test('gera planos de 30, 60 e 90 minutos respeitando o orçamento',()=>{
  const {engine}=load();
  for(const minutes of [30,60,90]){
    const plan=engine.optimize(profile(),minutes);
    assert.equal(plan.availableMinutes,minutes);
    assert.equal(plan.allocatedMinutes,minutes);
    assert.ok(plan.blocks.length>=1);
  }
});

test('escolhe questões quando retenção está alta mas aplicação está baixa',()=>{
  const {engine}=load();
  const state=profile().topicState['constitucional::controle'];
  assert.equal(engine.chooseMethod(state).method,'questions');
});

test('prioriza risco cognitivo sem mutar a ordem canônica do perfil',()=>{
  const {engine}=load();
  const source=profile();
  const before=Object.keys(source.topicState);
  const plan=engine.optimize(source,60);
  assert.deepEqual(Object.keys(source.topicState),before);
  assert.equal(plan.priorityContract.importedOrderMutation,false);
  assert.equal(plan.blocks[0].assunto,'Pontuação');
});

test('retorna ganho esperado e justificativas por bloco',()=>{
  const {engine}=load();
  const plan=engine.optimize(profile(),60);
  assert.ok(plan.totalExpectedGain>0);
  for(const block of plan.blocks){
    assert.ok(block.expectedGain>=0);
    assert.ok(Array.isArray(block.reasons));
    assert.ok(block.methodLabel);
  }
});

test('emite evento de otimização resolvida sem feedback no estado importado',()=>{
  const {engine,events}=load();
  engine.optimize(profile(),30);
  const event=events.find(item=>item.name==='study:optimization-resolved');
  assert.ok(event);
  assert.equal(event.detail.availableMinutes,30);
});

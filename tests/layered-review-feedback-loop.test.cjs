const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function loadModule(){
  const source=fs.readFileSync('public/js/core/intervention-effectiveness.js','utf8');
  const store=new Map();
  const window={
    localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,String(value))},
    AppCognitiveDataSource:{snapshot:()=>({userId:'user-1',contest:'TJ'})},
    AppCognitiveProfile:{read:()=>null},
    addEventListener(){},dispatchEvent(){return true}
  };
  const document={documentElement:{dataset:{}},addEventListener(){}};
  function CustomEvent(type,init={}){this.type=type;this.detail=init.detail}
  vm.runInNewContext(source,{window,document,CustomEvent,console,Date,JSON,Math,Number,String,Object,Array,Map,Boolean,Symbol});
  return window.AppInterventionEffectiveness;
}

const iso=ms=>new Date(ms).toISOString();

test('revisão curta aceita recentemente avança para questões em vez de repetir',()=>{
  const api=loadModule();
  const now=Date.parse('2026-09-01T12:00:00.000Z');
  const events=[{type:'started',interventionId:'iv-1',topicId:'civil::sentenca',method:'short_review',at:iso(now-60*60*1000)}];
  const result=api.resolveLayeredReview({topicId:'civil::sentenca',baseLayer:2,baseReason:'Revisão curta.',retention:100,accuracy:54,events,now});
  assert.equal(result.recommendedLayer,3);
  assert.match(result.reason,/quest/i);
  assert.equal(result.statuses[2].state,'started');
});

test('observação posterior marca camada como validada com evidência',()=>{
  const api=loadModule();
  const now=Date.parse('2026-09-01T12:00:00.000Z');
  const events=[
    {type:'started',interventionId:'iv-2',topicId:'civil::sentenca',method:'short_review',at:iso(now-2*60*60*1000)},
    {type:'observed',interventionId:'iv-2',topicId:'civil::sentenca',method:'short_review',window:'immediate',at:iso(now-60*60*1000),gain:{retention:2,accuracy:12,confidence:.1}}
  ];
  const result=api.resolveLayeredReview({topicId:'civil::sentenca',baseLayer:2,retention:100,accuracy:66,events,now});
  assert.equal(result.recommendedLayer,3);
  assert.equal(result.statuses[2].state,'validated');
});

test('questões recentes com desempenho ainda baixo escalam para reestudo',()=>{
  const api=loadModule();
  const now=Date.parse('2026-09-01T12:00:00.000Z');
  const events=[{type:'started',interventionId:'iv-q',topicId:'civil::sentenca',method:'questions',at:iso(now-30*60*1000)}];
  const result=api.resolveLayeredReview({topicId:'civil::sentenca',baseLayer:3,retention:92,accuracy:54,events,now});
  assert.equal(result.recommendedLayer,4);
  assert.match(result.reason,/reestud/i);
});

test('reestudo recente é seguido por questões de validação',()=>{
  const api=loadModule();
  const now=Date.parse('2026-09-01T12:00:00.000Z');
  const events=[{type:'started',interventionId:'iv-r',topicId:'civil::sentenca',method:'focused_restudy',at:iso(now-30*60*1000)}];
  const result=api.resolveLayeredReview({topicId:'civil::sentenca',baseLayer:4,retention:55,accuracy:40,events,now});
  assert.equal(result.recommendedLayer,3);
  assert.match(result.reason,/valid/i);
});

test('uma única intervenção fora do cooldown pode voltar a ser recomendada',()=>{
  const api=loadModule();
  const now=Date.parse('2026-09-02T12:00:00.000Z');
  const events=[{type:'started',interventionId:'iv-old',topicId:'civil::sentenca',method:'short_review',at:iso(now-25*60*60*1000)}];
  const result=api.resolveLayeredReview({topicId:'civil::sentenca',baseLayer:2,retention:75,accuracy:80,events,now});
  assert.equal(result.recommendedLayer,2);
});

test('duas tentativas recentes sem melhora forçam mudança de estratégia mesmo após cooldown',()=>{
  const api=loadModule();
  const now=Date.parse('2026-09-05T12:00:00.000Z');
  const events=[
    {type:'started',interventionId:'iv-a',topicId:'civil::sentenca',method:'short_review',at:iso(now-5*24*60*60*1000)},
    {type:'started',interventionId:'iv-b',topicId:'civil::sentenca',method:'short_review',at:iso(now-2*24*60*60*1000)}
  ];
  const result=api.resolveLayeredReview({topicId:'civil::sentenca',baseLayer:2,retention:74,accuracy:62,events,now});
  assert.equal(result.recommendedLayer,3);
  assert.match(result.reason,/duas|estrat/i);
});

test('app-ui integra política adaptativa e registra a intervenção iniciada',()=>{
  const source=fs.readFileSync('public/js/app-ui.js','utf8');
  assert.match(source,/AppInterventionEffectiveness\?\.resolveLayeredReview/);
  assert.match(source,/AppInterventionEffectiveness\?\.start/);
  assert.match(source,/iniciada recentemente/);
  assert.match(source,/validada com evidência/);
});

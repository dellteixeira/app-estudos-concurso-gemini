const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function loadModule(){
  const source=fs.readFileSync('public/js/core/exam-board-intelligence.js','utf8');
  const store=new Map();
  const events=[];
  const window={
    localStorage:{
      getItem(key){return store.has(key)?store.get(key):null;},
      setItem(key,value){store.set(key,String(value));},
      removeItem(key){store.delete(key);}
    },
    dispatchEvent(event){events.push(event);}
  };
  window.window=window;
  class CustomEvent{constructor(type,init){this.type=type;this.detail=init?.detail;}}
  vm.runInNewContext(source,{window,CustomEvent,Date,Math,Number,String,Object,Array,JSON,console});
  return {api:window.AppExamBoardIntelligence,events};
}

test('normalizes known board aliases without inventing a board',()=>{
  const {api}=loadModule();
  assert.equal(api.normalizeBoardName('Fundação Carlos Chagas'),'FCC');
  assert.equal(api.normalizeBoardName('CESPE'),'CEBRASPE');
  assert.equal(api.normalizeBoardName('FGV'),'FGV');
  assert.equal(api.normalizeBoardName('Banca Regional X'),'BANCA REGIONAL X');
});

test('requires identifiable provenance before accepting historical incidence',()=>{
  const {api}=loadModule();
  assert.throws(()=>api.buildSnapshot({contest:'TJ',board:'FCC',topics:[{materia:'Português',assunto:'Pontuação',questions:12}]}),/fonte identificável/i);
});

test('persists board evidence by contest and exposes auditable topic signal',()=>{
  const {api,events}=loadModule();
  api.ingest({
    contest:'TJ-CE Analista',board:'FCC',
    source:{title:'Levantamento de provas 2023-2026',type:'import',asOf:'2026-08-31'},
    topics:[
      {materia:'Português',assunto:'Pontuação',questions:30,years:4},
      {materia:'Português',assunto:'Crase',questions:12,years:3}
    ]
  });
  const signal=api.signalForTopic('TJ-CE Analista','Português','Pontuação');
  assert.equal(signal.board,'FCC');
  assert.equal(signal.priority,100);
  assert.equal(signal.confidence,100);
  assert.equal(signal.questions,30);
  assert.equal(signal.source.title,'Levantamento de provas 2023-2026');
  assert.equal(events.at(-1).type,'app:exam-board-intelligence-updated');
});

test('keeps contests isolated and returns null when no evidence exists',()=>{
  const {api}=loadModule();
  api.ingest({contest:'TRT',board:'FCC',source:{title:'Base TRT'},topics:[{materia:'Direito',assunto:'Atos',priority:80,questions:10,years:2}]});
  assert.ok(api.signalForTopic('TRT','Direito','Atos'));
  assert.equal(api.signalForTopic('TJ','Direito','Atos'),null);
});

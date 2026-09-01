const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/core/study-optimization-dashboard.js','utf8');
const css=fs.readFileSync('public/css/study-optimization.css','utf8');

function fakeElement(){
  return {
    id:'',className:'',innerHTML:'',dataset:{},attributes:{},children:[],
    classList:{toggle(){},add(){},remove(){}},
    setAttribute(k,v){this.attributes[k]=String(v)},
    insertAdjacentElement(_,el){this.children.push(el)},
    appendChild(el){this.children.push(el)},
    closest(){return null}
  };
}

function boot(){
  const elements=new Map();
  const anchor=fakeElement();anchor.id='phase6aDomainRiskPanel';elements.set(anchor.id,anchor);
  const document={
    readyState:'complete',
    createElement(){return fakeElement()},
    getElementById(id){return elements.get(id)||null},
    querySelectorAll(){return[]},
    addEventListener(){},removeEventListener(){}
  };
  const events=[];
  const custom=[];
  const profile={topicState:{'mat::tema':{materia:'Mat',assunto:'Tema',domainRisk:{forgettingRisk:70,masteryScore:40,predictedRetention7d:42,trend:'declining',priorityWeight:3},accuracy:45,retention:50,editalPriority:1,topicPriority:1}}};
  const window={document,console,setTimeout(fn){fn()},addEventListener(){},dispatchEvent(evt){custom.push(evt)},CustomEvent:function(name,options){this.type=name;this.detail=options?.detail},currentUser:{id:'u1'},currentConcurso:'C1',AppCognitiveProfile:{read(){return profile}},AppStudyOptimization:{buildPlan(_profile,minutes){return{id:'p1',availableMinutes:minutes,expectedGain:12,blocks:[{topicId:'mat::tema',materia:'Mat',assunto:'Tema',method:'questions',minutes,expectedGain:12,optimizationScore:88,forgettingRisk:70,reasons:['risco alto']}]}}},AppStudyEvents:{emit(name,detail){events.push({name,detail})}},AppStudyGuidance:{guideSync(ctx){return{...ctx,source:'local_engine'}}}};
  window.window=window;
  const context=vm.createContext({window,document,console,setTimeout:window.setTimeout,CustomEvent:window.CustomEvent});
  vm.runInContext(source,context);
  return{window,events,custom,anchor};
}

test('dashboard exposes 30/60/90 minute windows and immutable-order copy',()=>{
  assert.match(source,/const WINDOWS=Object\.freeze\(\[30,60,90\]\)/);
  assert.match(source,/ordem importada do edital permanece intacta/);
  assert.match(source,/importedOrderMutation:false/);
});

test('dashboard delegates plan generation to optimization engine',()=>{
  assert.match(source,/AppStudyOptimization\.buildPlan\(profile,selectedMinutes/);
  assert.match(source,/study:optimization-plan-rendered/);
});

test('select block emits canonical context and requests study guidance',()=>{
  assert.match(source,/study:optimization-block-selected/);
  assert.match(source,/AppStudyGuidance\?\.guideSync/);
  assert.match(source,/preferredAction:block\.method/);
});

test('dashboard module installs without mutating cognitive topic state',()=>{
  const {window}=boot();
  assert.ok(window.AppStudyOptimizationDashboard);
  assert.equal(typeof window.AppStudyOptimizationDashboard.generate,'function');
  assert.doesNotMatch(source,/topicState\s*\[[^\]]+\]\s*=/);
});

test('responsive stylesheet keeps plan usable on narrow screens',()=>{
  assert.match(css,/\.study-optimization-panel\{/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.match(css,/\.study-opt-controls\{display:grid;grid-template-columns:repeat\(3,1fr\)\}/);
  assert.match(css,/\.study-opt-generate\{grid-column:1\/-1\}/);
});

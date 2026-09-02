const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/core/study-optimization-dashboard.js','utf8');
const css=fs.readFileSync('public/css/study-optimization.css','utf8');

function load(){
  const window={};
  window.window=window;
  vm.runInContext(source,vm.createContext({window}),{filename:'study-optimization-dashboard.js'});
  return window.AppStudyOptimizationDashboard;
}

test('Phase 8 mantém uma fachada de compatibilidade explicitamente desabilitada e headless',()=>{
  const api=load();
  assert.equal(api.disabled,true);
  assert.equal(api.headless,true);
  assert.equal(api.init(),false);
});

test('fachada não gera nem renderiza planos e preserva retornos compatíveis',()=>{
  const api=load();
  assert.equal(api.generate(),null);
  assert.equal(api.renderPlan(),null);
  assert.equal(api.selectBlock(),false);
  assert.equal(api.latestPlan,null);
  assert.equal(api.selectedMinutes,60);
});

test('fachada preserva apenas o helper textual necessário para consumidores legados',()=>{
  const api=load();
  assert.equal(api.methodLabel('questions'),'questions');
  assert.equal(api.methodLabel(null),'');
});

test('dashboard legado não volta a executar engine, guidance ou listeners próprios',()=>{
  assert.doesNotMatch(source,/buildPlan\(/);
  assert.doesNotMatch(source,/AppStudyGuidance/);
  assert.doesNotMatch(source,/addEventListener/);
  assert.doesNotMatch(source,/dispatchEvent/);
});

test('CSS da compatibilidade apenas oculta os painéis legados',()=>{
  assert.match(css,/#phase6aDomainRiskPanel,#phase6bStudyOptimizationPanel\{display:none!important;\}/);
  assert.ok(css.length<300);
  assert.doesNotMatch(css,/study-optimization-card|study-optimization-grid|study-optimization-actions/);
});

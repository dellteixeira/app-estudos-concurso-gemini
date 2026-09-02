const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const assessmentSource = fs.readFileSync('public/js/core/topic-assessment.js', 'utf8');
function loadAssessment() {
  const window = { dispatchEvent() {} }; window.window = window;
  const context = vm.createContext({ window, Number, String, Object, Array, Math, JSON, Map, Set, Date });
  vm.runInContext(assessmentSource, context, { filename: 'topic-assessment.js' });
  return window.AppTopicAssessment;
}
function profile() {
  return { metrics:{weightedMastery:64,weightedCoverage:48,highRiskTopics:1,mediumRiskTopics:1,atRiskTopics:2}, topicState:{
    'a::primeiro':{materia:'Matéria A',assunto:'Primeiro',domainRisk:{masteryScore:88,predictedRetention7d:84,forgettingRisk:21,riskBand:'low',evidenceLevel:'high',trend:'stable',priorityWeight:1}},
    'b::segundo':{materia:'Matéria B',assunto:'Segundo',domainRisk:{masteryScore:43,predictedRetention7d:48,forgettingRisk:72,riskBand:'high',evidenceLevel:'medium',trend:'declining',priorityWeight:4}},
    'c::terceiro':{materia:'Matéria C',assunto:'Terceiro',domainRisk:{masteryScore:59,predictedRetention7d:61,forgettingRisk:49,riskBand:'medium',evidenceLevel:'low',trend:'insufficient_evidence',priorityWeight:3}}
  }};
}
test('topic assessment consolida domínio, cobertura, previsão e evidência',()=>{
  const view=loadAssessment().buildViewModel(profile());
  assert.equal(view.weightedMastery,64); assert.equal(view.weightedCoverage,48); assert.equal(view.highRiskTopics,1); assert.equal(view.mediumRiskTopics,1); assert.equal(view.atRiskTopics,2); assert.ok(view.predictedRetention7d>=0&&view.predictedRetention7d<=100); assert.equal(view.evidenceCoverage,67);
});
test('fila de atenção ordena cópia sem alterar ordem canônica',()=>{
  const api=loadAssessment(),input=profile(),before=Object.keys(input.topicState),queue=api.getAttentionQueue(input,6);
  assert.deepEqual(Object.keys(input.topicState),before); assert.deepEqual(Array.from(queue,entry=>entry.key),['b::segundo','c::terceiro']);
});
test('assessment explicita contrato imutável de prioridade',()=>{
  const api=loadAssessment(); const state={materia:'A',assunto:'B',editalPriority:1,topicPriority:2,retention:60,accuracy:55}; const result=api.assessTopic({topicState:{'a::b':state}},'a::b');
  assert.equal(result.editalPriority,1); assert.equal(result.topicPriority,2); assert.equal(result.importedOrderMutation,false); assert.equal('reorder' in api,false); assert.equal('updatePriority' in api,false);
});
test('asset canônico é headless e painel visual legado saiu do shell',()=>{
  const html=fs.readFileSync('public/index.html','utf8'); assert.equal(html.includes('./js/core/topic-assessment.js'),true); assert.equal(html.includes('phase6aDomainRiskPanel'),false); assert.equal(html.includes('domain-risk-dashboard.js'),false); assert.equal(assessmentSource.includes('document.'),false);
});

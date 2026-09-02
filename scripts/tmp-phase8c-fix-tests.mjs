import fs from 'node:fs';
const write=(p,c)=>fs.writeFileSync(p,c);

write('tests/phase-6a-domain-risk-dashboard.test.cjs',`const test = require('node:test');
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
`);

write('tests/phase-8a-8b-consolidation.test.cjs',`'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path'); const vm=require('node:vm'); const root=path.resolve(__dirname,'..'); const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function loadAssessment(){ const events=[]; const window={CustomEvent:function(name,init){this.type=name;this.detail=init?.detail},dispatchEvent:event=>events.push(event)}; window.window=window; vm.runInNewContext(read('public/js/core/topic-assessment.js'),{window,console,Math,Number,String,Object,Array,Date,JSON,CustomEvent:window.CustomEvent}); return {api:window.AppTopicAssessment,events}; }
test('8A/8C mantém assessment headless após graduação física',()=>{ const assessment=read('public/js/core/topic-assessment.js'); const html=read('public/index.html'); assert.equal(assessment.includes('document.'),false); assert.equal(assessment.includes('MutationObserver'),false); assert.equal(assessment.includes('setTimeout('),false); assert.equal(fs.existsSync(path.join(root,'public/js/core/study-optimization-dashboard.js')),false); assert.equal(fs.existsSync(path.join(root,'public/css/study-optimization.css')),false); assert.equal(html.includes('phase6aDomainRiskPanel'),false); assert.equal(html.includes('phase6bStudyOptimizationPanel'),false); });
test('8B normaliza candidatos nested e flattened consistentemente',()=>{ const {api}=loadAssessment(); assert.ok(api); const nested={retention:70,accuracy:55,lapseCount:1,domainRisk:{masteryScore:32,forgettingRisk:82,predictedRetention7d:44,evidenceLevel:'high',trend:'declining'}}; const flat={retention:70,accuracy:55,lapseCount:1,masteryScore:32,forgettingRisk:82,predictedRetention7d:44,evidenceLevel:'high',trend:'declining'}; const a=api.normalizeTopicState(nested),b=api.normalizeTopicState(flat); assert.equal(a.mastery,b.mastery); assert.equal(a.forgettingRisk,b.forgettingRisk); assert.equal(a.predictedRetention7d,b.predictedRetention7d); assert.equal(a.evidenceLevel,b.evidenceLevel); assert.equal(api.expectedGain(nested,25),api.expectedGain(flat,25)); assert.equal(api.optimizationScore(nested),api.optimizationScore(flat)); assert.equal(api.chooseOptimizationMethod(nested).method,api.chooseOptimizationMethod(flat).method); });
test('8B preserva imported order apenas como sinal contextual',()=>{ const {api}=loadAssessment(); const state={materia:'A',assunto:'B',editalPriority:1,topicPriority:1,retention:60,accuracy:60,domainRisk:{masteryScore:60,forgettingRisk:50,predictedRetention7d:55,evidenceLevel:'medium'}}; const result=api.assessTopic({topicState:{'a::b':state}},'a::b'); assert.equal(result.editalPriority,1); assert.equal(result.topicPriority,1); assert.equal(result.importedOrderMutation,false); });
test('optimizer delega assessment compartilhado e mantém teto de 35 minutos',()=>{ const source=read('public/js/core/study-optimization-engine.js'); assert.equal(source.includes('AppTopicAssessment'),true); assert.equal(source.includes('MAX_BLOCK_MINUTES=35'),true); assert.equal(source.includes('minutes:last.minutes+remaining'),false); });
`);

write('tests/phase-8c-consolidation.test.cjs',`'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const vm=require('node:vm');
const html=fs.readFileSync('public/index.html','utf8'); const assets=JSON.parse(fs.readFileSync('config/app-assets.json','utf8')); const assessment=fs.readFileSync('public/js/core/topic-assessment.js','utf8');
test('8C gradua fisicamente assets de apresentação da Phase 6',()=>{ assert.equal(fs.existsSync('public/js/core/domain-risk-dashboard.js'),false); assert.equal(fs.existsSync('public/js/core/study-optimization-dashboard.js'),false); assert.equal(fs.existsSync('public/css/study-optimization.css'),false); assert.equal(html.includes('phase6aDomainRiskPanel'),false); assert.equal(html.includes('phase6bStudyOptimizationPanel'),false); });
test('8C carrega topic assessment antes de optimizer e tutor',()=>{ const a=html.indexOf('./js/core/topic-assessment.js'),o=html.indexOf('./js/core/study-optimization-engine.js'),t=html.indexOf('./js/core/predictive-adaptive-tutor.js'); assert.ok(a>0); assert.ok(o>a); assert.ok(t>o); });
test('critical shell contém runtime canônico e nenhum asset aposentado',()=>{ const serialized=JSON.stringify(assets); assert.equal(serialized.includes('/js/core/topic-assessment.js'),true); assert.equal(serialized.includes('domain-risk-dashboard.js'),false); assert.equal(serialized.includes('study-optimization-dashboard.js'),false); assert.equal(serialized.includes('study-optimization.css'),false); });
test('assessment canônico preserva explicitamente imported order',()=>{ const window={}; window.window=window; vm.runInNewContext(assessment,{window,Math,Number,String,Object,Array,Date,JSON}); const api=window.AppTopicAssessment; const state={materia:'A',assunto:'B',editalPriority:2,topicPriority:4,retention:45,accuracy:50}; const result=api.assessTopic({topicState:{'a::b':state}},'a::b'); assert.equal(result.editalPriority,2); assert.equal(result.topicPriority,4); assert.equal(result.importedOrderMutation,false); });
`);

write('tests/phase-6-critical-points-integration.test.cjs',`const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const critical=fs.readFileSync('public/js/critical-points-actions.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
test('standalone Phase 6 dashboards foram graduados para runtimes headless',()=>{ assert.equal(html.includes('topic-assessment.js'),true); assert.equal(html.includes('domain-risk-dashboard.js'),false); assert.equal(html.includes('study-optimization-dashboard.js'),false); assert.equal(html.includes('study-optimization.css'),false); assert.equal(html.includes('phase6aDomainRiskPanel'),false); assert.equal(html.includes('phase6bStudyOptimizationPanel'),false); });
test('Critical Points consome domain risk sem markup legado',()=>{ assert.equal(critical.includes('domainRisk:topic.domainRisk||null'),true); assert.equal(critical.includes('const domainComponent=Number.isFinite(domainRiskValue)?clamp(domainRiskValue,0,100)*0.20:0;'),true); assert.equal(critical.includes('phase6:{masteryScore:'),true); assert.equal(critical.includes('dataset.phase6Mastery'),true); assert.equal(critical.includes('Student Model'),false); assert.equal(critical.includes('Study Optimizer'),false); });
test('Critical Points mantém optimizer e tutor sem reorder canônico',()=>{ assert.equal(critical.includes("global.AppStudyOptimization?.forTopic?global.AppStudyOptimization.forTopic(topicId,30,{profile,source:'critical-points'}):null"),true); assert.equal(critical.includes("global.AppStudyOptimization?.plan?global.AppStudyOptimization.plan(30,{profile,source:'critical-points'}):null"),false); assert.equal(critical.includes('global.AppPredictiveAdaptiveTutor?.resolve'),true); assert.equal(critical.includes('const tutorAction=predictive?.tutor?.action||block.method'),true); assert.equal(critical.includes("surface:'critical-points'"),true); assert.equal(critical.includes('preferredAction:tutorAction'),true); assert.equal(critical.includes('critical-points:phase6-prepared'),true); assert.equal(critical.includes('importedOrderMutation:false'),true); assert.equal(critical.includes('openLayeredReviewModal(numericIndex)'),true); });
`);

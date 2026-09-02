import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,c)=>fs.writeFileSync(path.join(root,p),c);
const exists=p=>fs.existsSync(path.join(root,p));
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};

const oldAssessment='public/js/core/domain-risk-dashboard.js';
const newAssessment='public/js/core/topic-assessment.js';
const legacyDashboard='public/js/core/study-optimization-dashboard.js';
const legacyCss='public/css/study-optimization.css';

assert(exists(oldAssessment),'legacy assessment source must exist at Phase 8C start');
assert(!exists(newAssessment),'topic-assessment.js must not pre-exist');
assert(exists(legacyDashboard),'legacy optimization facade must exist at Phase 8C start');
assert(exists(legacyCss),'legacy optimization CSS must exist at Phase 8C start');

fs.renameSync(path.join(root,oldAssessment),path.join(root,newAssessment));

const tracked=execFileSync('git',['ls-files'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
for(const file of tracked){
  if(!exists(file)||file===oldAssessment)continue;
  const ext=path.extname(file).toLowerCase();
  if(!['.js','.cjs','.mjs','.json','.html','.css','.md','.yml','.yaml','.gradle','.xml'].includes(ext))continue;
  let text;
  try{text=read(file)}catch{continue}
  if(text.includes('domain-risk-dashboard.js'))write(file,text.split('domain-risk-dashboard.js').join('topic-assessment.js'));
}

{
  const p='public/index.html';
  let html=read(p);
  const panel=/\n\s*<section id="phase6aDomainRiskPanel"[\s\S]*?<\/section>\n/;
  assert(panel.test(html),'Phase 6A hidden panel not found in index.html');
  html=html.replace(panel,'\n');
  html=html.replace(/^\s*<link rel="stylesheet" href="\.\/css\/study-optimization\.css">\s*\n/m,'');
  html=html.replace(/^\s*<script src="\.\/js\/core\/study-optimization-dashboard\.js" defer><\/script>\s*\n/m,'');
  assert(html.includes('./js/core/topic-assessment.js'),'canonical topic assessment loader missing after rename');
  write(p,html);
}

{
  const p='config/app-assets.json';
  const data=JSON.parse(read(p));
  const remove=new Set(['/js/core/study-optimization-dashboard.js','/css/study-optimization.css']);
  for(const [key,value] of Object.entries(data)){
    if(Array.isArray(value))data[key]=value.filter(item=>!remove.has(item));
  }
  const serialized=JSON.stringify(data,null,2)+'\n';
  assert(serialized.includes('/js/core/topic-assessment.js'),'topic-assessment.js missing from app-assets');
  assert(!serialized.includes('study-optimization-dashboard.js'),'legacy optimizer dashboard remains in app-assets');
  assert(!serialized.includes('study-optimization.css'),'legacy optimizer css remains in app-assets');
  write(p,serialized);
}

fs.unlinkSync(path.join(root,legacyDashboard));
fs.unlinkSync(path.join(root,legacyCss));

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
  assert.deepEqual(Object.keys(input.topicState),before); assert.deepEqual(queue.map(entry=>entry.key),['b::segundo','c::terceiro']);
});
test('assessment explicita contrato imutável de prioridade',()=>{
  const api=loadAssessment(); const state={materia:'A',assunto:'B',editalPriority:1,topicPriority:2,retention:60,accuracy:55}; const result=api.assessTopic({topicState:{'a::b':state}},'a::b');
  assert.equal(result.editalPriority,1); assert.equal(result.topicPriority,2); assert.equal(result.importedOrderMutation,false); assert.equal('reorder' in api,false); assert.equal('updatePriority' in api,false);
});
test('asset canônico é headless e painel visual legado saiu do shell',()=>{
  const html=fs.readFileSync('public/index.html','utf8'); assert.match(html,/\.\/js\/core\/topic-assessment\.js/); assert.doesNotMatch(html,/phase6aDomainRiskPanel|domain-risk-dashboard\.js/); assert.doesNotMatch(assessmentSource,/document\.(getElementById|querySelector|addEventListener)/);
});
`);

write('tests/phase-6b-study-optimization-dashboard.test.cjs',`const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('public/index.html','utf8');
const engine=fs.readFileSync('public/js/core/study-optimization-engine.js','utf8');
test('Phase 8C remove fisicamente fachada e CSS de apresentação legados',()=>{
  assert.equal(fs.existsSync('public/js/core/study-optimization-dashboard.js'),false); assert.equal(fs.existsSync('public/css/study-optimization.css'),false); assert.doesNotMatch(html,/study-optimization-dashboard\.js|study-optimization\.css/);
});
test('engine cognitivo permanece ativo sem dashboard removido',()=>{ assert.match(engine,/AppStudyOptimization/); assert.match(engine,/AppTopicAssessment/); assert.doesNotMatch(engine,/AppStudyOptimizationDashboard/); });
test('shell não contém painéis autônomos da antiga Fase 6',()=>{ assert.doesNotMatch(html,/phase6aDomainRiskPanel|phase6bStudyOptimizationPanel/); });
`);

write('tests/phase-6-critical-points-integration.test.cjs',`const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const critical=fs.readFileSync('public/js/critical-points-actions.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
test('standalone Phase 6 dashboards foram graduados para runtimes headless',()=>{ assert.match(html,/topic-assessment\.js/); assert.doesNotMatch(html,/domain-risk-dashboard\.js|study-optimization-dashboard\.js|study-optimization\.css/); assert.doesNotMatch(html,/phase6aDomainRiskPanel|phase6bStudyOptimizationPanel/); });
test('Critical Points consome domain risk sem markup visível',()=>{ assert.match(critical,/domainRisk:topic\.domainRisk\|\|null/); assert.match(critical,/domainComponent=Number\.isFinite\(domainRiskValue\)/); assert.match(critical,/phase6:\{masteryScore:/); assert.match(critical,/dataset\.phase6Mastery/); assert.doesNotMatch(critical,/Fase 6A|Fase 6B|Student Model|Study Optimizer/); });
test('Critical Points mantém optimizer e tutor sem reorder canônico',()=>{ assert.match(critical,/AppStudyOptimization\?\.forTopic\?global\.AppStudyOptimization\.forTopic\(topicId,30,\{profile,source:'critical-points'\}\):null/); assert.doesNotMatch(critical,/AppStudyOptimization\?\.plan\?global\.AppStudyOptimization\.plan\(30,\{profile,source:'critical-points'\}\):null/); assert.match(critical,/AppPredictiveAdaptiveTutor\?\.resolve/); assert.match(critical,/const tutorAction=predictive\?\.tutor\?\.action\|\|block\.method/); assert.match(critical,/surface:'critical-points'/); assert.match(critical,/preferredAction:tutorAction/); assert.match(critical,/critical-points:phase6-prepared/); assert.match(critical,/importedOrderMutation:false/); assert.match(critical,/openLayeredReviewModal\(numericIndex\)/); });
`);

write('tests/phase-8a-8b-consolidation.test.cjs',`'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path'); const vm=require('node:vm'); const root=path.resolve(__dirname,'..'); const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function loadAssessment(){ const events=[]; const window={CustomEvent:function(name,init){this.type=name;this.detail=init?.detail},dispatchEvent:event=>events.push(event)}; window.window=window; vm.runInNewContext(read('public/js/core/topic-assessment.js'),{window,console,Math,Number,String,Object,Array,Date,JSON,CustomEvent:window.CustomEvent}); return {api:window.AppTopicAssessment,events}; }
test('8A/8C keep cognitive assessment headless after physical graduation',()=>{ const assessment=read('public/js/core/topic-assessment.js'); const html=read('public/index.html'); assert.doesNotMatch(assessment,/document\.(getElementById|querySelector|addEventListener)/); assert.doesNotMatch(assessment,/MutationObserver|setTimeout\s*\(/); assert.equal(fs.existsSync(path.join(root,'public/js/core/study-optimization-dashboard.js')),false); assert.equal(fs.existsSync(path.join(root,'public/css/study-optimization.css')),false); assert.doesNotMatch(html,/phase6aDomainRiskPanel|phase6bStudyOptimizationPanel/); });
test('8B normalizes nested and flattened cognitive candidates consistently',()=>{ const {api}=loadAssessment(); assert.ok(api); const nested={retention:70,accuracy:55,lapseCount:1,domainRisk:{masteryScore:32,forgettingRisk:82,predictedRetention7d:44,evidenceLevel:'high',trend:'declining'}}; const flat={retention:70,accuracy:55,lapseCount:1,masteryScore:32,forgettingRisk:82,predictedRetention7d:44,evidenceLevel:'high',trend:'declining'}; const a=api.normalizeTopicState(nested),b=api.normalizeTopicState(flat); assert.equal(a.mastery,b.mastery); assert.equal(a.forgettingRisk,b.forgettingRisk); assert.equal(a.predictedRetention7d,b.predictedRetention7d); assert.equal(a.evidenceLevel,b.evidenceLevel); assert.equal(api.expectedGain(nested,25),api.expectedGain(flat,25)); assert.equal(api.optimizationScore(nested),api.optimizationScore(flat)); assert.equal(api.chooseOptimizationMethod(nested).method,api.chooseOptimizationMethod(flat).method); });
test('8B preserves imported order as contextual signal only',()=>{ const {api}=loadAssessment(); const state={materia:'A',assunto:'B',editalPriority:1,topicPriority:1,retention:60,accuracy:60,domainRisk:{masteryScore:60,forgettingRisk:50,predictedRetention7d:55,evidenceLevel:'medium'}}; const result=api.assessTopic({topicState:{'a::b':state}},'a::b'); assert.equal(result.editalPriority,1); assert.equal(result.topicPriority,1); assert.equal(result.importedOrderMutation,false); });
test('optimizer delegates shared assessment and never creates blocks above 35 minutes',()=>{ const source=read('public/js/core/study-optimization-engine.js'); assert.match(source,/AppTopicAssessment/); assert.match(source,/MAX_BLOCK_MINUTES=35/); assert.doesNotMatch(source,/minutes:last\.minutes\+remaining/); });
`);

write('tests/phase-8c-consolidation.test.cjs',`'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const vm=require('node:vm');
const html=fs.readFileSync('public/index.html','utf8'); const assets=JSON.parse(fs.readFileSync('config/app-assets.json','utf8')); const assessment=fs.readFileSync('public/js/core/topic-assessment.js','utf8');
test('8C physically graduates legacy Phase 6 presentation assets',()=>{ assert.equal(fs.existsSync('public/js/core/domain-risk-dashboard.js'),false); assert.equal(fs.existsSync('public/js/core/study-optimization-dashboard.js'),false); assert.equal(fs.existsSync('public/css/study-optimization.css'),false); assert.doesNotMatch(html,/phase6aDomainRiskPanel|phase6bStudyOptimizationPanel/); });
test('8C loads canonical topic assessment before optimizer and tutor',()=>{ const a=html.indexOf('./js/core/topic-assessment.js'),o=html.indexOf('./js/core/study-optimization-engine.js'),t=html.indexOf('./js/core/predictive-adaptive-tutor.js'); assert.ok(a>0); assert.ok(o>a); assert.ok(t>o); });
test('critical shell contains canonical runtime and no retired assets',()=>{ const serialized=JSON.stringify(assets); assert.match(serialized,/\/js\/core\/topic-assessment\.js/); assert.doesNotMatch(serialized,/domain-risk-dashboard\.js|study-optimization-dashboard\.js|study-optimization\.css/); });
test('canonical assessment preserves imported order contract',()=>{ const window={}; window.window=window; vm.runInNewContext(assessment,{window,Math,Number,String,Object,Array,Date,JSON}); const api=window.AppTopicAssessment; const state={materia:'A',assunto:'B',editalPriority:2,topicPriority:4,retention:45,accuracy:50}; const result=api.assessTopic({topicState:{'a::b':state}},'a::b'); assert.equal(result.editalPriority,2); assert.equal(result.topicPriority,4); assert.equal(result.importedOrderMutation,false); });
`);

const releaseFiles=['package.json','package-lock.json','public/version.json','config/app-assets.json','config/release-contract.json','src/index.js','public/sw.js','android/app/build.gradle','public/index.html','public/js/app-pwa.js','public/js/ui/navigation.js'];
for(const p of releaseFiles){ assert(exists(p),`release file missing: ${p}`); let text=read(p); if(text.includes('10.64.38'))text=text.split('10.64.38').join('10.64.39'); if(text.includes('106440'))text=text.split('106440').join('106441'); write(p,text); }
const oldPolish='public/css/responsive-polish-v10.64.38.css',newPolish='public/css/responsive-polish-v10.64.39.css';
assert(exists(oldPolish),'old responsive release css missing'); assert(!exists(newPolish),'new responsive release css already exists'); fs.renameSync(path.join(root,oldPolish),path.join(root,newPolish));

const finalHtml=read('public/index.html'),finalAssets=read('config/app-assets.json');
assert(!finalHtml.includes('domain-risk-dashboard.js'),'legacy assessment loader remains in index');
assert(!finalHtml.includes('study-optimization-dashboard.js'),'legacy optimizer dashboard remains in index');
assert(!finalHtml.includes('study-optimization.css'),'legacy optimizer css remains in index');
assert(!finalHtml.includes('phase6aDomainRiskPanel'),'legacy phase6a panel remains in index');
assert(!finalAssets.includes('domain-risk-dashboard.js'),'legacy assessment path remains in app-assets');
assert(!finalAssets.includes('study-optimization-dashboard.js'),'legacy dashboard remains in app-assets');
assert(!finalAssets.includes('study-optimization.css'),'legacy css remains in app-assets');
assert(read('config/release-contract.json').includes('"version": "10.64.39"'),'release contract not bumped');
assert(read('config/release-contract.json').includes('"versionCode": 106441'),'Android versionCode not bumped');

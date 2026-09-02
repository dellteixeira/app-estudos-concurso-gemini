import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const write=(p,c)=>fs.writeFileSync(p,c);
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};
const replace=(text,from,to,label)=>{must(text.includes(from),`missing ${label}`);return text.replace(from,to)};

// 1) TopicAssessment becomes the only owner of normalization/optimization semantics.
{
  const p='public/js/core/topic-assessment.js';
  let s=read(p);
  s=replace(s,"const MAX_ATTENTION=6;","const MAX_ATTENTION=6;\nconst PRIORITY_CONTRACT=Object.freeze({importedOrderMutation:false,editalPriority:'canonical-imported-order',topicPriority:'canonical-imported-order',learnerUrgency:'dynamic-context-only',recommendationScore:'dynamic-context-only'});",'priority contract');
  s=replace(s,"const API=Object.freeze({schemaVersion:SCHEMA_VERSION,normalizeTopicState,prioritySignal,optimizationScore,chooseOptimizationMethod,expectedGain,assessTopic,topicEntries,getAttentionQueue,buildViewModel,resolveProfile,findTopicInsight});","const API=Object.freeze({schemaVersion:SCHEMA_VERSION,priorityContract:PRIORITY_CONTRACT,normalizeTopicState,prioritySignal,optimizationScore,chooseOptimizationMethod,expectedGain,assessTopic,topicEntries,getAttentionQueue,buildViewModel,resolveProfile,findTopicInsight});",'canonical api');
  s=s.replace("\nglobal.AppDomainRiskDashboard=Object.freeze({schemaVersion:SCHEMA_VERSION,buildViewModel,getAttentionQueue,findTopicInsight,resolveProfile,render:()=>null,scheduleRender:()=>null,headless:true});",'');
  must(!s.includes('AppDomainRiskDashboard'),'legacy global alias remains');
  write(p,s);
}

// 2) Optimizer delegates all shared cognitive semantics to TopicAssessment.
{
  const p='public/js/core/study-optimization-engine.js';
  let s=read(p);
  const start=s.indexOf('function legacySignals(');
  const end=s.indexOf('function buildCandidates(');
  must(start>0&&end>start,'optimizer fallback block not found');
  const canonical=`function requireAssessment(){const api=assessment();if(!api?.normalizeTopicState||!api?.prioritySignal||!api?.optimizationScore||!api?.chooseOptimizationMethod||!api?.expectedGain)throw new Error('AppTopicAssessment is required before AppStudyOptimization');return api}\nfunction signals(state={}){return requireAssessment().normalizeTopicState(state)}\nfunction prioritySignal(state={}){return requireAssessment().prioritySignal(state)}\nfunction applicationGap(state={}){return signals(state).applicationGap||0}\nfunction candidateScore(state={}){return requireAssessment().optimizationScore(state)}\nfunction chooseMethod(state={}){return requireAssessment().chooseOptimizationMethod(state)}\nfunction expectedGain(state={},minutes=25){return requireAssessment().expectedGain(state,minutes)}\n`;
  s=s.slice(0,start)+canonical+s.slice(end);
  must(!s.includes('legacySignals'),'optimizer legacy signals remain');
  write(p,s);
}

// 3) Next-best action must use canonical normalization; no duplicate normalization fallback.
{
  const p='public/js/core/next-best-study-action.js';
  let s=read(p);
  const old="function normalized(state={}){const shared=assessment()?.normalizeTopicState?.(state);if(shared)return shared;const retention=finite(state.retention),accuracy=finite(state.accuracy);return {retention,accuracy,confidence:finite(state.confidence),lapseCount:Math.max(0,Number(state.lapseCount)||0),reviewCount:Math.max(0,Number(state.reviewCount)||0),difficulty:clamp(state.difficulty||5,1,10),lastStudyAt:safe(state.lastStudyAt,80),materia:safe(state.materia,180),assunto:safe(state.assunto,400)}}";
  const neo="function requireAssessment(){const api=assessment();if(!api?.normalizeTopicState||!api?.assessTopic)throw new Error('AppTopicAssessment is required before AppNextBestStudyAction');return api}\nfunction normalized(state={}){return requireAssessment().normalizeTopicState(state)}";
  s=replace(s,old,neo,'next best normalization fallback');
  s=s.replace("assessment:assessment()?.assessTopic?.(profile,topicId,state)||null","assessment:requireAssessment().assessTopic(profile,topicId,state)");
  write(p,s);
}

// 4) Predictive tutor must use canonical normalization and be safe in headless runtimes.
{
  const p='public/js/core/predictive-adaptive-tutor.js';
  let s=read(p);
  const start=s.indexOf('function signals(state={}){');
  const end=s.indexOf('function predictTopic(state={}){');
  must(start>0&&end>start,'predictive tutor fallback block not found');
  const canonical=`function requireAssessment(){const api=assessment();if(!api?.normalizeTopicState)throw new Error('AppTopicAssessment is required before AppPredictiveAdaptiveTutor');return api}\nfunction signals(state={}){return requireAssessment().normalizeTopicState(state)}\n`;
  s=s.slice(0,start)+canonical+s.slice(end);
  s=s.replace("global.dispatchEvent?.(new CustomEvent('study:predictive-tutor-ready',{detail:{schemaVersion:SCHEMA_VERSION,topicAssessment:Boolean(assessment())}}));","if(typeof global.CustomEvent==='function')global.dispatchEvent?.(new global.CustomEvent('study:predictive-tutor-ready',{detail:{schemaVersion:SCHEMA_VERSION,topicAssessment:true}}));");
  write(p,s);
}

// 5) Final architecture regression tests.
write('tests/phase-8d-final-consolidation.test.cjs',`'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const assessment=read('public/js/core/topic-assessment.js');
const optimizer=read('public/js/core/study-optimization-engine.js');
const nextBest=read('public/js/core/next-best-study-action.js');
const tutor=read('public/js/core/predictive-adaptive-tutor.js');

test('8D removes final DomainRiskDashboard compatibility global',()=>{
  assert.equal(assessment.includes('AppDomainRiskDashboard'),false);
});

test('8D makes TopicAssessment the single owner of shared cognitive semantics',()=>{
  assert.equal(optimizer.includes('legacySignals'),false);
  assert.equal(optimizer.includes("s.forgettingRisk*.30+(100-s.mastery)*.24"),false);
  assert.equal(nextBest.includes('const shared=assessment()?.normalizeTopicState'),false);
  assert.equal(tutor.includes('const domain=state.domainRisk||{}'),false);
  for(const source of [optimizer,nextBest,tutor]) assert.equal(source.includes('requireAssessment()'),true);
});

test('canonical priority contract is explicit and immutable',()=>{
  const window={};window.window=window;
  vm.runInNewContext(assessment,{window,Math,Number,String,Object,Array,Date,JSON});
  const contract=window.AppTopicAssessment.priorityContract;
  assert.equal(contract.importedOrderMutation,false);
  assert.equal(contract.editalPriority,'canonical-imported-order');
  assert.equal(contract.topicPriority,'canonical-imported-order');
  assert.equal(contract.learnerUrgency,'dynamic-context-only');
  assert.equal(contract.recommendationScore,'dynamic-context-only');
});

test('predictive tutor ready event is guarded for headless runtime',()=>{
  assert.equal(tutor.includes("typeof global.CustomEvent==='function'"),true);
  const window={AppTopicAssessment:{normalizeTopicState:()=>({})}};window.window=window;
  assert.doesNotThrow(()=>vm.runInNewContext(tutor,{window,Math,Number,String,Object,Array,Date,JSON,WeakMap}));
});
`);

// 6) Release 10.64.40 / Android 106442.
const releaseFiles=['package.json','package-lock.json','public/version.json','config/app-assets.json','config/release-contract.json','src/index.js','public/sw.js','android/app/build.gradle','public/index.html','public/js/app-pwa.js','public/js/ui/navigation.js'];
for(const p of releaseFiles){let s=read(p);s=s.split('10.64.39').join('10.64.40').split('106441').join('106442');write(p,s)}
const oldCss='public/css/responsive-polish-v10.64.39.css',newCss='public/css/responsive-polish-v10.64.40.css';
must(fs.existsSync(oldCss),'responsive polish 10.64.39 missing');
fs.renameSync(oldCss,newCss);

const contract=JSON.parse(read('config/release-contract.json'));
must(contract.version==='10.64.40','release contract web version mismatch');
must(contract.android.versionCode===106442,'release contract Android code mismatch');

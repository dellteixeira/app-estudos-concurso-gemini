'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/core/offline-sync-metadata-expanded-stability.js','utf8');
const rolloutSource=fs.readFileSync('public/js/core/offline-sync-metadata-rollout.js','utf8');
const appStateSource=fs.readFileSync('public/js/app-state.js','utf8');

function rows(successes=0, failures=0, aborted=0){
  return [
    ...Array.from({length:successes},(_,i)=>({sessionId:`s${i}`,outcome:'success'})),
    ...Array.from({length:failures},(_,i)=>({sessionId:`f${i}`,outcome:'failure'})),
    ...Array.from({length:aborted},(_,i)=>({sessionId:`a${i}`,outcome:'aborted'}))
  ].slice(-10);
}

function makeContext(options={}){
  const listeners=new Map();
  const events=[];
  const history=options.history||rows();
  const tier=options.tier||'population-expanded-ring-3';
  const parityEligible=options.parityEligible!==false;
  const bucket=tier==='pilot'?1:tier==='expanded-base'?15:tier==='population-expanded-base'?30:tier==='population-expanded-ring-2'?40:tier==='population-expanded-ring-3'?50:70;
  const context={
    console,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,Math,
    currentUser:{id:options.userId||'ring3-user'},
    OfflineSyncMetadataRollout:{
      getCohortAssignment:userId=>({
        userId:userId||null,
        bucket,
        percent:55,
        included:tier!=='excluded',
        pilotPercent:10,
        pilotIncluded:tier==='pilot',
        firstExpandedPercent:25,
        firstExpandedIncluded:tier==='pilot'||tier==='expanded-base',
        previousPercent:35,
        previousIncluded:['pilot','expanded-base','population-expanded-base'].includes(tier),
        ring2Percent:45,
        ring2Included:['pilot','expanded-base','population-expanded-base','population-expanded-ring-2'].includes(tier),
        tier
      })
    },
    OfflineSyncMetadataStability:{
      WINDOW_SIZE:10,
      readHistory:()=>Object.freeze(history.map(row=>Object.freeze({...row}))),
      getReport:userId=>({
        userId:userId||null,
        window:10,
        parity:{eligible:parityEligible},
        history:Object.freeze(history.map(row=>Object.freeze({...row})))
      })
    },
    CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},
    addEventListener:(type,fn)=>{const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},
    dispatchEvent:event=>{events.push(event);for(const fn of listeners.get(event.type)||[]) fn(event);return true;}
  };
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'offline-sync-metadata-expanded-stability.js'});
  context.OfflineSyncMetadataExpandedStability.install();
  return {context,events};
}

test('4W reutiliza o ledger longitudinal existente sem nova autoridade remota',()=>{
  assert.match(source,/metadata-population-ring3-stability-v1/);
  assert.match(source,/OfflineSyncMetadataStability/);
  assert.doesNotMatch(source,/\.from\s*\(/);
  assert.doesNotMatch(source,/\.upsert\s*\(/);
  assert.doesNotMatch(source,/\.delete\s*\(/);
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.doesNotMatch(source,/localStorage|setItem\s*\(/);
  assert.match(source,/remoteAuthority:false/);
});

test('ring-3 exige cinco canários limpos em janela longitudinal de dez observações',()=>{
  const report=makeContext({history:rows(5)}).context.OfflineSyncMetadataExpandedStability.getRing3Report();
  assert.equal(report.mode,'metadata-population-ring3-stability-v1');
  assert.equal(report.tier,'population-expanded-ring-3');
  assert.equal(report.window,10);
  assert.equal(report.requiredCleanSuccesses,5);
  assert.equal(report.successes,5);
  assert.equal(report.failures,0);
  assert.equal(report.aborted,0);
  assert.equal(report.stable,true);
  assert.equal(report.readyForDepthReview,true);
  assert.equal(report.remoteWriteBudget,1);
  assert.equal(report.populationPercent,55);
});

test('quatro sucessos ainda não liberam revisão de profundidade na 4W',()=>{
  const report=makeContext({history:rows(4)}).context.OfflineSyncMetadataExpandedStability.getRing3Report();
  assert.equal(report.readyForDepthReview,false);
  assert.ok([...report.reasons].includes('insufficient-clean-ring3-canaries'));
});

test('failure ou aborto recente bloqueia a prontidão 4W',()=>{
  const failed=makeContext({history:rows(5,1)}).context.OfflineSyncMetadataExpandedStability.getRing3Report();
  assert.equal(failed.readyForDepthReview,false);
  assert.ok([...failed.reasons].includes('recent-ring3-canary-failure'));
  const aborted=makeContext({history:rows(5,0,1)}).context.OfflineSyncMetadataExpandedStability.getRing3Report();
  assert.equal(aborted.readyForDepthReview,false);
  assert.ok([...aborted.reasons].includes('recent-ring3-canary-abort'));
});

test('tiers históricos e excluídos não são qualificados pela 4W',()=>{
  for(const tier of ['pilot','expanded-base','population-expanded-base','population-expanded-ring-2','excluded']){
    const report=makeContext({tier,history:rows(6)}).context.OfflineSyncMetadataExpandedStability.getRing3Report();
    assert.equal(report.readyForDepthReview,false);
    assert.ok([...report.reasons].includes('outside-population-expanded-ring-3-tier'));
  }
});

test('paridade atual continua obrigatória para ring-3',()=>{
  const report=makeContext({history:rows(5),parityEligible:false}).context.OfflineSyncMetadataExpandedStability.getRing3Report();
  assert.equal(report.readyForDepthReview,false);
  assert.ok([...report.reasons].includes('metadata-parity-not-eligible'));
});

test('evento longitudinal reavalia 4W apenas para population-expanded-ring-3',()=>{
  const env=makeContext({history:rows(5)});
  env.context.dispatchEvent(new env.context.CustomEvent('offline-sync-metadata-stability:observed',{detail:{outcome:'success'}}));
  const event=env.events.find(row=>row.type==='offline-sync-metadata-ring3-stability:evaluated');
  assert.ok(event);
  assert.equal(event.detail.readyForDepthReview,true);

  const previous=makeContext({tier:'population-expanded-ring-2',history:rows(5)});
  previous.context.dispatchEvent(new previous.context.CustomEvent('offline-sync-metadata-stability:observed',{detail:{outcome:'success'}}));
  assert.equal(previous.events.some(row=>row.type==='offline-sync-metadata-ring3-stability:evaluated'),false);
  assert.ok(previous.events.some(row=>row.type==='offline-sync-metadata-ring2-stability:evaluated'));
});

test('diagnóstico AppState incorpora 4W no asset existente sem novo loader',()=>{
  const diagnostics=makeContext({history:rows(5)}).context.OfflineSyncMetadataExpandedStability.getDiagnostics();
  assert.equal(diagnostics.ring3Mode,'metadata-population-ring3-stability-v1');
  assert.equal(diagnostics.ring3Report.readyForDepthReview,true);
  assert.ok([...diagnostics.scope].includes('local-diagnostic:population-expanded-ring-3:concursos_metadata'));
  assert.match(appStateSource,/getOfflineSyncMetadataExpandedStabilityDiagnostics/);
  assert.match(appStateSource,/offline-sync-metadata-expanded-stability\.js\?v=10\.55\.0/);
});

test('4W preserva rollout global 55% e orçamento-base de um write',()=>{
  assert.match(rolloutSource,/const RING2_COHORT_PERCENT = 45/);
  assert.match(rolloutSource,/const COHORT_PERCENT = 55/);
  assert.match(rolloutSource,/population-expanded-ring-3/);
  assert.doesNotMatch(source,/getRing3Report[\s\S]*?remoteWriteBudget\s*:\s*2/);
  const report=makeContext({history:rows(5)}).context.OfflineSyncMetadataExpandedStability.getRing3Report();
  assert.equal(report.populationPercent,55);
  assert.equal(report.remoteWriteBudget,1);
});

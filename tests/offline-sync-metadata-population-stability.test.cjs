'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/js/core/offline-sync-metadata-expanded-stability.js','utf8');
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
  const tier=options.tier||'population-expanded-base';
  const parityEligible=options.parityEligible!==false;
  const bucket=tier==='pilot'?1:tier==='expanded-base'?15:tier==='population-expanded-base'?30:70;
  const context={
    console,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,Math,
    currentUser:{id:options.userId||'population-user'},
    OfflineSyncMetadataRollout:{
      getCohortAssignment:userId=>({
        userId:userId||null,
        bucket,
        percent:35,
        included:tier!=='excluded',
        pilotPercent:10,
        pilotIncluded:tier==='pilot',
        previousPercent:25,
        previousIncluded:tier==='pilot'||tier==='expanded-base',
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

test('4O reutiliza o ledger longitudinal existente sem nova autoridade remota',()=>{
  assert.match(source,/metadata-population-expanded-stability-v1/);
  assert.match(source,/OfflineSyncMetadataStability/);
  assert.doesNotMatch(source,/\.from\s*\(/);
  assert.doesNotMatch(source,/\.upsert\s*\(/);
  assert.doesNotMatch(source,/\.delete\s*\(/);
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.doesNotMatch(source,/localStorage|setItem\s*\(/);
  assert.match(source,/remoteAuthority:false/);
});

test('population-expanded-base exige cinco canários limpos para revisão de profundidade',()=>{
  const report=makeContext({history:rows(5)}).context.OfflineSyncMetadataExpandedStability.getPopulationReport();
  assert.equal(report.mode,'metadata-population-expanded-stability-v1');
  assert.equal(report.tier,'population-expanded-base');
  assert.equal(report.requiredCleanSuccesses,5);
  assert.equal(report.successes,5);
  assert.equal(report.failures,0);
  assert.equal(report.aborted,0);
  assert.equal(report.stable,true);
  assert.equal(report.readyForDepthReview,true);
  assert.equal(report.remoteWriteBudget,1);
  assert.equal(report.populationPercent,35);
});

test('quatro sucessos ainda não liberam revisão de profundidade',()=>{
  const report=makeContext({history:rows(4)}).context.OfflineSyncMetadataExpandedStability.getPopulationReport();
  assert.equal(report.readyForDepthReview,false);
  assert.ok([...report.reasons].includes('insufficient-clean-population-canaries'));
});

test('failure ou aborto recente bloqueia a prontidão 4O',()=>{
  const failed=makeContext({history:rows(5,1)}).context.OfflineSyncMetadataExpandedStability.getPopulationReport();
  assert.equal(failed.readyForDepthReview,false);
  assert.ok([...failed.reasons].includes('recent-population-canary-failure'));
  const aborted=makeContext({history:rows(5,0,1)}).context.OfflineSyncMetadataExpandedStability.getPopulationReport();
  assert.equal(aborted.readyForDepthReview,false);
  assert.ok([...aborted.reasons].includes('recent-population-canary-abort'));
});

test('piloto, expanded-base legado e excluídos não são qualificados pela 4O',()=>{
  for(const tier of ['pilot','expanded-base','excluded']){
    const report=makeContext({tier,history:rows(6)}).context.OfflineSyncMetadataExpandedStability.getPopulationReport();
    assert.equal(report.readyForDepthReview,false);
    assert.ok([...report.reasons].includes('outside-population-expanded-base-tier'));
  }
});

test('paridade atual continua obrigatória na nova faixa',()=>{
  const report=makeContext({history:rows(5),parityEligible:false}).context.OfflineSyncMetadataExpandedStability.getPopulationReport();
  assert.equal(report.readyForDepthReview,false);
  assert.ok([...report.reasons].includes('metadata-parity-not-eligible'));
});

test('evento longitudinal reavalia 4O apenas para population-expanded-base',()=>{
  const env=makeContext({history:rows(5)});
  env.context.dispatchEvent(new env.context.CustomEvent('offline-sync-metadata-stability:observed',{detail:{outcome:'success'}}));
  const event=env.events.find(row=>row.type==='offline-sync-metadata-population-stability:evaluated');
  assert.ok(event);
  assert.equal(event.detail.readyForDepthReview,true);

  const expanded=makeContext({tier:'expanded-base',history:rows(5)});
  expanded.context.dispatchEvent(new expanded.context.CustomEvent('offline-sync-metadata-stability:observed',{detail:{outcome:'success'}}));
  assert.equal(expanded.events.some(row=>row.type==='offline-sync-metadata-population-stability:evaluated'),false);
  assert.ok(expanded.events.some(row=>row.type==='offline-sync-metadata-expanded-stability:evaluated'));
});

test('diagnóstico já exposto pelo AppState incorpora o relatório 4O sem novo asset',()=>{
  const diagnostics=makeContext({history:rows(5)}).context.OfflineSyncMetadataExpandedStability.getDiagnostics();
  assert.equal(diagnostics.populationMode,'metadata-population-expanded-stability-v1');
  assert.equal(diagnostics.populationReport.readyForDepthReview,true);
  assert.ok([...diagnostics.scope].includes('local-diagnostic:population-expanded-base:concursos_metadata'));
  assert.match(appStateSource,/getOfflineSyncMetadataExpandedStabilityDiagnostics/);
  assert.match(appStateSource,/offline-sync-metadata-expanded-stability\.js\?v=10\.47\.0/);
});

test('4O não altera população nem orçamento remoto',()=>{
  assert.doesNotMatch(source,/COHORT_PERCENT\s*=\s*4[0-9]/);
  assert.doesNotMatch(source,/remoteWriteBudget\s*:\s*2/);
  const report=makeContext({history:rows(5)}).context.OfflineSyncMetadataExpandedStability.getPopulationReport();
  assert.equal(report.populationPercent,35);
  assert.equal(report.remoteWriteBudget,1);
});

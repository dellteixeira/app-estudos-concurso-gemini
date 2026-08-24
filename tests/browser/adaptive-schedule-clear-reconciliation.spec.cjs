const { test, expect } = require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const reconciliationSource=fs.readFileSync(path.join(__dirname,'../../public/js/adaptive-schedule-reconciliation.js'),'utf8');

test('clear schedule zeros scheduled overdue while preserving cognitive retention risk',async({page})=>{
  await page.setContent('<!doctype html><html><body><div id="fixture"></div></body></html>');
  await page.evaluate(()=>{
    const key='direito civil::pessoas naturais';
    window.currentConcurso='Teste';
    window.editalItems=[{materia:'Direito Civil',assunto:'Pessoas naturais',teoria:true,questoes:true}];
    window.__metadata={Teste:{
      dateSchedule:{'2020-01-02':['Direito Civil - Pessoas naturais']},
      scheduleConfig:{startDate:'2020-01-01'},
      adaptiveScheduleAnchor:{version:1,source:'gerarCronogramaInteligente',plannedStartDate:'2020-01-01'},
      studySessions:[],
      retentionEngine:{topics:{[key]:{key,retention:40,nextReviewAt:'2020-01-01T10:00:00',difficulty:7,reviewCount:3,lapseCount:2,sessionCount:4,totalMinutes:80,questionStats:{lastAccuracy:52,confidence:.7}}}}
    }};
    window.getLocalDateKey=date=>{const d=new Date(date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
    window.getStudyTopicKey=(m,a)=>`${m}::${a}`.toLowerCase();
    window.normalizeScheduledTopicForStudy=text=>String(text||'');
    window.getScheduledItemStudyState=text=>({done:false,cleanTop:String(text||'')});
    window.isRevisionScheduleText=()=>true;
    window.getStudySessionTopicKey=session=>session?.topicKey||'';
    window.StudyDomain={getSessionMinutes:s=>Number(s?.minutes||0),filterActiveRetentionStates:(states,active)=>states.filter(s=>active.has(s.key))};
    window.isContentAcquired=()=>true;
    window.hasAnyAdaptiveRevisionCompletion=()=>false;
    window.getConcursosMetadata=()=>window.__metadata;
    window.saveConcursosMetadata=async metadata=>{window.__metadata=metadata};
    window.getRetentionEngine=contest=>contest.retentionEngine;
    window.calculateRetentionFromState=state=>Number(state.retention);
    window.computeRetentionSchedulerScore=()=>({total:900});
    window.getRetentionTopicState=(contest,m,a)=>contest.retentionEngine.topics[window.getStudyTopicKey(m,a)];
    window.hasRetentionMasteryEvidence=()=>false;
    window.rebuildRetentionEngineForContest=contest=>contest;
    window.renderMonthCalendar=()=>{window.__calendarRenders=(window.__calendarRenders||0)+1};
    window.renderDelayedPanel=()=>{window.__delayedRenders=(window.__delayedRenders||0)+1};
    window.updateModernOverview=()=>{window.__overviewRenders=(window.__overviewRenders||0)+1};
    window.renderRetentionDiagnostics=()=>{if(typeof window.buildRetentionDiagnostics==='function')window.__diagnostics=window.buildRetentionDiagnostics()};
    window.gerarCronogramaInteligente=async()=>{};
    window.gerarCronogramaMetodo2=async()=>{};
    window.reorganizarMateriasCronograma=async()=>{};
    window.limparCronogramaMesAtual=async()=>{window.__metadata.Teste.dateSchedule={}};
  });

  await page.addScriptTag({content:reconciliationSource});
  await page.waitForFunction(()=>Boolean(window.AdaptiveScheduleReconciliation));

  const before=await page.evaluate(()=>window.buildRetentionDiagnostics());
  expect(before.avg).toBe(40);
  expect(before.risk).toHaveLength(1);
  expect(before.overdue).toHaveLength(1);
  expect(before.rows[0].retentionDue).toBe(true);
  expect(before.rows[0].scheduledPending).toBe(true);
  expect(before.rows[0].scheduledOverdue).toBe(true);

  await page.evaluate(()=>window.limparCronogramaMesAtual());

  const after=await page.evaluate(()=>window.buildRetentionDiagnostics());
  expect(after.avg).toBe(40);
  expect(after.risk).toHaveLength(1);
  expect(after.overdue).toHaveLength(0);
  expect(after.rows[0].retentionDue).toBe(true);
  expect(after.rows[0].scheduledPending).toBe(false);
  expect(after.rows[0].scheduledOverdue).toBe(false);
  expect(after.rows[0].overdue).toBe(false);
  expect(await page.evaluate(()=>window.__metadata.Teste.adaptiveScheduleAnchor)).toBeUndefined();
  expect(await page.evaluate(()=>window.__calendarRenders||0)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>window.__delayedRenders||0)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>window.__overviewRenders||0)).toBeGreaterThan(0);
});

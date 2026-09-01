(function installStudyOptimizationEngine(global){
'use strict';
if(global.AppStudyOptimization)return;

const SCHEMA_VERSION=1;
const SUPPORTED_WINDOWS=Object.freeze([30,60,90]);
const MIN_BLOCK_MINUTES=10;
const MAX_BLOCK_MINUTES=35;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const clean=(value,max=320)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const finite=value=>Number.isFinite(Number(value))?Number(value):null;

function readProfile(context={}){
  const userId=clean(context.userId||global.currentUser?.id||'guest',120);
  const contest=clean(context.contest||global.currentConcurso||'Concurso Geral',180);
  try{return global.AppCognitiveProfile?.read?.(userId,contest)||null}catch(_){return null}
}

function prioritySignal(state={}){
  const imported=finite(state.topicPriority??state.editalPriority);
  if(imported==null)return 50;
  return clamp(100-(Math.max(1,Math.round(imported))-1)*18,28,100);
}

function applicationGap(state={}){
  const retention=finite(state.retention);
  const accuracy=finite(state.accuracy);
  if(retention==null||accuracy==null)return 0;
  return Math.max(0,retention-accuracy);
}

function candidateScore(state={}){
  const domain=state.domainRisk||{};
  const mastery=finite(domain.masteryScore)??50;
  const risk=finite(domain.forgettingRisk)??50;
  const predicted=finite(domain.predictedRetention7d)??finite(state.retention)??50;
  const accuracy=finite(state.accuracy)??50;
  const trendBoost=domain.trend==='declining'?100:domain.trend==='improving'?20:50;
  const gap=applicationGap(state);
  return Math.round(clamp(
    risk*0.30+
    (100-mastery)*0.24+
    (100-predicted)*0.14+
    (100-accuracy)*0.12+
    prioritySignal(state)*0.10+
    trendBoost*0.06+
    gap*0.04,
    0,100
  ));
}

function chooseMethod(state={}){
  const domain=state.domainRisk||{};
  const retention=finite(state.retention)??50;
  const accuracy=finite(state.accuracy)??retention;
  const mastery=finite(domain.masteryScore)??Math.round((retention+accuracy)/2);
  const gap=applicationGap(state);
  const lapses=Math.max(0,Number(state.lapseCount)||0);

  if(mastery<42||lapses>=4)return {method:'focused_restudy',label:'Reestudo direcionado'};
  if(retention>=70&&(accuracy<65||gap>=18))return {method:'questions',label:'Questões de validação'};
  if(retention<55)return {method:'active_recall',label:'Recuperação ativa'};
  if(retention<70)return {method:'short_review',label:'Revisão curta'};
  if(accuracy<75)return {method:'questions',label:'Questões comentadas'};
  return {method:'questions',label:'Questões de manutenção'};
}

function expectedGain(state={},minutes=25){
  const domain=state.domainRisk||{};
  const mastery=finite(domain.masteryScore)??50;
  const risk=finite(domain.forgettingRisk)??50;
  const evidence=domain.evidenceLevel==='high'?1:domain.evidenceLevel==='medium'?0.86:0.72;
  const opportunity=clamp((100-mastery)*0.62+risk*0.38,0,100);
  const timeFactor=1-Math.exp(-Math.max(0,Number(minutes)||0)/28);
  return Number(clamp(opportunity*timeFactor*0.34*evidence,0,25).toFixed(1));
}

function buildCandidates(profile){
  const topicState=profile?.topicState&&typeof profile.topicState==='object'?profile.topicState:{};
  return Object.entries(topicState).map(([topicId,state],canonicalIndex)=>{
    const method=chooseMethod(state);
    const score=candidateScore(state);
    return {
      topicId,
      canonicalIndex,
      materia:clean(state.materia,180),
      assunto:clean(state.assunto,400),
      method:method.method,
      methodLabel:method.label,
      optimizationScore:score,
      masteryScore:finite(state.domainRisk?.masteryScore),
      forgettingRisk:finite(state.domainRisk?.forgettingRisk),
      predictedRetention7d:finite(state.domainRisk?.predictedRetention7d),
      evidenceLevel:clean(state.domainRisk?.evidenceLevel,40)||'low',
      trend:clean(state.domainRisk?.trend,60)||'insufficient_evidence',
      editalPriority:finite(state.editalPriority),
      topicPriority:finite(state.topicPriority),
      retention:finite(state.retention),
      accuracy:finite(state.accuracy),
      lapseCount:Math.max(0,Number(state.lapseCount)||0)
    };
  });
}

function blockMinutesFor(candidate,remaining){
  const base=candidate.method==='focused_restudy'?30:candidate.method==='questions'?20:15;
  const riskBonus=(candidate.forgettingRisk??0)>=65?5:0;
  const scoreBonus=candidate.optimizationScore>=75?5:0;
  const suggested=clamp(base+riskBonus+scoreBonus,MIN_BLOCK_MINUTES,MAX_BLOCK_MINUTES);
  return Math.min(remaining,Math.max(MIN_BLOCK_MINUTES,suggested));
}

function reasonFor(candidate){
  const reasons=[];
  if((candidate.forgettingRisk??0)>=65)reasons.push('risco de esquecimento alto');
  else if((candidate.forgettingRisk??0)>=40)reasons.push('risco de esquecimento moderado');
  if((candidate.masteryScore??100)<60)reasons.push('domínio abaixo do desejável');
  if((candidate.retention??0)>=70&&(candidate.accuracy??100)<65)reasons.push('retenção alta com aplicação baixa');
  if(candidate.trend==='declining')reasons.push('tendência de queda');
  if(candidate.editalPriority===1||candidate.topicPriority===1)reasons.push('alta prioridade importada');
  return reasons.slice(0,3);
}

function optimize(profile,availableMinutes=60,options={}){
  const budget=SUPPORTED_WINDOWS.includes(Number(availableMinutes))?Number(availableMinutes):clamp(Math.round(Number(availableMinutes)||60),20,180);
  const candidates=buildCandidates(profile);
  const ranked=[...candidates].sort((a,b)=>b.optimizationScore-a.optimizationScore||a.canonicalIndex-b.canonicalIndex);
  const blocks=[];
  let remaining=budget;
  let cursor=0;

  while(remaining>=MIN_BLOCK_MINUTES&&ranked.length){
    const candidate=ranked[cursor%ranked.length];
    const minutes=blockMinutesFor(candidate,remaining);
    if(minutes<MIN_BLOCK_MINUTES)break;
    blocks.push(Object.freeze({
      sequence:blocks.length+1,
      topicId:candidate.topicId,
      materia:candidate.materia,
      assunto:candidate.assunto,
      method:candidate.method,
      methodLabel:candidate.methodLabel,
      minutes,
      expectedGain:expectedGain(candidate,minutes),
      optimizationScore:candidate.optimizationScore,
      reasons:reasonFor(candidate),
      canonicalIndex:candidate.canonicalIndex,
      editalPriority:candidate.editalPriority,
      topicPriority:candidate.topicPriority
    }));
    remaining-=minutes;
    ranked.splice(cursor%ranked.length,1);
    cursor=0;
  }

  if(remaining>0&&blocks.length){
    const last=blocks[blocks.length-1];
    const adjusted=Object.freeze({...last,minutes:last.minutes+remaining,expectedGain:expectedGain(last,last.minutes+remaining)});
    blocks[blocks.length-1]=adjusted;
    remaining=0;
  }

  const totalExpectedGain=Number(blocks.reduce((sum,item)=>sum+(Number(item.expectedGain)||0),0).toFixed(1));
  const result=Object.freeze({
    schemaVersion:SCHEMA_VERSION,
    availableMinutes:budget,
    allocatedMinutes:blocks.reduce((sum,item)=>sum+item.minutes,0),
    totalExpectedGain,
    blocks:Object.freeze(blocks),
    sourceTopicCount:candidates.length,
    generatedAt:new Date().toISOString(),
    priorityContract:Object.freeze({
      importedOrderMutation:false,
      planOrdering:'temporary-contextual-only',
      editalPriority:'contextual-weight-only',
      topicPriority:'contextual-weight-only'
    })
  });
  try{
    global.AppStudyEvents?.emit?.('study:optimization-resolved',{availableMinutes:budget,allocatedMinutes:result.allocatedMinutes,totalExpectedGain,blocks:blocks.map(item=>({topicId:item.topicId,method:item.method,minutes:item.minutes}))},{source:'study-optimization'});
  }catch(_){}
  return result;
}

function plan(availableMinutes=60,context={}){
  const profile=context.profile||readProfile(context);
  if(!profile)return optimize({topicState:{}},availableMinutes,context);
  return optimize(profile,availableMinutes,context);
}

function presets(context={}){
  return Object.freeze(Object.fromEntries(SUPPORTED_WINDOWS.map(minutes=>[minutes,plan(minutes,context)])));
}

global.AppStudyOptimization=Object.freeze({
  schemaVersion:SCHEMA_VERSION,
  supportedWindows:SUPPORTED_WINDOWS,
  prioritySignal,
  candidateScore,
  chooseMethod,
  expectedGain,
  buildCandidates,
  optimize,
  plan,
  presets
});

global.dispatchEvent?.(new CustomEvent('study:optimization-ready',{detail:{schemaVersion:SCHEMA_VERSION}}));
})(window);

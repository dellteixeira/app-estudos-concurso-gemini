(function installErrorIntelligence(global){
'use strict';
if(global.AppErrorIntelligence)return;

const SCHEMA_VERSION=1;
const TYPES=Object.freeze({
  application:'Erro de aplicação',
  forgetting:'Esquecimento',
  false_mastery:'Falsa maestria',
  overconfidence:'Excesso de confiança',
  persistent:'Dificuldade persistente'
});
const safe=(value,max=320)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const finite=value=>value==null||value===''?null:(Number.isFinite(Number(value))?Number(value):null);

function classifyTopic(topicId,state={}){
  const retention=finite(state.retention);
  const accuracy=finite(state.accuracy);
  const confidence=finite(state.confidence);
  const lapseCount=Math.max(0,Number(state.lapseCount)||0);
  const reviewCount=Math.max(0,Number(state.reviewCount)||0);
  const difficulty=clamp(state.difficulty||5,1,10);
  const signals=[];

  if(accuracy!=null&&accuracy<60&&retention!=null&&retention>=75){
    signals.push({type:'false_mastery',severity:clamp((75-accuracy)*1.1+(retention-75)*.3,0,100),reason:'Retenção aparente alta com baixo desempenho em aplicação.'});
  }
  if(retention!=null&&retention<60&&(lapseCount>=1||state.lastRating==='forgot')){
    signals.push({type:'forgetting',severity:clamp((60-retention)*1.25+lapseCount*8,0,100),reason:'Retenção baixa acompanhada de lapsos ou esquecimento explícito.'});
  }
  if(accuracy!=null&&accuracy<65&&confidence!=null&&confidence>=.75){
    signals.push({type:'overconfidence',severity:clamp((65-accuracy)*1.2+(confidence-.75)*80,0,100),reason:'Confiança elevada apesar de acurácia insuficiente.'});
  }
  if(accuracy!=null&&accuracy<60&&!(retention!=null&&retention>=75)){
    signals.push({type:'application',severity:clamp((60-accuracy)*1.35+difficulty*2,0,100),reason:'O principal gargalo observado está na aplicação do conteúdo.'});
  }
  if((reviewCount>=4||difficulty>=8)&&(retention==null||retention<70||accuracy==null||accuracy<70)){
    signals.push({type:'persistent',severity:clamp(reviewCount*7+difficulty*5+(retention!=null?Math.max(0,70-retention):0),0,100),reason:'A dificuldade persiste mesmo após múltiplas revisões ou alta dificuldade registrada.'});
  }

  return signals.map(signal=>({
    topicId:safe(topicId,640),
    materia:safe(state.materia,180),
    assunto:safe(state.assunto,400),
    ...signal,
    severity:Math.round(signal.severity),
    label:TYPES[signal.type],
    metrics:{retention,accuracy,confidence,lapseCount,reviewCount,difficulty}
  }));
}

function analyzeProfile(profile={}){
  const topicState=profile?.topicState&&typeof profile.topicState==='object'?profile.topicState:{};
  const findings=Object.entries(topicState).flatMap(([topicId,state])=>classifyTopic(topicId,state));
  return findings
    .filter(item=>item.severity>=20)
    .sort((a,b)=>b.severity-a.severity||a.materia.localeCompare(b.materia))
    .slice(0,40);
}

function aggregate(findings=[]){
  const byType={};
  const bySubject={};
  for(const item of Array.isArray(findings)?findings:[]){
    const type=String(item?.type||'');
    if(!TYPES[type])continue;
    const current=byType[type]||{type,label:TYPES[type],count:0,maxSeverity:0,avgSeverity:0,totalSeverity:0};
    current.count+=1;
    current.maxSeverity=Math.max(current.maxSeverity,Number(item.severity)||0);
    current.totalSeverity+=Number(item.severity)||0;
    current.avgSeverity=Math.round(current.totalSeverity/current.count);
    byType[type]=current;

    const materia=safe(item.materia||'Sem matéria',180)||'Sem matéria';
    const subject=bySubject[materia]||{materia,count:0,maxSeverity:0,types:{}};
    subject.count+=1;
    subject.maxSeverity=Math.max(subject.maxSeverity,Number(item.severity)||0);
    subject.types[type]=(subject.types[type]||0)+1;
    bySubject[materia]=subject;
  }
  Object.values(byType).forEach(item=>delete item.totalSeverity);
  return {
    total:(Array.isArray(findings)?findings:[]).length,
    byType:Object.values(byType).sort((a,b)=>b.count-a.count||b.maxSeverity-a.maxSeverity),
    bySubject:Object.values(bySubject).sort((a,b)=>b.maxSeverity-a.maxSeverity||b.count-a.count)
  };
}

function recurringErrors(profile={}){
  return analyzeProfile(profile).map(item=>({
    topicId:item.topicId,
    materia:item.materia,
    assunto:item.assunto,
    type:item.type,
    label:item.label,
    severity:item.severity,
    reason:item.reason,
    metrics:item.metrics
  }));
}

global.AppErrorIntelligence=Object.freeze({
  schemaVersion:SCHEMA_VERSION,
  types:{...TYPES},
  classifyTopic,
  analyzeProfile,
  aggregate,
  recurringErrors
});
})(window);

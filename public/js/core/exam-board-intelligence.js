(function installExamBoardIntelligence(global){
'use strict';
if(global.AppExamBoardIntelligence)return;

const SCHEMA_VERSION=1;
const STORAGE_PREFIX='app_exam_board_intelligence_v1';
const safe=(value,max=360)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const finite=value=>value==null||value===''?null:(Number.isFinite(Number(value))?Number(value):null);
const keyText=value=>safe(value,400).toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();

const BOARD_ALIASES=Object.freeze({
  'fcc':'FCC',
  'fundacao carlos chagas':'FCC',
  'cebraspe':'CEBRASPE',
  'cespe':'CEBRASPE',
  'cespe cebraspe':'CEBRASPE',
  'fgv':'FGV',
  'fundacao getulio vargas':'FGV',
  'vunesp':'VUNESP',
  'fundacao vunesp':'VUNESP',
  'aocp':'AOCP',
  'instituto aocp':'AOCP',
  'idecan':'IDECAN'
});

function normalizeBoardName(value){
  const raw=safe(value,120);
  if(!raw)return '';
  return BOARD_ALIASES[keyText(raw)]||raw.toUpperCase();
}

function storageKey(contest){
  const normalized=keyText(contest)||'default';
  return `${STORAGE_PREFIX}::${normalized}`;
}

function normalizeSource(source={}){
  const title=safe(source.title||source.name,240);
  const type=safe(source.type||'manual',80);
  const asOf=safe(source.asOf||source.date,40);
  const url=safe(source.url,640);
  if(!title)throw new Error('Board Intelligence requer uma fonte identificável (source.title).');
  return Object.freeze({title,type,asOf,url});
}

function normalizeTopic(item={}){
  const materia=safe(item.materia||item.subject,180);
  const assunto=safe(item.assunto||item.topic,400);
  if(!materia||!assunto)return null;
  const questions=Math.max(0,Math.round(finite(item.questions)??finite(item.sampleSize)??0));
  const years=Math.max(0,Math.round(finite(item.years)??0));
  const explicitPriority=finite(item.priority??item.weight??item.incidence);
  return {
    materia,
    assunto,
    key:`${keyText(materia)}::${keyText(assunto)}`,
    questions,
    years,
    explicitPriority:explicitPriority==null?null:clamp(explicitPriority,0,100)
  };
}

function computeConfidence(topic){
  const samplePart=clamp(topic.questions/30,0,1)*70;
  const yearsPart=clamp(topic.years/4,0,1)*30;
  return Math.round(clamp(samplePart+yearsPart,0,100));
}

function buildSnapshot(input={}){
  const contest=safe(input.contest,180);
  const board=normalizeBoardName(input.board);
  if(!contest)throw new Error('Board Intelligence requer o concurso/escopo do snapshot.');
  if(!board)throw new Error('Board Intelligence requer a banca examinadora.');
  const source=normalizeSource(input.source||{});
  const topics=(Array.isArray(input.topics)?input.topics:[]).map(normalizeTopic).filter(Boolean);
  if(!topics.length)throw new Error('Board Intelligence requer ao menos um tópico com matéria e assunto.');

  const maxQuestions=Math.max(1,...topics.map(item=>item.questions));
  const normalizedTopics={};
  for(const topic of topics){
    const derived=topic.questions>0?Math.round(clamp((topic.questions/maxQuestions)*100,0,100)):50;
    const priority=topic.explicitPriority==null?derived:Math.round(topic.explicitPriority);
    normalizedTopics[topic.key]=Object.freeze({
      materia:topic.materia,
      assunto:topic.assunto,
      priority,
      confidence:computeConfidence(topic),
      questions:topic.questions,
      years:topic.years
    });
  }

  return Object.freeze({
    schemaVersion:SCHEMA_VERSION,
    contest,
    board,
    generatedAt:new Date(input.generatedAt||Date.now()).toISOString(),
    source,
    topics:normalizedTopics
  });
}

function saveSnapshot(snapshot){
  if(!snapshot?.contest||!snapshot?.board||!snapshot?.topics)throw new Error('Snapshot de banca inválido.');
  try{
    global.localStorage?.setItem(storageKey(snapshot.contest),JSON.stringify(snapshot));
  }catch(error){
    throw new Error(`Não foi possível persistir Board Intelligence: ${error?.message||error}`);
  }
  global.dispatchEvent?.(new CustomEvent('app:exam-board-intelligence-updated',{detail:{contest:snapshot.contest,board:snapshot.board,source:snapshot.source}}));
  return snapshot;
}

function ingest(input={}){
  return saveSnapshot(buildSnapshot(input));
}

function readForContest(contest){
  try{
    const raw=global.localStorage?.getItem(storageKey(contest));
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    if(Number(parsed?.schemaVersion)!==SCHEMA_VERSION||!parsed?.topics)return null;
    return parsed;
  }catch(_){return null;}
}

function signalForTopic(contest,materia,assunto){
  const snapshot=readForContest(contest);
  if(!snapshot)return null;
  const key=`${keyText(materia)}::${keyText(assunto)}`;
  const topic=snapshot.topics?.[key];
  if(!topic)return null;
  return Object.freeze({
    board:snapshot.board,
    priority:clamp(topic.priority,0,100),
    confidence:clamp(topic.confidence,0,100),
    questions:Math.max(0,Number(topic.questions)||0),
    years:Math.max(0,Number(topic.years)||0),
    source:snapshot.source,
    asOf:snapshot.source?.asOf||null
  });
}

function clear(contest){
  try{global.localStorage?.removeItem(storageKey(contest));}catch(_){}
}

global.AppExamBoardIntelligence=Object.freeze({
  schemaVersion:SCHEMA_VERSION,
  normalizeBoardName,
  buildSnapshot,
  ingest,
  saveSnapshot,
  readForContest,
  signalForTopic,
  clear
});
})(window);

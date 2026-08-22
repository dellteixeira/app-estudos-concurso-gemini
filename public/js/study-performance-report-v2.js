(function(global){
'use strict';

const PERIODS=[7,30,60,90];
const PAGE_W=595, PAGE_H=842, MX=44, TOP=795, BOTTOM=42;
const FALLBACK_COLORS=['#3b82f6','#22c55e','#c084fc','#f97316','#ec4899','#8b5cf6','#06b6d4','#eab308'];
const $=id=>document.getElementById(id);
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const round=v=>Math.round(num(v));

function safeName(value){return String(value||'relatorio').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,110)||'relatorio';}
function fmtHours(minutes){const m=Math.max(0,Math.round(num(minutes)));const h=Math.floor(m/60),r=m%60;return h?`${h}h ${String(r).padStart(2,'0')}min`:`${r}min`;}
function fmtPct(value){return `${Math.round(clamp(num(value),0,100))}%`;}
function getPalette(){try{return Array.isArray(PALETA_SOLIDAS)&&PALETA_SOLIDAS.length?PALETA_SOLIDAS:FALLBACK_COLORS;}catch(_){return FALLBACK_COLORS;}}
function questionTotals(session){const total=num(session?.questionTotal||session?.questionPerformance?.total);const correct=num(session?.questionCorrect||session?.questionPerformance?.correct);return {total,correct:Math.min(total,num(session?.questionCorrect||session?.questionPerformance?.correct))};}
function topicKey(materia,assunto){return `${String(materia||'').trim()}\u241f${String(assunto||'').trim()}`;}
function sessionTime(session){
  const candidates=[session?.createdAt,session?.completedAt,session?.dateKey,session?.scheduledDateKey];
  for(const raw of candidates){if(!raw)continue;const d=new Date(String(raw).length===10?`${raw}T12:00:00`:raw);if(Number.isFinite(d.getTime()))return d.getTime();}
  return NaN;
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1800);}

function rebuildSummaryForSubjects(data,subjects){
  const totalMinutes=subjects.reduce((s,m)=>s+num(m.minutes),0);
  const totalQuestions=subjects.reduce((s,m)=>s+num(m.questions),0);
  const totalCorrect=subjects.reduce((s,m)=>s+num(m.correct),0);
  const totalTopics=subjects.reduce((s,m)=>s+num(m.totalTopics),0);
  const progress=totalTopics?subjects.reduce((s,m)=>s+num(m.progress)*num(m.totalTopics),0)/totalTopics:0;
  const rows=(data.diag?.rows||[]).filter(r=>subjects.some(m=>m.name===r?.state?.materia));
  const avg=rows.length?rows.reduce((s,r)=>s+num(r.retention),0)/rows.length:null;
  return {progress,totalMinutes,totalQuestions,totalCorrect,accuracy:totalQuestions?totalCorrect/totalQuestions*100:null,retention:avg,risk:(data.diag?.risk||[]).filter(r=>subjects.some(m=>m.name===r?.state?.materia)).length,overdue:(data.diag?.overdue||[]).filter(r=>subjects.some(m=>m.name===r?.state?.materia)).length,mastered:(data.diag?.mastered||[]).filter(r=>subjects.some(m=>m.name===r?.state?.materia)).length,totalTopics};
}

function buildSubjectReportData(materia){
  const base=global.StudyPerformanceReport.collectReportData();
  const subjects=base.subjects.filter(m=>m.name===materia);
  if(!subjects.length)return null;
  const filterRows=rows=>(rows||[]).filter(r=>r?.state?.materia===materia);
  const diag={rows:filterRows(base.diag?.rows),risk:filterRows(base.diag?.risk),overdue:filterRows(base.diag?.overdue),mastered:filterRows(base.diag?.mastered)};
  diag.avg=diag.rows.length?diag.rows.reduce((s,r)=>s+num(r.retention),0)/diag.rows.length:null;
  return {...base,subjects,diag,summary:rebuildSummaryForSubjects({...base,diag},subjects),contestName:`${base.contestName} · ${materia}`};
}

function collectWindowStats(sessions,items,days,now=Date.now()){
  const dayMs=86400000;
  const start=now-days*dayMs;
  const prevStart=now-days*2*dayMs;
  const summarize=(from,to)=>{
    const set=sessions.filter(s=>{const t=sessionTime(s);return Number.isFinite(t)&&t>=from&&t<to;});
    let minutes=0,questions=0,correct=0,revisions=0;
    const topics=new Set();
    const matterMinutes=new Map();
    set.forEach(s=>{const mins=Math.max(0,num(s.minutes));minutes+=mins;if(s.isRevision)revisions++;const q=questionTotals(s);questions+=q.total;correct+=q.correct;const materia=String(s.materia||'').trim();const assunto=String(s.assunto||'').trim();if(materia||assunto)topics.add(topicKey(materia,assunto));if(materia)matterMinutes.set(materia,(matterMinutes.get(materia)||0)+mins);});
    const validItemKeys=new Set(items.map(i=>topicKey(i?.materia,i?.assunto)));
    const covered=[...topics].filter(k=>validItemKeys.has(k)).length;
    const totalTopics=validItemKeys.size;
    return {minutes,questions,correct,revisions,topics:topics.size,covered,totalTopics,coverage:totalTopics?covered/totalTopics*100:0,accuracy:questions?correct/questions*100:null,matters:[...matterMinutes.entries()].map(([name,minutes])=>({name,minutes})).sort((a,b)=>b.minutes-a.minutes)};
  };
  const current=summarize(start,now+1);
  const previous=summarize(prevStart,start);
  const delta=(a,b)=>b?((a-b)/Math.abs(b))*100:(a?100:0);
  return {days,current,previous,delta:{minutes:delta(current.minutes,previous.minutes),questions:delta(current.questions,previous.questions),revisions:delta(current.revisions,previous.revisions),coverage:current.coverage-previous.coverage,accuracy:(current.accuracy==null||previous.accuracy==null)?null:current.accuracy-previous.accuracy}};
}

function collectComparisonData(){
  let contest={};let items=[];let diag={avg:null,risk:[],overdue:[],mastered:[]};
  try{contest=getConcursosMetadata()?.[currentConcurso]||{};}catch(_){}
  try{items=Array.isArray(editalItems)?editalItems:[];}catch(_){}
  try{diag=typeof buildRetentionDiagnostics==='function'?buildRetentionDiagnostics():diag;}catch(_){}
  const sessions=Array.isArray(contest.studySessions)?contest.studySessions:[];
  const now=Date.now();
  return {contestName:String(currentConcurso||'Concurso'),generatedAt:new Date(now),windows:PERIODS.map(days=>collectWindowStats(sessions,items,days,now)),diag};
}

function normalizePdfChar(ch){const map={'–':'-','—':'-','“':'"','”':'"','‘':"'",'’':"'",'…':'...','•':'-','→':'->','←':'<-'};if(map[ch]!=null)return map[ch];return ch.charCodeAt(0)<=255?ch:'?';}
function pdfText(v){return [...String(v??'')].map(normalizePdfChar).join('').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
function latin1(str){const out=new Uint8Array(str.length);for(let i=0;i<str.length;i++)out[i]=str.charCodeAt(i)&255;return out;}
function hexRgb(hex){const m=String(hex||'').match(/^#?([0-9a-f]{6})$/i);if(!m)return [0.1,0.15,0.22];const n=parseInt(m[1],16);return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255];}
function rgb(hex){return hexRgb(hex).map(v=>v.toFixed(3)).join(' ');}
function estimate(text,size=10){let u=0;for(const ch of String(text||'')){if(/[MW@#%&]/.test(ch))u+=.88;else if(/[ilI1.,:;'|!]/.test(ch))u+=.28;else if(/\s/.test(ch))u+=.3;else u+=.53;}return u*size;}
function wrap(text,size=10,width=500){const words=String(text||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);const lines=[];let line='';for(const word of words){const candidate=line?`${line} ${word}`:word;if(!line||estimate(candidate,size)<=width)line=candidate;else{lines.push(line);line=word;}}if(line)lines.push(line);return lines.length?lines:[''];}
function page(){return {cmd:[],cursor:TOP};}
function text(p,x,y,value,size=10,bold=false,color='#17202b'){p.cmd.push(`BT /${bold?'F2':'F1'} ${size.toFixed(2)} Tf ${rgb(color)} rg ${x.toFixed(1)} ${y.toFixed(1)} Td (${pdfText(value)}) Tj ET`);}
function rect(p,x,y,w,h,color){p.cmd.push(`${rgb(color)} rg ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);}
function line(p,x1,y1,x2,y2,color='#dbe4ea',width=.7){p.cmd.push(`${rgb(color)} RG ${width} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);}
function addHeader(p,title,subtitle=''){text(p,MX,806,title,16,true,'#0d2b3d');if(subtitle)text(p,MX,788,subtitle,8.5,false,'#6c7b87');line(p,MX,778,PAGE_W-MX,778,'#35b9b3',1.3);p.cursor=758;}
function addFooter(p,pageNo,total,contest){line(p,MX,31,PAGE_W-MX,31,'#dce5eb',.5);text(p,MX,19,contest,7.3,false,'#7b8995');text(p,PAGE_W-MX-70,19,`Página ${pageNo}/${total}`,7.3,false,'#7b8995');}
function trend(value,suffix='%'){const n=num(value);const sign=n>0?'+':'';return `${sign}${Math.round(n)}${suffix}`;}
function metricCard(p,x,y,w,label,value,sub=''){rect(p,x,y,w,56,'#f2f6f8');text(p,x+10,y+38,label,7.5,false,'#647582');text(p,x+10,y+19,value,15,true,'#0d2b3d');if(sub)text(p,x+w-58,y+20,sub,7.2,true,sub.startsWith('-')?'#d94c63':'#16877f');}

function comparisonSummaryPage(data){const p=page();addHeader(p,'Comparativo de Evolução',`${data.contestName} · 7, 30, 60 e 90 dias`);text(p,MX,p.cursor,'Evolução por janelas móveis',14,true,'#0d2b3d');p.cursor-=24;
  const latest=data.windows[0];const currentRetention=data.diag?.avg==null?'—':fmtPct(data.diag.avg);
  const cards=[['Retenção atual',currentRetention,''],['Em risco',String((data.diag?.risk||[]).length),''],['Revisões vencidas',String((data.diag?.overdue||[]).length),'']];
  cards.forEach((c,i)=>metricCard(p,MX+i*165,p.cursor-56,155,c[0],c[1],c[2]));p.cursor-=78;
  text(p,MX,p.cursor,'Leitura metodológica',11,true,'#0d2b3d');p.cursor-=17;
  const notes=['Cada janela usa somente sessões efetivamente registradas no histórico do aplicativo.','Cobertura = quantidade de assuntos do edital tocados no período, não um progresso histórico reconstruído.','A variação compara cada janela com o período imediatamente anterior de igual duração. Retenção e risco são exibidos como estado atual, pois o app não guarda snapshots históricos dessas métricas.'];
  notes.forEach(n=>{wrap(n,8.7,PAGE_W-MX*2).forEach(ln=>{text(p,MX,p.cursor,ln,8.7,false,'#40515d');p.cursor-=12;});p.cursor-=4;});
  p.cursor-=8;text(p,MX,p.cursor,`Gerado em ${data.generatedAt.toLocaleString('pt-BR')}`,8,false,'#7b8995');return p;}

function comparisonChartPage(data){const p=page();addHeader(p,'Comparativo de atividade','Últimos 7, 30, 60 e 90 dias');const palette=getPalette();const left=70,right=PAGE_W-45,base=445,h=245;
  const maxMinutes=Math.max(1,...data.windows.map(w=>w.current.minutes));[0,.25,.5,.75,1].forEach(r=>{const y=base+h*r;line(p,left,y,right,y,'#d9e3e9',.5);text(p,45,y-3,fmtHours(maxMinutes*r),7,false,'#71808c');});
  const slot=(right-left)/data.windows.length;data.windows.forEach((w,i)=>{const bh=h*w.current.minutes/maxMinutes;const bw=48;const x=left+i*slot+(slot-bw)/2;rect(p,x,base,bw,bh,palette[i%palette.length]);text(p,x+4,base+bh+8,fmtHours(w.current.minutes),7.5,true,palette[i%palette.length]);text(p,x+8,base-18,`${w.days} dias`,8,true,'#344550');});
  p.cursor=405;text(p,MX,p.cursor,'Indicadores por janela',11,true,'#0d2b3d');p.cursor-=18;
  data.windows.forEach((w,i)=>{const c=w.current;const lineText=`${w.days} dias · ${fmtHours(c.minutes)} · ${round(c.questions)} questões · ${round(c.correct)} acertos · ${c.accuracy==null?'—':fmtPct(c.accuracy)} acurácia · ${c.revisions} revisões · ${fmtPct(c.coverage)} cobertura`;rect(p,MX,p.cursor-5,8,8,palette[i%palette.length]);wrap(lineText,8.1,PAGE_W-MX*2-16).forEach(ln=>{text(p,MX+15,p.cursor,ln,8.1,false,'#30404c');p.cursor-=11;});p.cursor-=6;});return p;}

function comparisonDetailPages(data){const pages=[];const palette=getPalette();data.windows.forEach((w,index)=>{const p=page();addHeader(p,`Últimos ${w.days} dias`,`Comparação com os ${w.days} dias imediatamente anteriores`);const c=w.current,d=w.delta;
  const metrics=[['Tempo',fmtHours(c.minutes),trend(d.minutes)],['Questões',String(round(c.questions)),trend(d.questions)],['Acertos',String(round(c.correct)),c.questions?fmtPct(c.accuracy):'—'],['Revisões',String(c.revisions),trend(d.revisions)],['Assuntos estudados',String(c.topics),''],['Cobertura',fmtPct(c.coverage),trend(d.coverage,' p.p.')]];
  metrics.forEach((m,i)=>{const col=i%3,row=Math.floor(i/3);metricCard(p,MX+col*165,p.cursor-row*72-56,155,m[0],m[1],m[2]);});p.cursor-=2*72+10;
  text(p,MX,p.cursor,'Matérias mais estudadas no período',11,true,'#0d2b3d');p.cursor-=18;if(!c.matters.length){text(p,MX,p.cursor,'Nenhuma sessão registrada nesta janela.',8.5,false,'#75838e');}else c.matters.slice(0,10).forEach((m,i)=>{rect(p,MX,p.cursor-6,7,7,palette[i%palette.length]);const label=`${i+1}. ${m.name}`;text(p,MX+14,p.cursor,label,8.5,i<3,'#30404c');text(p,PAGE_W-MX-72,p.cursor,fmtHours(m.minutes),8.5,true,palette[i%palette.length]);p.cursor-=14;});
  p.cursor-=10;text(p,MX,p.cursor,'Variação contra o período anterior',11,true,'#0d2b3d');p.cursor-=18;const accuracyTrend=d.accuracy==null?'sem base comparável':trend(d.accuracy,' p.p.');const comparison=`Tempo ${trend(d.minutes)} · Questões ${trend(d.questions)} · Revisões ${trend(d.revisions)} · Cobertura ${trend(d.coverage,' p.p.')} · Acurácia ${accuracyTrend}`;wrap(comparison,8.5,PAGE_W-MX*2).forEach(ln=>{text(p,MX,p.cursor,ln,8.5,false,'#40515d');p.cursor-=12;});pages.push(p);});return pages;}

function buildComparisonPdf(data){const pages=[comparisonSummaryPage(data),comparisonChartPage(data),...comparisonDetailPages(data)];pages.forEach((p,i)=>addFooter(p,i+1,pages.length,data.contestName));const objects=[];objects[1]='<< /Type /Catalog /Pages 2 0 R >>';const pageIds=[],contentIds=[];for(let i=0;i<pages.length;i++){pageIds.push(5+i*2);contentIds.push(6+i*2);}objects[2]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';pages.forEach((p,i)=>{const stream=latin1(p.cmd.join('\n'));objects[pageIds[i]]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentIds[i]} 0 R >>`;objects[contentIds[i]]={stream};});const max=Math.max(...Object.keys(objects).map(Number));const chunks=[];let offset=0;const add=s=>{const b=latin1(s);chunks.push(b);offset+=b.length;};add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');const offsets=new Array(max+1).fill(0);for(let id=1;id<=max;id++){offsets[id]=offset;add(`${id} 0 obj\n`);const o=objects[id];if(o?.stream){add(`<< /Length ${o.stream.length} >>\nstream\n`);chunks.push(o.stream);offset+=o.stream.length;add('\nendstream\n');}else add(String(o||'<<>>')+'\n');add('endobj\n');}const xref=offset;add(`xref\n0 ${max+1}\n0000000000 65535 f \n`);for(let id=1;id<=max;id++)add(`${String(offsets[id]).padStart(10,'0')} 00000 n \n`);add(`trailer\n<< /Size ${max+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);const total=chunks.reduce((s,c)=>s+c.length,0);const out=new Uint8Array(total);let pos=0;chunks.forEach(c=>{out.set(c,pos);pos+=c.length;});return new Blob([out],{type:'application/pdf'});}

function matterNames(){try{return [...new Set((editalItems||[]).map(i=>String(i?.materia||'Geral').trim()).filter(Boolean))];}catch(_){return [];}}
function syncModeUi(){const mode=document.querySelector('input[name="studyReportMode"]:checked')?.value||'complete';const subject=$('studyReportSubjectField');if(subject)subject.hidden=mode!=='subject';}
function closeModal(){const modal=$('studyReportModeModal');if(modal)modal.classList.remove('open');}
function openModal(){const modal=$('studyReportModeModal');const select=$('studyReportSubjectSelect');if(!modal)return;if(select){const current=select.value;const names=matterNames();select.innerHTML=names.map(n=>`<option value="${String(n).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}">${n.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</option>`).join('');if(names.includes(current))select.value=current;}syncModeUi();modal.classList.add('open');}

async function generateSelectedReport(){const mode=document.querySelector('input[name="studyReportMode"]:checked')?.value||'complete';const action=$('studyReportGenerateButton');if(action){action.disabled=true;action.textContent='Gerando…';}try{
  if(mode==='complete'){closeModal();return await global.StudyPerformanceReport.exportPdf();}
  if(mode==='subject'){const materia=$('studyReportSubjectSelect')?.value;const data=buildSubjectReportData(materia);if(!data){if(typeof appNotice==='function')await appNotice('Selecione uma matéria válida para exportar.',{title:'Relatório por matéria'});return;}const blob=global.StudyPerformanceReport.buildPdf(data);downloadBlob(blob,`${safeName(data.contestName)}_relatorio_materia_${new Date().toISOString().slice(0,10)}.pdf`);closeModal();return;}
  const data=collectComparisonData();const hasActivity=data.windows.some(w=>w.current.minutes||w.current.questions||w.current.revisions);if(!hasActivity&&typeof appNotice==='function')await appNotice('Não há sessões registradas nos últimos 90 dias. O comparativo será gerado mesmo assim com valores zerados.',{title:'Comparativo de evolução'});const blob=buildComparisonPdf(data);downloadBlob(blob,`${safeName(data.contestName)}_comparativo_7_30_60_90_dias_${new Date().toISOString().slice(0,10)}.pdf`);closeModal();
 }catch(error){console.error('[Study report v2]',error);if(typeof appNotice==='function')await appNotice(`Não foi possível gerar o relatório: ${error.message}`,{title:'Falha na exportação'});else alert(error.message);}finally{if(action){action.disabled=false;action.textContent='Gerar PDF';}}}

function modalHtml(){return `<div id="studyReportModeModal" class="study-report-modal" role="dialog" aria-modal="true" aria-labelledby="studyReportModeTitle"><div class="study-report-dialog"><div class="study-report-head"><div><strong id="studyReportModeTitle">Exportar dados de estudo</strong><span>Escolha o tipo de relatório.</span></div><button type="button" class="study-report-close" aria-label="Fechar">×</button></div><div class="study-report-options"><label class="study-report-option"><input type="radio" name="studyReportMode" value="complete" checked><span><strong>Relatório completo</strong><small>Gráfico por matéria, desempenho detalhado e Retenção e Diagnóstico.</small></span></label><label class="study-report-option"><input type="radio" name="studyReportMode" value="subject"><span><strong>Somente matéria selecionada</strong><small>Gera o mesmo diagnóstico, restrito a uma disciplina.</small></span></label><label class="study-report-option"><input type="radio" name="studyReportMode" value="comparison"><span><strong>Comparativo de evolução</strong><small>Compara 7, 30, 60 e 90 dias com os períodos anteriores equivalentes.</small></span></label></div><div id="studyReportSubjectField" class="study-report-subject" hidden><label for="studyReportSubjectSelect">Matéria</label><select id="studyReportSubjectSelect"></select></div><div class="study-report-method"><strong>Comparativo confiável</strong><span>Usa sessões reais. “Cobertura” indica assuntos tocados no período; o app não reconstrói artificialmente progresso histórico.</span></div><div class="study-report-actions-modal"><button type="button" class="btn btn-secondary study-report-cancel">Cancelar</button><button id="studyReportGenerateButton" type="button" class="btn btn-primary">Gerar PDF</button></div></div></div>`;}
function addStyles(){if($('studyPerformanceReportV2Styles'))return;const s=document.createElement('style');s.id='studyPerformanceReportV2Styles';s.textContent=`.study-report-modal{position:fixed;inset:0;z-index:10050;background:rgba(2,10,18,.72);display:none;align-items:center;justify-content:center;padding:18px}.study-report-modal.open{display:flex}.study-report-dialog{width:min(680px,100%);max-height:min(88vh,780px);overflow:auto;background:var(--modern-surface,#0c1d2b);border:1px solid rgba(85,214,207,.28);border-radius:20px;padding:20px;box-shadow:0 24px 80px rgba(0,0,0,.35)}.study-report-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.study-report-head strong{display:block;font-size:1.05rem}.study-report-head span{display:block;margin-top:4px;color:var(--modern-muted,#94a3b8);font-size:.82rem}.study-report-close{border:0;background:transparent;color:inherit;font-size:1.7rem;line-height:1;cursor:pointer}.study-report-options{display:grid;gap:10px;margin:18px 0}.study-report-option{display:flex;gap:11px;align-items:flex-start;padding:13px;border:1px solid rgba(148,163,184,.2);border-radius:14px;cursor:pointer;background:rgba(255,255,255,.025)}.study-report-option:has(input:checked){border-color:#55d6cf;background:rgba(85,214,207,.08)}.study-report-option input{margin-top:4px}.study-report-option strong,.study-report-option small{display:block}.study-report-option small{margin-top:4px;color:var(--modern-muted,#94a3b8);line-height:1.4}.study-report-subject{margin:12px 0}.study-report-subject label{display:block;font-size:.8rem;font-weight:700;margin-bottom:6px}.study-report-subject select{width:100%;min-height:44px}.study-report-method{padding:12px 14px;border-radius:12px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.18);font-size:.78rem;line-height:1.45}.study-report-method strong,.study-report-method span{display:block}.study-report-method span{margin-top:3px;color:var(--modern-muted,#94a3b8)}.study-report-actions-modal{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.retention-export-report-btn.has-menu::after{content:' ▾';font-size:.75em}@media(max-width:600px){.study-report-modal{padding:10px;align-items:flex-end}.study-report-dialog{border-radius:18px 18px 10px 10px;padding:16px;max-height:90vh}.study-report-actions-modal{display:grid;grid-template-columns:1fr 1fr}.study-report-actions-modal .btn{width:100%;min-height:46px}}@media(max-width:390px){.study-report-actions-modal{grid-template-columns:1fr}}`;document.head.appendChild(s);}

function install(){if(!global.StudyPerformanceReport)return false;addStyles();if(!$('studyReportModeModal')){document.body.insertAdjacentHTML('beforeend',modalHtml());document.querySelectorAll('input[name="studyReportMode"]').forEach(r=>r.addEventListener('change',syncModeUi));$('studyReportModeModal')?.addEventListener('click',e=>{if(e.target===$('studyReportModeModal'))closeModal();});document.querySelector('.study-report-close')?.addEventListener('click',closeModal);document.querySelector('.study-report-cancel')?.addEventListener('click',closeModal);$('studyReportGenerateButton')?.addEventListener('click',generateSelectedReport);}
  const old=$('retentionExportReportButton');if(!old)return false;if(old.dataset.reportV2==='1')return true;const b=old.cloneNode(true);b.dataset.reportV2='1';b.classList.add('has-menu');b.title='Escolher tipo de relatório de desempenho';b.replaceWith(b);b.addEventListener('click',openModal);return true;}
function boot(){if(!install())setTimeout(boot,180);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,120));else setTimeout(boot,120);global.addEventListener('load',()=>setTimeout(boot,220));

global.StudyPerformanceReportV2=Object.freeze({collectComparisonData,buildComparisonPdf,buildSubjectReportData,openModal,generateSelectedReport,install});
})(window);

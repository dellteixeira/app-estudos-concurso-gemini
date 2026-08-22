(function(global){
'use strict';

const PAGE_W=595, PAGE_H=842, MX=44, TOP=795, BOTTOM=42;
const FALLBACK_COLORS=['#3b82f6','#22c55e','#c084fc','#f97316','#ec4899','#8b5cf6','#06b6d4','#eab308'];
const $=id=>document.getElementById(id);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const round=v=>Math.round(num(v));

function safeName(value){return String(value||'relatorio').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,110)||'relatorio';}
function normalizePdfChar(ch){const map={'–':'-','—':'-','“':'"','”':'"','‘':"'",'’':"'",'…':'...','•':'-','→':'->','←':'<-','€':'EUR'};if(map[ch]!=null)return map[ch];return ch.charCodeAt(0)<=255?ch:'?';}
function pdfText(v){return [...String(v??'')].map(normalizePdfChar).join('').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
function latin1(str){const out=new Uint8Array(str.length);for(let i=0;i<str.length;i++)out[i]=str.charCodeAt(i)&255;return out;}
function hexRgb(hex){const m=String(hex||'').match(/^#?([0-9a-f]{6})$/i);if(!m)return [0.1,0.15,0.22];const n=parseInt(m[1],16);return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255];}
function rgb(hex){return hexRgb(hex).map(v=>v.toFixed(3)).join(' ');}
function estimate(text,size=10){let u=0;for(const ch of String(text||'')){if(/[MW@#%&]/.test(ch))u+=.88;else if(/[ilI1.,:;'|!]/.test(ch))u+=.28;else if(/\s/.test(ch))u+=.3;else u+=.53;}return u*size;}
function wrap(text,size=10,width=500){const words=String(text||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);const lines=[];let line='';for(const word of words){const test=line?`${line} ${word}`:word;if(!line||estimate(test,size)<=width)line=test;else{lines.push(line);line=word;}}if(line)lines.push(line);return lines.length?lines:[''];}
function fmtHours(minutes){const m=Math.max(0,Math.round(num(minutes)));const h=Math.floor(m/60),r=m%60;return h?`${h}h ${String(r).padStart(2,'0')}min`:`${r}min`;}
function fmtPct(value){return `${Math.round(clamp(num(value),0,100))}%`;}

function getPalette(){try{return Array.isArray(PALETA_SOLIDAS)&&PALETA_SOLIDAS.length?PALETA_SOLIDAS:FALLBACK_COLORS;}catch(_){return FALLBACK_COLORS;}}
function getContest(){try{return getConcursosMetadata()?.[currentConcurso]||{};}catch(_){return {};}}
function getItems(){try{return Array.isArray(editalItems)?editalItems:[];}catch(_){return [];}}
function getDiagnostics(){try{return typeof buildRetentionDiagnostics==='function'?buildRetentionDiagnostics():{rows:[],avg:null,risk:[],overdue:[],mastered:[]};}catch(_){return {rows:[],avg:null,risk:[],overdue:[],mastered:[]};}}
function topicFraction(item){try{return clamp(num(getContentAcquisitionState(item)?.fraction),0,1);}catch(_){return item?.teoria||item?.videoaula?1:0;}}
function questionTotals(session){const total=num(session?.questionTotal||session?.questionPerformance?.total);const correct=num(session?.questionCorrect||session?.questionPerformance?.correct);return {total,correct};}

function collectReportData(){
  const contest=getContest();
  const items=getItems();
  const sessions=Array.isArray(contest.studySessions)?contest.studySessions:[];
  const diag=getDiagnostics();
  const palette=getPalette();
  const matterNames=[...new Set(items.map(i=>String(i?.materia||'Geral').trim()).filter(Boolean))];
  const byMatter=new Map();
  matterNames.forEach((name,index)=>byMatter.set(name,{name,color:palette[index%palette.length],topics:[],minutes:0,revisions:0,questions:0,correct:0,topicMinutes:new Map(),retentionRows:[]}));
  items.forEach(item=>{const name=String(item?.materia||'Geral').trim()||'Geral';if(!byMatter.has(name))byMatter.set(name,{name,color:palette[byMatter.size%palette.length],topics:[],minutes:0,revisions:0,questions:0,correct:0,topicMinutes:new Map(),retentionRows:[]});byMatter.get(name).topics.push(item);});
  sessions.forEach(s=>{const name=String(s?.materia||'').trim();if(!name||!byMatter.has(name))return;const m=byMatter.get(name);const mins=Math.max(0,num(s?.minutes));m.minutes+=mins;if(s?.isRevision)m.revisions+=1;const q=questionTotals(s);m.questions+=q.total;m.correct+=Math.min(q.total,q.correct);const assunto=String(s?.assunto||'Sem assunto').trim()||'Sem assunto';m.topicMinutes.set(assunto,(m.topicMinutes.get(assunto)||0)+mins);});
  (diag.rows||[]).forEach(row=>{const name=String(row?.state?.materia||'').trim();if(byMatter.has(name))byMatter.get(name).retentionRows.push(row);});
  const subjects=[...byMatter.values()].map(m=>{
    const total=m.topics.length;
    const progress=total?m.topics.reduce((sum,item)=>sum+topicFraction(item),0)/total*100:0;
    const studied=m.topics.filter(i=>topicFraction(i)>=1).length;
    const rows=m.retentionRows;
    const retention=rows.length?rows.reduce((s,r)=>s+num(r.retention),0)/rows.length:null;
    const risk=rows.filter(r=>num(r.retention)<70||r.overdue||(Number.isFinite(Number(r.questionAccuracy))&&num(r.questionAccuracy)<60));
    const overdue=rows.filter(r=>r.overdue);
    const mastered=rows.filter(r=>num(r.retention)>=85&&!r.overdue&&(typeof hasRetentionMasteryEvidence!=='function'||hasRetentionMasteryEvidence(r.state)));
    const topTopics=[...m.topicMinutes.entries()].map(([name,minutes])=>({name,minutes})).sort((a,b)=>b.minutes-a.minutes).slice(0,6);
    const critical=[...risk].sort((a,b)=>num(b.riskScore)-num(a.riskScore)).slice(0,8);
    return {...m,totalTopics:total,studiedTopics:studied,progress,retention,riskCount:risk.length,overdueCount:overdue.length,masteredCount:mastered.length,accuracy:m.questions?m.correct/m.questions*100:null,topTopics,critical};
  });
  const totalMinutes=subjects.reduce((s,m)=>s+m.minutes,0);
  const totalQuestions=subjects.reduce((s,m)=>s+m.questions,0);
  const totalCorrect=subjects.reduce((s,m)=>s+m.correct,0);
  const totalTopics=subjects.reduce((s,m)=>s+m.totalTopics,0);
  const progress=totalTopics?subjects.reduce((s,m)=>s+m.progress*m.totalTopics,0)/totalTopics:0;
  return {contestName:String(currentConcurso||'Concurso'),generatedAt:new Date(),subjects,diag,summary:{progress,totalMinutes,totalQuestions,totalCorrect,accuracy:totalQuestions?totalCorrect/totalQuestions*100:null,retention:diag.avg,risk:(diag.risk||[]).length,overdue:(diag.overdue||[]).length,mastered:(diag.mastered||[]).length,totalTopics}};
}

function page(){return {cmd:[],cursor:TOP};}
function text(p,x,y,value,size=10,bold=false,color='#17202b'){p.cmd.push(`BT /${bold?'F2':'F1'} ${size.toFixed(2)} Tf ${rgb(color)} rg ${x.toFixed(1)} ${y.toFixed(1)} Td (${pdfText(value)}) Tj ET`);}
function rect(p,x,y,w,h,color){p.cmd.push(`${rgb(color)} rg ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);}
function line(p,x1,y1,x2,y2,color='#dbe4ea',width=.7){p.cmd.push(`${rgb(color)} RG ${width} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);}
function addWrapped(p,value,x,size=10,bold=false,color='#17202b',width=PAGE_W-MX*2,leading=null){const lines=wrap(value,size,width);const step=leading||Math.max(12,size*1.35);for(const ln of lines){if(p.cursor-step<BOTTOM) return false;text(p,x,p.cursor,ln,size,bold,color);p.cursor-=step;}return true;}
function addFooter(p,pageNo,total,contest){line(p,MX,31,PAGE_W-MX,31,'#dce5eb',.5);text(p,MX,19,contest,7.3,false,'#7b8995');text(p,PAGE_W-MX-70,19,`Página ${pageNo}/${total}`,7.3,false,'#7b8995');}
function addHeader(p,title,subtitle=''){text(p,MX,806,title,16,true,'#0d2b3d');if(subtitle)text(p,MX,788,subtitle,8.5,false,'#6c7b87');line(p,MX,778,PAGE_W-MX,778,'#35b9b3',1.3);p.cursor=758;}

function summaryPage(data){
  const p=page();addHeader(p,'Relatório de Desempenho',data.contestName);
  text(p,MX,p.cursor,'Resumo executivo',14,true,'#0d2b3d');p.cursor-=25;
  const cards=[['Progresso',fmtPct(data.summary.progress)],['Horas',fmtHours(data.summary.totalMinutes)],['Questões',String(round(data.summary.totalQuestions))],['Acertos',String(round(data.summary.totalCorrect))],['Acurácia',data.summary.accuracy==null?'—':fmtPct(data.summary.accuracy)],['Retenção',data.summary.retention==null?'—':fmtPct(data.summary.retention)],['Em risco',String(data.summary.risk)],['Vencidas',String(data.summary.overdue)],['Dominados',String(data.summary.mastered)]];
  const cw=155,ch=50,g=10;cards.forEach((c,i)=>{const col=i%3,row=Math.floor(i/3);const x=MX+col*(cw+g),y=p.cursor-row*(ch+g)-ch;rect(p,x,y,cw,ch,'#f2f6f8');text(p,x+10,y+31,c[0],8,false,'#647582');text(p,x+10,y+12,c[1],16,true,'#0d2b3d');});p.cursor-=3*(ch+g)+8;
  text(p,MX,p.cursor,'Como ler este relatório',12,true,'#0d2b3d');p.cursor-=18;
  addWrapped(p,'O percentual por matéria utiliza o mesmo estado de aquisição de conteúdo do aplicativo. Retenção, assuntos em risco, revisões vencidas e assuntos dominados são calculados a partir do mesmo diagnóstico exibido no painel Retenção e Diagnóstico.',MX,9.5,false,'#40515d');
  p.cursor-=14;text(p,MX,p.cursor,`Gerado em ${data.generatedAt.toLocaleString('pt-BR')}`,8,false,'#7b8995');
  return p;
}

function chartPages(data){
  const out=[];const chunks=[];for(let i=0;i<data.subjects.length;i+=8)chunks.push(data.subjects.slice(i,i+8));if(!chunks.length)chunks.push([]);
  chunks.forEach((chunk,ci)=>{const p=page();addHeader(p,'Progresso por matéria',chunks.length>1?`Gráfico ${ci+1} de ${chunks.length}`:'Percentual estudado por matéria');
    const left=70,right=PAGE_W-45,base=455,top=700,h=245;[0,25,50,75,100].forEach(v=>{const y=base+h*v/100;line(p,left,y,right,y,'#d9e3e9',.5);text(p,48,y-3,String(v),7.5,false,'#71808c');});
    const slot=(right-left)/Math.max(1,chunk.length);chunk.forEach((m,i)=>{const bh=h*clamp(m.progress,0,100)/100;const bw=Math.min(34,slot*.55);const x=left+i*slot+(slot-bw)/2;rect(p,x,base,bw,bh,m.color);text(p,x+2,base+bh+8,fmtPct(m.progress),8,true,m.color);text(p,x+bw/2-2,base-16,String(ci*8+i+1),8,true,'#344550');});
    p.cursor=425;text(p,MX,p.cursor,'Legenda',10,true,'#0d2b3d');p.cursor-=16;chunk.forEach((m,i)=>{rect(p,MX,p.cursor-6,8,8,m.color);const label=`${ci*8+i+1}. ${m.name} — ${fmtPct(m.progress)} (${m.studiedTopics}/${m.totalTopics} assuntos concluídos)`;const lines=wrap(label,8.5,PAGE_W-MX*2-18);lines.forEach(ln=>{text(p,MX+16,p.cursor,ln,8.5,false,'#263642');p.cursor-=11;});p.cursor-=3;});out.push(p);});return out;
}

function metricRow(p,label,value,x,y,w=150){text(p,x,y,label,7.5,false,'#6d7c87');text(p,x,y-15,value,12,true,'#0d2b3d');line(p,x,y-21,x+w,y-21,'#e0e7eb',.5);}
function subjectPages(data){const pages=[];for(const m of data.subjects){let p=page();addHeader(p,m.name,`Progresso ${fmtPct(m.progress)} · ${m.studiedTopics}/${m.totalTopics} assuntos concluídos`);rect(p,MX,p.cursor-5,10,10,m.color);text(p,MX+18,p.cursor,`${fmtPct(m.progress)} estudado`,11,true,m.color);p.cursor-=34;
    const metrics=[['Horas totais',fmtHours(m.minutes)],['Questões',String(round(m.questions))],['Acertos',String(round(m.correct))],['Acurácia',m.accuracy==null?'—':fmtPct(m.accuracy)],['Revisões',String(m.revisions)],['Retenção média',m.retention==null?'—':fmtPct(m.retention)],['Assuntos em risco',String(m.riskCount)],['Revisões vencidas',String(m.overdueCount)],['Assuntos dominados',String(m.masteredCount)]];
    metrics.forEach((it,i)=>{const col=i%3,row=Math.floor(i/3);metricRow(p,it[0],it[1],MX+col*165,p.cursor-row*48,145);});p.cursor-=3*48+8;
    text(p,MX,p.cursor,'Assuntos mais estudados',11,true,'#0d2b3d');p.cursor-=17;if(!m.topTopics.length){text(p,MX,p.cursor,'Nenhuma sessão registrada nesta matéria.',8.5,false,'#75838e');p.cursor-=18;}else m.topTopics.forEach((t,i)=>{text(p,MX,p.cursor,`${i+1}. ${t.name}`,8.5,i===0,'#263642');text(p,PAGE_W-MX-70,p.cursor,fmtHours(t.minutes),8.5,true,m.color);p.cursor-=13;});
    p.cursor-=7;text(p,MX,p.cursor,'Pontos críticos da matéria',11,true,'#0d2b3d');p.cursor-=17;if(!m.critical.length){text(p,MX,p.cursor,'Nenhum ponto crítico identificado.',8.5,false,'#75838e');}else m.critical.forEach(r=>{const s=r.state||{};const status=r.overdue?`vencida${r.overdueDays?` há ${r.overdueDays}d`:''}`:'revisão no prazo';const acc=Number.isFinite(Number(r.questionAccuracy))?`${round(r.questionAccuracy)}%`:'—';const label=`${s.assunto||'Assunto'} · retenção ${round(r.retention)}% · questões ${acc} · ${status}`;const lines=wrap(label,8.2,PAGE_W-MX*2);if(p.cursor-lines.length*11<BOTTOM+15){pages.push(p);p=page();addHeader(p,`${m.name} — continuação`,'Pontos críticos');}lines.forEach(ln=>{text(p,MX,p.cursor,ln,8.2,false,'#344550');p.cursor-=11;});p.cursor-=3;});pages.push(p);}return pages;}

function diagnosticPages(data){const pages=[];const groups=[['Assuntos em risco',data.diag.risk||[]],['Revisões vencidas',data.diag.overdue||[]],['Assuntos dominados',data.diag.mastered||[]]];for(const [title,rows] of groups){let p=page();addHeader(p,`Retenção e Diagnóstico — ${title}`,`${rows.length} registro(s)`);if(!rows.length){text(p,MX,p.cursor,'Nenhum conteúdo nesta categoria.',9,false,'#71808c');pages.push(p);continue;}rows.forEach((r,i)=>{const s=r.state||{};const acc=Number.isFinite(Number(r.questionAccuracy))?`${round(r.questionAccuracy)}%`:'—';const next=r.nextAt instanceof Date&&Number.isFinite(r.nextAt.getTime())?r.nextAt.toLocaleDateString('pt-BR'):'—';const status=r.overdue?`vencida${r.overdueDays?` há ${r.overdueDays}d`:''}`:`próxima ${next}`;const label=`${i+1}. ${s.materia||'Matéria'} — ${s.assunto||'Assunto'} | retenção ${round(r.retention)}% | questões ${acc} | ${status}`;const lines=wrap(label,8.2,PAGE_W-MX*2);if(p.cursor-lines.length*11<BOTTOM+20){pages.push(p);p=page();addHeader(p,`Retenção e Diagnóstico — ${title}`,'continuação');}lines.forEach(ln=>{text(p,MX,p.cursor,ln,8.2,false,'#30404c');p.cursor-=11;});p.cursor-=4;});pages.push(p);}return pages;}

function buildPdf(data){const pages=[summaryPage(data),...chartPages(data),...subjectPages(data),...diagnosticPages(data)];pages.forEach((p,i)=>addFooter(p,i+1,pages.length,data.contestName));const objects=[];objects[1]='<< /Type /Catalog /Pages 2 0 R >>';const pageIds=[],contentIds=[];for(let i=0;i<pages.length;i++){pageIds.push(5+i*2);contentIds.push(6+i*2);}objects[2]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';pages.forEach((p,i)=>{const stream=latin1(p.cmd.join('\n'));objects[pageIds[i]]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentIds[i]} 0 R >>`;objects[contentIds[i]]={stream};});const max=Math.max(...Object.keys(objects).map(Number));const chunks=[];let offset=0;const add=s=>{const b=latin1(s);chunks.push(b);offset+=b.length;};add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');const offsets=new Array(max+1).fill(0);for(let id=1;id<=max;id++){offsets[id]=offset;add(`${id} 0 obj\n`);const o=objects[id];if(o?.stream){add(`<< /Length ${o.stream.length} >>\nstream\n`);chunks.push(o.stream);offset+=o.stream.length;add('\nendstream\n');}else add(String(o||'<<>>')+'\n');add('endobj\n');}const xref=offset;add(`xref\n0 ${max+1}\n0000000000 65535 f \n`);for(let id=1;id<=max;id++)add(`${String(offsets[id]).padStart(10,'0')} 00000 n \n`);add(`trailer\n<< /Size ${max+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);const total=chunks.reduce((s,c)=>s+c.length,0),out=new Uint8Array(total);let pos=0;chunks.forEach(c=>{out.set(c,pos);pos+=c.length;});return new Blob([out],{type:'application/pdf'});}

async function exportPdf(){const btn=$('retentionExportReportButton');if(btn){btn.disabled=true;btn.dataset.originalText=btn.textContent;btn.textContent='Gerando…';}try{const data=collectReportData();if(!data.subjects.length){if(typeof appNotice==='function')await appNotice('Não há matérias no concurso atual para gerar o relatório.',{title:'Relatório de desempenho'});return;}const blob=buildPdf(data);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${safeName(data.contestName)}_relatorio_desempenho_${new Date().toISOString().slice(0,10)}.pdf`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1800);}catch(error){console.error('[Study report]',error);if(typeof appNotice==='function')await appNotice(`Não foi possível gerar o relatório: ${error.message}`,{title:'Falha na exportação'});else alert(`Não foi possível gerar o relatório: ${error.message}`);}finally{if(btn){btn.disabled=false;btn.textContent=btn.dataset.originalText||'Exportar dados';}}}

function addStyles(){if($('studyPerformanceReportStyles'))return;const s=document.createElement('style');s.id='studyPerformanceReportStyles';s.textContent=`.retention-report-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.retention-export-report-btn{white-space:nowrap}.retention-export-report-btn:disabled{opacity:.65;cursor:progress}@media(max-width:700px){.retention-diagnostic-head{align-items:stretch!important}.retention-report-actions{width:100%;display:grid;grid-template-columns:1fr 1fr}.retention-report-actions .btn{width:100%;min-height:44px}}@media(max-width:430px){.retention-report-actions{grid-template-columns:1fr}}`;document.head.appendChild(s);}
function install(){addStyles();const head=document.querySelector('.retention-diagnostic-head');const study=head?.querySelector('.retention-study-now-v1072');if(!head||!study)return false;if($('retentionExportReportButton'))return true;let wrap=head.querySelector('.retention-report-actions');if(!wrap){wrap=document.createElement('div');wrap.className='retention-report-actions';study.parentNode.insertBefore(wrap,study);wrap.appendChild(study);}const b=document.createElement('button');b.id='retentionExportReportButton';b.type='button';b.className='btn btn-secondary btn-sm retention-export-report-btn';b.innerHTML='<span aria-hidden="true">↧</span> Exportar dados';b.title='Exportar relatório completo de desempenho em PDF';b.addEventListener('click',exportPdf);wrap.appendChild(b);return true;}
function boot(){if(!install())setTimeout(boot,180);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,80));else setTimeout(boot,80);global.addEventListener('load',()=>setTimeout(boot,160));

global.StudyPerformanceReport=Object.freeze({collectReportData,buildPdf,exportPdf,install});
})(window);

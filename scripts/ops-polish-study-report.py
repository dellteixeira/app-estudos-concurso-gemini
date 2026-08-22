from pathlib import Path

core_path = Path('public/js/study-performance-report-core.js')
loader_path = Path('public/js/study-performance-report.js')
core = core_path.read_text(encoding='utf-8')
loader = loader_path.read_text(encoding='utf-8')

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)

core = replace_once(
    core,
    "function rect(p,x,y,w,h,color){p.cmd.push(`${rgb(color)} rg ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);}\nfunction line(p,x1,y1,x2,y2,color='#dbe4ea',width=.7){p.cmd.push(`${rgb(color)} RG ${width} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);}",
    "function rect(p,x,y,w,h,color){p.cmd.push(`${rgb(color)} rg ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);}\nfunction strokeRect(p,x,y,w,h,color='#dbe4ea',width=.7){p.cmd.push(`${rgb(color)} RG ${width} w ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re S`);}\nfunction line(p,x1,y1,x2,y2,color='#dbe4ea',width=.7){p.cmd.push(`${rgb(color)} RG ${width} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);}",
    'stroke rectangle helper'
)

core = replace_once(
    core,
    "function addHeader(p,title,subtitle=''){text(p,MX,806,title,16,true,'#0d2b3d');if(subtitle)text(p,MX,788,subtitle,8.5,false,'#6c7b87');line(p,MX,778,PAGE_W-MX,778,'#35b9b3',1.3);p.cursor=758;}",
    "function addHeader(p,title,subtitle=''){rect(p,0,770,PAGE_W,72,'#0b2233');rect(p,0,770,8,72,'#20c7b7');text(p,MX,807,title,18,true,'#ffffff');if(subtitle)text(p,MX,787,subtitle,8.7,false,'#b9dce6');text(p,PAGE_W-MX-70,807,'DESEMPENHO',7.2,true,'#44d9ca');p.cursor=748;}",
    'corporate header'
)

old_summary = """  const cards=[['Progresso',fmtPct(data.summary.progress)],['Horas',fmtHours(data.summary.totalMinutes)],['Questões',String(round(data.summary.totalQuestions))],['Acertos',String(round(data.summary.totalCorrect))],['Acurácia',data.summary.accuracy==null?'—':fmtPct(data.summary.accuracy)],['Retenção',data.summary.retention==null?'—':fmtPct(data.summary.retention)],['Em risco',String(data.summary.risk)],['Vencidas',String(data.summary.overdue)],['Dominados',String(data.summary.mastered)]];\n  const cw=155,ch=50,g=10;cards.forEach((c,i)=>{const col=i%3,row=Math.floor(i/3);const x=MX+col*(cw+g),y=p.cursor-row*(ch+g)-ch;rect(p,x,y,cw,ch,'#f2f6f8');text(p,x+10,y+31,c[0],8,false,'#647582');text(p,x+10,y+12,c[1],16,true,'#0d2b3d');});p.cursor-=3*(ch+g)+8;"""
new_summary = """  const cards=[['Progresso',fmtPct(data.summary.progress),'#3b82f6'],['Horas',fmtHours(data.summary.totalMinutes),'#06b6d4'],['Questões',String(round(data.summary.totalQuestions)),'#8b5cf6'],['Acertos',String(round(data.summary.totalCorrect)),'#22c55e'],['Acurácia',data.summary.accuracy==null?'—':fmtPct(data.summary.accuracy),'#14b8a6'],['Retenção',data.summary.retention==null?'—':fmtPct(data.summary.retention),'#0ea5e9'],['Em risco',String(data.summary.risk),'#f97316'],['Vencidas',String(data.summary.overdue),'#ef4444'],['Dominados',String(data.summary.mastered),'#22c55e']];\n  const cw=155,ch=54,g=10;cards.forEach((c,i)=>{const col=i%3,row=Math.floor(i/3);const x=MX+col*(cw+g),y=p.cursor-row*(ch+g)-ch;rect(p,x,y,cw,ch,'#f6f9fb');strokeRect(p,x,y,cw,ch,'#e1e9ee',.55);rect(p,x,y+ch-4,cw,4,c[2]);text(p,x+11,y+34,c[0],8,false,'#647582');text(p,x+11,y+12,c[1],16,true,'#0d2b3d');});p.cursor-=3*(ch+g)+8;"""
core = replace_once(core, old_summary, new_summary, 'summary cards')

old_chart_start = """    const left=70,right=PAGE_W-45,base=455,top=700,h=245;[0,25,50,75,100].forEach(v=>{const y=base+h*v/100;line(p,left,y,right,y,'#d9e3e9',.5);text(p,48,y-3,String(v),7.5,false,'#71808c');});\n    const slot=(right-left)/Math.max(1,chunk.length);chunk.forEach((m,i)=>{const bh=h*clamp(m.progress,0,100)/100;const bw=Math.min(34,slot*.55);const x=left+i*slot+(slot-bw)/2;rect(p,x,base,bw,bh,m.color);text(p,x+2,base+bh+8,fmtPct(m.progress),8,true,m.color);text(p,x+bw/2-2,base-16,String(ci*8+i+1),8,true,'#344550');});\n    p.cursor=425;text(p,MX,p.cursor,'Legenda',10,true,'#0d2b3d');p.cursor-=16;chunk.forEach((m,i)=>{rect(p,MX,p.cursor-6,8,8,m.color);const label=`${ci*8+i+1}. ${m.name} — ${fmtPct(m.progress)} (${m.studiedTopics}/${m.totalTopics} assuntos concluídos)`;const lines=wrap(label,8.5,PAGE_W-MX*2-18);lines.forEach(ln=>{text(p,MX+16,p.cursor,ln,8.5,false,'#263642');p.cursor-=11;});p.cursor-=3;});out.push(p);"""
new_chart_start = """    const left=70,right=PAGE_W-45,base=455,top=700,h=245;rect(p,left-12,base-26,(right-left)+24,h+54,'#f8fafb');strokeRect(p,left-12,base-26,(right-left)+24,h+54,'#e2e9ed',.55);[0,25,50,75,100].forEach(v=>{const y=base+h*v/100;line(p,left,y,right,y,'#d9e3e9',.5);text(p,47,y-3,`${v}%`,7.5,false,'#71808c');});\n    const slot=(right-left)/Math.max(1,chunk.length);chunk.forEach((m,i)=>{const raw=h*clamp(m.progress,0,100)/100;const bh=m.progress>0?Math.max(3,raw):2;const bw=Math.min(34,slot*.55);const x=left+i*slot+(slot-bw)/2;rect(p,x,base,bw,h,'#e9eff3');rect(p,x,base,bw,bh,m.color);rect(p,x,base+Math.max(0,bh-3),bw,3,m.color);text(p,x-1,base+bh+9,fmtPct(m.progress),8,true,m.color);text(p,x+bw/2-2,base-17,String(ci*8+i+1),8,true,'#344550');});\n    p.cursor=421;text(p,MX,p.cursor,'Legenda das matérias',11,true,'#0d2b3d');p.cursor-=17;chunk.forEach((m,i)=>{const lines=wrap(`${ci*8+i+1}. ${m.name} — ${fmtPct(m.progress)} (${m.studiedTopics}/${m.totalTopics} assuntos concluídos)`,8.5,PAGE_W-MX*2-30);const rowH=Math.max(18,lines.length*11+7);rect(p,MX,p.cursor-rowH+6,PAGE_W-MX*2,rowH,(i%2===0)?'#f7fafb':'#ffffff');rect(p,MX+7,p.cursor-1,9,9,m.color);strokeRect(p,MX+7,p.cursor-1,9,9,'#ffffff',.3);lines.forEach(ln=>{text(p,MX+24,p.cursor,ln,8.5,false,'#263642');p.cursor-=11;});p.cursor-=7;});out.push(p);"""
core = replace_once(core, old_chart_start, new_chart_start, 'chart and legend polish')

core = replace_once(
    core,
    "function metricRow(p,label,value,x,y,w=150){text(p,x,y,label,7.5,false,'#6d7c87');text(p,x,y-15,value,12,true,'#0d2b3d');line(p,x,y-21,x+w,y-21,'#e0e7eb',.5);}",
    "function metricRow(p,label,value,x,y,w=150){rect(p,x,y-28,w,39,'#f7fafb');strokeRect(p,x,y-28,w,39,'#e2e9ed',.5);rect(p,x,y-28,3,39,'#20b8ae');text(p,x+10,y-2,label,7.5,false,'#6d7c87');text(p,x+10,y-18,value,12,true,'#0d2b3d');}",
    'subject metric cards'
)

old_subject_head = "function subjectPages(data){const pages=[];for(const m of data.subjects){let p=page();addHeader(p,m.name,`Progresso ${fmtPct(m.progress)} · ${m.studiedTopics}/${m.totalTopics} assuntos concluídos`);rect(p,MX,p.cursor-5,10,10,m.color);text(p,MX+18,p.cursor,`${fmtPct(m.progress)} estudado`,11,true,m.color);p.cursor-=34;"
new_subject_head = "function subjectPages(data){const pages=[];for(const m of data.subjects){let p=page();addHeader(p,m.name,`${m.studiedTopics}/${m.totalTopics} assuntos concluídos`);rect(p,MX,p.cursor-11,PAGE_W-MX*2,34,'#f7fafb');strokeRect(p,MX,p.cursor-11,PAGE_W-MX*2,34,'#e2e9ed',.5);rect(p,MX,p.cursor-11,6,34,m.color);text(p,MX+17,p.cursor+3,`${fmtPct(m.progress)} estudado`,11,true,m.color);const trackX=MX+155,trackY=p.cursor+1,trackW=PAGE_W-MX-trackX;rect(p,trackX,trackY,trackW,8,'#e5edf1');rect(p,trackX,trackY,trackW*clamp(m.progress,0,100)/100,8,m.color);p.cursor-=42;"
core = replace_once(core, old_subject_head, new_subject_head, 'subject progress banner')

old_styles = ".retention-report-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.retention-export-report-btn{white-space:nowrap}.retention-export-report-btn:disabled{opacity:.65;cursor:progress}@media(max-width:700px){.retention-diagnostic-head{align-items:stretch!important}.retention-report-actions{width:100%;display:grid;grid-template-columns:1fr 1fr}.retention-report-actions .btn{width:100%;min-height:44px}}@media(max-width:430px){.retention-report-actions{grid-template-columns:1fr}}"
new_styles = ".retention-report-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.retention-report-actions .retention-study-now-v1072,.retention-report-actions .retention-export-report-btn{width:182px!important;min-width:182px!important;height:54px!important;min-height:54px!important;box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;padding:0 18px!important;border-radius:14px!important;font-size:15px!important;font-weight:700!important;line-height:1!important;white-space:nowrap!important}.retention-export-report-btn:disabled{opacity:.65;cursor:progress}@media(max-width:700px){.retention-diagnostic-head{align-items:stretch!important}.retention-report-actions{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:10px}.retention-report-actions .retention-study-now-v1072,.retention-report-actions .retention-export-report-btn{width:100%!important;min-width:0!important;height:54px!important;min-height:54px!important}}@media(max-width:430px){.retention-report-actions{grid-template-columns:1fr}}"
core = replace_once(core, old_styles, new_styles, 'button parity styles')

core_path.write_text(core, encoding='utf-8')

loader = loader.replace("./js/study-performance-report-v2.js'", "./js/study-performance-report-v2.js?rev=20260822-4'" )
loader = loader.replace("./js/study-performance-report-core.js'", "./js/study-performance-report-core.js?rev=20260822-4'" )
if loader.count('rev=20260822-4') < 3:
    raise SystemExit('loader revision was not applied to every report load path')
loader_path.write_text(loader, encoding='utf-8')

Path('tests/study-performance-report-polish.test.cjs').write_text(r'''const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=fs.readFileSync('public/js/study-performance-report-core.js','utf8');
const loader=fs.readFileSync('public/js/study-performance-report.js','utf8');

test('legend swatches are vertically aligned with their text baseline',()=>{
  assert.match(core,/rect\(p,MX\+7,p\.cursor-1,9,9,m\.color\)/);
  assert.doesNotMatch(core,/rect\(p,MX,p\.cursor-6,8,8,m\.color\)/);
});

test('report has stronger corporate visual hierarchy',()=>{
  assert.match(core,/rect\(p,0,770,PAGE_W,72,'#0b2233'\)/);
  assert.match(core,/DESEMPENHO/);
  assert.match(core,/strokeRect/);
  assert.match(core,/Legenda das matérias/);
  assert.match(core,/trackW\*clamp\(m\.progress,0,100\)\/100/);
});

test('study and export buttons have exact parity on desktop and mobile',()=>{
  assert.match(core,/retention-study-now-v1072,\.retention-report-actions \.retention-export-report-btn\{width:182px!important;min-width:182px!important;height:54px!important;min-height:54px!important/);
  assert.match(core,/@media\(max-width:700px\)[\s\S]*width:100%!important;min-width:0!important;height:54px!important;min-height:54px!important/);
});

test('report loader uses explicit cache-busting revision',()=>{
  assert.match(loader,/study-performance-report-core\.js\?rev=20260822-4/);
  assert.match(loader,/study-performance-report-v2\.js\?rev=20260822-4/);
});
''',encoding='utf-8')

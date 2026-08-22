from pathlib import Path

core_path=Path('public/js/study-performance-report-core.js')
loader_path=Path('public/js/study-performance-report.js')
core=core_path.read_text(encoding='utf-8')
loader=loader_path.read_text(encoding='utf-8')

old_chart="""function chartPages(data){
  const out=[];const chunks=[];for(let i=0;i<data.subjects.length;i+=8)chunks.push(data.subjects.slice(i,i+8));if(!chunks.length)chunks.push([]);
  chunks.forEach((chunk,ci)=>{const p=page();addHeader(p,'Progresso por matéria',chunks.length>1?`Gráfico ${ci+1} de ${chunks.length}`:'Percentual estudado por matéria');
    const left=70,right=PAGE_W-45,base=455,top=700,h=245;rect(p,left-12,base-26,(right-left)+24,h+54,'#f8fafb');strokeRect(p,left-12,base-26,(right-left)+24,h+54,'#e2e9ed',.55);[0,25,50,75,100].forEach(v=>{const y=base+h*v/100;line(p,left,y,right,y,'#d9e3e9',.5);text(p,47,y-3,`${v}%`,7.5,false,'#71808c');});
    const slot=(right-left)/Math.max(1,chunk.length);chunk.forEach((m,i)=>{const raw=h*clamp(m.progress,0,100)/100;const bh=m.progress>0?Math.max(3,raw):2;const bw=Math.min(34,slot*.55);const x=left+i*slot+(slot-bw)/2;rect(p,x,base,bw,h,'#e9eff3');rect(p,x,base,bw,bh,m.color);rect(p,x,base+Math.max(0,bh-3),bw,3,m.color);text(p,x-1,base+bh+9,fmtPct(m.progress),8,true,m.color);text(p,x+bw/2-2,base-17,String(ci*8+i+1),8,true,'#344550');});
    p.cursor=421;text(p,MX,p.cursor,'Legenda das matérias',11,true,'#0d2b3d');p.cursor-=17;chunk.forEach((m,i)=>{const lines=wrap(`${ci*8+i+1}. ${m.name} — ${fmtPct(m.progress)} (${m.studiedTopics}/${m.totalTopics} assuntos concluídos)`,8.5,PAGE_W-MX*2-30);const rowH=Math.max(18,lines.length*11+7);rect(p,MX,p.cursor-rowH+6,PAGE_W-MX*2,rowH,(i%2===0)?'#f7fafb':'#ffffff');rect(p,MX+7,p.cursor-1,9,9,m.color);strokeRect(p,MX+7,p.cursor-1,9,9,'#ffffff',.3);lines.forEach(ln=>{text(p,MX+24,p.cursor,ln,8.5,false,'#263642');p.cursor-=11;});p.cursor-=7;});out.push(p);});return out;
}"""

new_chart="""function chartPages(data){
  const p=page();
  const subjects=Array.isArray(data.subjects)?data.subjects:[];
  addHeader(p,'Progresso por matéria','Todas as matérias em uma única visão');
  const count=Math.max(1,subjects.length);
  const left=66,right=PAGE_W-38,base=486,h=220;
  rect(p,left-12,base-24,(right-left)+24,h+50,'#f8fafb');
  strokeRect(p,left-12,base-24,(right-left)+24,h+50,'#e2e9ed',.55);
  [0,25,50,75,100].forEach(v=>{const y=base+h*v/100;line(p,left,y,right,y,'#d9e3e9',.5);text(p,43,y-3,`${v}%`,7.2,false,'#71808c');});
  const slot=(right-left)/count;
  const bw=Math.max(9,Math.min(31,slot*.56));
  const valueSize=count>16?5.7:count>12?6.2:count>8?7:8;
  const numberSize=count>16?5.7:count>12?6.3:7.5;
  subjects.forEach((m,i)=>{const raw=h*clamp(m.progress,0,100)/100;const bh=m.progress>0?Math.max(3,raw):2;const x=left+i*slot+(slot-bw)/2;rect(p,x,base,bw,h,'#e9eff3');rect(p,x,base,bw,bh,m.color);rect(p,x,base+Math.max(0,bh-3),bw,3,m.color);const pct=fmtPct(m.progress);text(p,x+(bw-estimate(pct,valueSize))/2,base+bh+7,pct,valueSize,true,m.color);const idx=String(i+1);text(p,x+(bw-estimate(idx,numberSize))/2,base-15,idx,numberSize,true,'#344550');});
  p.cursor=447;text(p,MX,p.cursor,'Legenda das matérias',11,true,'#0d2b3d');p.cursor-=17;
  const legendSize=subjects.length>16?6.2:subjects.length>12?6.7:subjects.length>8?7.2:8.1;
  const leading=legendSize+2.4;
  const available=Math.max(150,PAGE_W-MX*2-30);
  subjects.forEach((m,i)=>{const label=`${i+1}. ${m.name} — ${fmtPct(m.progress)} (${m.studiedTopics}/${m.totalTopics} assuntos concluídos)`;let lines=wrap(label,legendSize,available);if(lines.length>2)lines=[lines[0],lines.slice(1).join(' ')];const rowH=Math.max(14,lines.length*leading+5);if(p.cursor-rowH<BOTTOM+8){const compact=`${i+1}. ${m.name} — ${fmtPct(m.progress)}`;lines=wrap(compact,Math.max(5.8,legendSize-.5),available);}
    rect(p,MX,p.cursor-rowH+5,PAGE_W-MX*2,rowH,(i%2===0)?'#f7fafb':'#ffffff');rect(p,MX+7,p.cursor-1,8,8,m.color);strokeRect(p,MX+7,p.cursor-1,8,8,'#ffffff',.3);lines.forEach(ln=>{text(p,MX+22,p.cursor,ln,legendSize,false,'#263642');p.cursor-=leading;});p.cursor-=4;});
  return [p];
}"""

if old_chart not in core:
    raise SystemExit('chartPages source block not found')
core=core.replace(old_chart,new_chart,1)

old_styles="""function addStyles(){if($('studyPerformanceReportStyles'))return;const s=document.createElement('style');s.id='studyPerformanceReportStyles';s.textContent=`.retention-report-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.retention-report-actions .retention-study-now-v1072,.retention-report-actions .retention-export-report-btn{width:182px!important;min-width:182px!important;height:54px!important;min-height:54px!important;box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;padding:0 18px!important;border-radius:14px!important;font-size:15px!important;font-weight:700!important;line-height:1!important;white-space:nowrap!important}.retention-export-report-btn:disabled{opacity:.65;cursor:progress}@media(max-width:700px){.retention-diagnostic-head{align-items:stretch!important}.retention-report-actions{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:10px}.retention-report-actions .retention-study-now-v1072,.retention-report-actions .retention-export-report-btn{width:100%!important;min-width:0!important;height:54px!important;min-height:54px!important}}@media(max-width:430px){.retention-report-actions{grid-template-columns:1fr}}`;document.head.appendChild(s);}"""
new_styles="""function addStyles(){if($('studyPerformanceReportStyles'))return;const s=document.createElement('style');s.id='studyPerformanceReportStyles';s.textContent=`.retention-report-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.retention-report-actions .retention-study-now-v1072,.retention-report-actions .retention-export-report-btn{width:182px!important;min-width:182px!important;height:54px!important;min-height:54px!important;box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;padding:0 18px!important;border-radius:14px!important;font-size:15px!important;font-weight:700!important;line-height:1!important;white-space:nowrap!important}.retention-report-actions .retention-export-report-btn{background:var(--accent,#19d3c5)!important;color:#062b31!important;border:1px solid var(--accent,#19d3c5)!important;box-shadow:0 0 0 1px rgba(25,211,197,.08) inset!important}.retention-report-actions .retention-export-report-btn:hover:not(:disabled){filter:brightness(1.06)!important;transform:translateY(-1px)}.retention-export-report-btn:disabled{opacity:.65;cursor:progress}@media(max-width:700px){.retention-diagnostic-head{align-items:stretch!important}.retention-report-actions{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:10px}.retention-report-actions .retention-study-now-v1072,.retention-report-actions .retention-export-report-btn{width:100%!important;min-width:0!important;height:54px!important;min-height:54px!important}}@media(max-width:430px){.retention-report-actions{grid-template-columns:1fr}}`;document.head.appendChild(s);}"""
if old_styles not in core:
    raise SystemExit('addStyles source block not found')
core=core.replace(old_styles,new_styles,1)
core=core.replace("b.className='btn btn-secondary btn-sm retention-export-report-btn';","b.className=study.className+' retention-export-report-btn';",1)
loader=loader.replace('study-performance-report-v2.js?rev=20260822-4','study-performance-report-v2.js?rev=20260822-5')
loader=loader.replace('study-performance-report-core.js?rev=20260822-4','study-performance-report-core.js?rev=20260822-5')
core_path.write_text(core,encoding='utf-8')
loader_path.write_text(loader,encoding='utf-8')
Path('tests/study-performance-report-single-page.test.cjs').write_text("""const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=fs.readFileSync('public/js/study-performance-report-core.js','utf8');
const loader=fs.readFileSync('public/js/study-performance-report.js','utf8');

test('all subject bars are rendered on one chart page',()=>{
  assert.match(core,/const subjects=Array\.isArray\(data\.subjects\)\?data\.subjects:\[\]/);
  assert.match(core,/return \[p\];/);
  assert.doesNotMatch(core,/subjects\.length;i\+=8/);
  assert.doesNotMatch(core,/Gráfico \$\{ci\+1\}/);
});

test('bar and legend density adapt to many subjects',()=>{
  assert.match(core,/Math\.max\(9,Math\.min\(31,slot\*\.56\)\)/);
  assert.match(core,/count>16\?5\.7:count>12\?6\.2:count>8\?7:8/);
  assert.match(core,/subjects\.length>16\?6\.2:subjects\.length>12\?6\.7:subjects\.length>8\?7\.2:8\.1/);
});

test('export button inherits study-now class and accent appearance',()=>{
  assert.match(core,/b\.className=study\.className\+' retention-export-report-btn'/);
  assert.match(core,/background:var\(--accent,#19d3c5\)!important/);
  assert.match(core,/border:1px solid var\(--accent,#19d3c5\)!important/);
});

test('loader revision is bumped to avoid stale report UI',()=>{
  assert.match(loader,/study-performance-report-core\.js\?rev=20260822-5/);
  assert.match(loader,/study-performance-report-v2\.js\?rev=20260822-5/);
});
""",encoding='utf-8')

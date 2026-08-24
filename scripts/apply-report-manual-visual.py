from pathlib import Path
import re

p=Path('public/js/study-performance-report-core.js')
s=p.read_text(encoding='utf-8')

if 'REPORT_MANUAL_VISUAL_THEME' in s:
    raise SystemExit('theme already applied')

# Tag the source so tests can guard the design system.
s=s.replace("const PAGE_W=595, PAGE_H=842, MX=44, TOP=795, BOTTOM=42;", "const PAGE_W=595, PAGE_H=842, MX=44, TOP=795, BOTTOM=42;\n// REPORT_MANUAL_VISUAL_THEME — identidade editorial do Manual Estudo Adaptativo Inteligente")

old="function page(){return {cmd:[],cursor:TOP};}"
new="""function page(){
  const p={cmd:[],cursor:TOP};
  rect(p,0,0,PAGE_W,PAGE_H,'#010612');
  rect(p,18,18,PAGE_W-36,PAGE_H-36,'#030b1b');
  strokeRect(p,18,18,PAGE_W-36,PAGE_H-36,'#0b2c57',.65);
  line(p,28,814,158,814,'#0b4e97',.65);
  line(p,PAGE_W-154,814,PAGE_W-28,814,'#0b4e97',.65);
  return p;
}"""
if old not in s: raise SystemExit('page function target missing')
s=s.replace(old,new,1)

old=re.search(r"function addFooter\(p,pageNo,total,contest\)\{[^\n]*\}",s)
if not old: raise SystemExit('footer target missing')
new="""function addFooter(p,pageNo,total,contest){
  line(p,34,38,PAGE_W-34,38,'#104c8b',.55);
  text(p,36,22,'ESTUDO ADAPTATIVO INTELIGENTE',6.4,true,'#218cff');
  text(p,214,22,String(contest||'').slice(0,54),6.2,false,'#7187a4');
  text(p,PAGE_W-63,20,String(pageNo).padStart(2,'0'),12,true,'#218cff');
  text(p,PAGE_W-39,21,`/${total}`,6.2,false,'#7187a4');
}"""
s=s[:old.start()]+new+s[old.end():]

old=re.search(r"function addHeader\(p,title,subtitle=''\)\{[^\n]*\}",s)
if not old: raise SystemExit('header target missing')
new="""function addHeader(p,title,subtitle=''){
  text(p,44,805,'DESEMPENHO',7.2,true,'#218cff');
  line(p,118,808,PAGE_W-44,808,'#0b4e97',.7);
  text(p,44,772,title,23,true,'#f5f8ff');
  if(subtitle)text(p,44,748,subtitle,9.2,false,'#c4cedd');
  line(p,44,731,252,731,'#1b78d0',.8);
  p.cursor=700;
}"""
s=s[:old.start()]+new+s[old.end():]

start=s.find('function summaryPage(data){')
end=s.find('\nfunction chartPages(data){',start)
if start<0 or end<0: raise SystemExit('summary page block missing')
summary="""function summaryPage(data){
  const p=page();addHeader(p,'Relatório de Desempenho',data.contestName);
  text(p,44,p.cursor,'Resumo executivo',14,true,'#f5f8ff');
  line(p,177,p.cursor+4,PAGE_W-44,p.cursor+4,'#123765',.55);
  p.cursor-=24;
  const cards=[
    ['Progresso',fmtPct(data.summary.progress)],['Horas',fmtHours(data.summary.totalMinutes)],['Questões',String(round(data.summary.totalQuestions))],['Acertos',String(round(data.summary.totalCorrect))],
    ['Acurácia',data.summary.accuracy==null?'—':fmtPct(data.summary.accuracy)],['Retenção',data.summary.retention==null?'—':fmtPct(data.summary.retention)],['Em risco',String(data.summary.risk)],['Vencidos',String(data.summary.overdue)],['Dominados',String(data.summary.mastered)]
  ];
  const drawCard=(x,y,w,label,value,index)=>{
    rect(p,x,y,w,76,'#061226');strokeRect(p,x,y,w,76,index<4?'#1e78d7':'#145b9e',.8);
    rect(p,x,y,w,2,index<4?'#168fff':'#0d6fc5');
    text(p,x+11,y+50,label,7.8,false,'#c3cfdf');
    text(p,x+11,y+20,value,17,true,index===6||index===7?'#ffb14a':'#3fc6ff');
    rect(p,x+w-13,y+10,4,4,'#218cff');
  };
  const topW=119,topGap=8;cards.slice(0,4).forEach((c,i)=>drawCard(44+i*(topW+topGap),p.cursor-76,topW,c[0],c[1],i));
  p.cursor-=90;
  const botW=94,botGap=6.75;cards.slice(4).forEach((c,i)=>drawCard(44+i*(botW+botGap),p.cursor-76,botW,c[0],c[1],i+4));
  p.cursor-=103;
  text(p,44,p.cursor,'Como ler este relatório',13,true,'#f5f8ff');
  line(p,205,p.cursor+4,PAGE_W-44,p.cursor+4,'#123765',.55);p.cursor-=22;
  rect(p,44,p.cursor-78,PAGE_W-88,78,'#061226');strokeRect(p,44,p.cursor-78,PAGE_W-88,78,'#174d87',.7);
  p.cursor-=18;
  addWrapped(p,'O percentual por matéria utiliza o mesmo estado de aquisição de conteúdo do aplicativo. Retenção, assuntos em risco, revisões vencidas e assuntos dominados são calculados a partir do mesmo diagnóstico exibido no painel Retenção e Diagnóstico.',60,9.1,false,'#c0ccdc',PAGE_W-120,12);
  p.cursor-=18;
  rect(p,44,p.cursor-86,PAGE_W-88,86,'#07152c');strokeRect(p,44,p.cursor-86,PAGE_W-88,86,'#218cff',1.05);
  text(p,62,p.cursor-34,'“',31,true,'#1f80ff');
  text(p,104,p.cursor-27,'Quando o tempo é curto, a organização transforma esforço',11.4,true,'#f5f8ff');
  text(p,104,p.cursor-48,'em avanço consistente.',12.2,true,'#218cff');
  p.cursor-=112;
  text(p,44,p.cursor,`Gerado em ${data.generatedAt.toLocaleString('pt-BR')}`,7.4,false,'#7187a4');
  return p;
}
"""
s=s[:start]+summary+s[end:]

# Harmonize the remaining pages with the same dark editorial palette.
repl={
"'#17202b'":"'#dce8f8'",
"'#0d2b3d'":"'#f4f8ff'",
"'#40515d'":"'#aebdd0'",
"'#30404c'":"'#c2cede'",
"'#344550'":"'#b8c6d8'",
"'#263642'":"'#c7d3e2'",
"'#647582'":"'#9fb1c8'",
"'#6d7c87'":"'#9fb1c8'",
"'#71808c'":"'#8fa4bd'",
"'#7b8995'":"'#7187a4'",
"'#75838e'":"'#8fa4bd'",
"'#f6f9fb'":"'#07152a'",
"'#f8fafb'":"'#061226'",
"'#f7fafb'":"'#07152a'",
"'#f2f6f8'":"'#07152a'",
"'#e9eff3'":"'#0a1c34'",
"'#e1e9ee'":"'#174d87'",
"'#e2e9ed'":"'#174d87'",
"'#d9e3e9'":"'#123765'",
"'#dce5eb'":"'#123765'"
}
for a,b in repl.items(): s=s.replace(a,b)
s=s.replace("(i%2===0)?'#07152a':'#ffffff'","(i%2===0)?'#07152a':'#091a31'")

p.write_text(s,encoding='utf-8')

# Add regression tests.
t=Path('tests/study-performance-report-manual-visual.test.cjs')
t.write_text("""'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../public/js/study-performance-report-core.js'),'utf8');

test('performance report uses manual visual design system',()=>{
  assert.match(src,/REPORT_MANUAL_VISUAL_THEME/);
  assert.match(src,/ESTUDO ADAPTATIVO INTELIGENTE/);
  assert.match(src,/Relatório de Desempenho/);
  assert.match(src,/Quando o tempo é curto/);
  assert.match(src,/#010612/);
  assert.match(src,/#218cff/);
});

test('legacy white executive cards are removed',()=>{
  assert.doesNotMatch(src,/rect\(p,x,y,cw,ch,'#f6f9fb'\)/);
  assert.doesNotMatch(src,/rect\(p,0,770,PAGE_W,72,'#0b2233'\)/);
});
""",encoding='utf-8')
print('report manual visual theme applied')

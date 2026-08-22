(function(global){
'use strict';

const $ = id => document.getElementById(id);
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN_X = 48;
const TOP = 788;
const BOTTOM = 52;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const safeName = value => String(value || 'anotacoes')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,120) || 'anotacoes';

function notice(message, title='Anotações') {
  if (typeof appNotice === 'function') return appNotice(message,{title});
  alert(message);
  return Promise.resolve();
}

function normalizePdfChar(ch) {
  const map = {'–':'-','—':'-','“':'"','”':'"','‘':"'",'’':"'",'…':'...','•':'•','→':'->','←':'<-','€':'EUR'};
  if (map[ch] != null) return map[ch];
  const code = ch.charCodeAt(0);
  return code <= 255 ? ch : '?';
}
function toPdfText(value) {
  return [...String(value ?? '')].map(normalizePdfChar).join('').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
}
function latin1Bytes(str) {
  const out = new Uint8Array(str.length);
  for (let i=0;i<str.length;i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}
function pdfColor(hex, fallback=[0.08,0.13,0.19]) {
  const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1],16);
  return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255];
}
function rgb(c){return `${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)}`;}

function normalizeInlineStyle(style={}) {
  return {
    bold: !!style.bold,
    italic: !!style.italic,
    underline: !!style.underline,
    size: Math.max(8,Math.min(26,Number(style.size)||11)),
    color: style.color || '#16212f'
  };
}
function mergeStyle(base, patch) { return normalizeInlineStyle({...base,...patch}); }

function parseFontSize(node, inherited) {
  const raw = node?.style?.fontSize || '';
  const m = String(raw).match(/([0-9.]+)px/i);
  if (m) return Math.max(8,Math.min(26,Number(m[1])*0.75));
  return inherited;
}

function collectRuns(node, inherited, out) {
  if (!node) return;
  if (node.nodeType === Node.TEXT_NODE) {
    const text = String(node.nodeValue || '').replace(/\u00a0/g,' ');
    if (text) out.push({text,style:normalizeInlineStyle(inherited)});
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const tag = node.tagName.toUpperCase();
  if (tag === 'BR') { out.push({text:'\n',style:normalizeInlineStyle(inherited)}); return; }
  let style = {...inherited};
  if (['B','STRONG'].includes(tag)) style.bold = true;
  if (['I','EM'].includes(tag)) style.italic = true;
  if (tag === 'U') style.underline = true;
  style.size = parseFontSize(node,style.size);
  if (node.style?.color) style.color = node.style.color;
  [...node.childNodes].forEach(child=>collectRuns(child,style,out));
}

function makeBlockFromElement(el, baseStyle) {
  const tag = el.tagName.toUpperCase();
  let blockStyle = {...baseStyle};
  let type = 'paragraph';
  let before = 2, after = 7;
  if (/^H[1-6]$/.test(tag)) {
    const level = Number(tag[1]);
    type = 'heading';
    blockStyle.bold = true;
    blockStyle.size = [20,17,15,13,12,11][level-1] || 13;
    before = level <= 2 ? 11 : 8;
    after = 5;
  } else if (tag === 'LI') {
    type = 'list'; before=1; after=2;
  } else if (tag === 'BLOCKQUOTE') {
    type='quote'; blockStyle.italic=true; before=5; after=7;
  } else if (tag === 'PRE' || tag === 'CODE') {
    type='code'; blockStyle.size=9; before=5; after=6;
  }
  const runs=[];
  collectRuns(el,blockStyle,runs);
  if (type === 'list') runs.unshift({text:'• ',style:mergeStyle(blockStyle,{bold:true})});
  return {type,runs,before,after};
}

function noteHtmlToBlocks(note) {
  const html = String(note?.conteudo || '').trim();
  if (!html) {
    const text = String(note?.conteudoTexto || '').trim();
    return text.split(/\n{2,}/).map(p=>({type:'paragraph',runs:[{text:p,style:normalizeInlineStyle({size:11})}],before:2,after:7}));
  }
  const holder=document.createElement('div'); holder.innerHTML=html;
  const blocks=[];
  const base=normalizeInlineStyle({size:11,color:'#16212f'});
  [...holder.childNodes].forEach(node=>{
    if (node.nodeType===Node.TEXT_NODE) {
      const text=String(node.nodeValue||'').trim();
      if(text) blocks.push({type:'paragraph',runs:[{text,style:base}],before:2,after:7});
      return;
    }
    if(node.nodeType!==Node.ELEMENT_NODE) return;
    const tag=node.tagName.toUpperCase();
    if(['UL','OL'].includes(tag)) [...node.children].forEach(li=>blocks.push(makeBlockFromElement(li,base)));
    else blocks.push(makeBlockFromElement(node,base));
  });
  return blocks;
}

function fontKey(style){
  if(style.bold && style.italic) return 'F4';
  if(style.bold) return 'F2';
  if(style.italic) return 'F3';
  return 'F1';
}
function estimateWidth(text,size,bold=false){
  let units=0;
  for(const ch of String(text||'')) {
    if(/[MW@#%&]/.test(ch)) units+=0.88;
    else if(/[ilI1.,:;'|!]/.test(ch)) units+=0.28;
    else if(/\s/.test(ch)) units+=0.28;
    else units+=0.53;
  }
  return units*size*(bold?1.035:1);
}

function tokenizeRuns(runs){
  const tokens=[];
  for(const run of runs){
    const parts=String(run.text||'').split(/(\n|\s+)/);
    for(const part of parts){
      if(part==='') continue;
      if(part==='\n') tokens.push({newline:true,style:run.style});
      else tokens.push({text:part,style:run.style});
    }
  }
  return tokens;
}

function layoutBlock(block, maxWidth=CONTENT_W){
  const tokens=tokenizeRuns(block.runs);
  const lines=[]; let line=[]; let width=0; let maxSize=11;
  const flush=()=>{ lines.push({runs:line,width,maxSize}); line=[]; width=0; maxSize=11; };
  for(const token of tokens){
    if(token.newline){flush();continue;}
    const style=normalizeInlineStyle(token.style);
    const w=estimateWidth(token.text,style.size,style.bold);
    if(line.length && width+w>maxWidth && !/^\s+$/.test(token.text)) flush();
    if(!line.length && /^\s+$/.test(token.text)) continue;
    line.push({text:token.text,style,width}); width+=w; maxSize=Math.max(maxSize,style.size);
  }
  if(line.length || !lines.length) flush();
  return lines;
}

function buildDocumentItems(materia,notes){
  const items=[];
  items.push({kind:'coverTitle',text:'Caderno de Anotações',size:21,bold:true,before:0,after:3,color:'#0b293d'});
  items.push({kind:'coverSubtitle',text:materia,size:15,bold:true,before:0,after:2,color:'#198f8a'});
  items.push({kind:'meta',text:`Concurso: ${String(currentConcurso||'Concurso').trim()}`,size:9,bold:false,before:0,after:16,color:'#667788'});
  notes.forEach((note,index)=>{
    if(index) items.push({kind:'separator',before:7,after:12});
    items.push({kind:'noteTitle',text:note.titulo||note.assunto||`Nota ${index+1}`,size:14,bold:true,before:0,after:3,color:'#0b293d'});
    if(note.assunto && note.assunto!==note.titulo) items.push({kind:'meta',text:`Assunto: ${note.assunto}`,size:9,bold:true,before:0,after:1,color:'#198f8a'});
    if(note.data) items.push({kind:'meta',text:`Editado em ${note.data}`,size:8.5,bold:false,before:0,after:7,color:'#778899'});
    noteHtmlToBlocks(note).forEach(block=>items.push({kind:'rich',block}));
  });
  return items;
}

function paginate(materia,notes){
  const pages=[]; let current=[]; let y=TOP;
  const pushPage=()=>{pages.push(current);current=[];y=TOP;};
  const ensure=(height)=>{if(y-height<BOTTOM && current.length)pushPage();};
  const items=buildDocumentItems(materia,notes);
  for(const item of items){
    if(item.kind==='separator'){
      ensure(28); y-=item.before||0; current.push({kind:'rule',y}); y-=item.after||0; continue;
    }
    if(item.kind!=='rich'){
      const style=normalizeInlineStyle({size:item.size,bold:item.bold,color:item.color});
      const lines=layoutBlock({runs:[{text:item.text,style}]},CONTENT_W);
      const h=(item.before||0)+(item.after||0)+lines.reduce((n,l)=>n+Math.max(12,l.maxSize*1.35),0);
      ensure(h); y-=item.before||0;
      for(const line of lines){current.push({kind:'line',runs:line.runs,y,maxSize:line.maxSize});y-=Math.max(12,line.maxSize*1.35);}
      y-=item.after||0; continue;
    }
    const block=item.block; y-=block.before||0;
    const indent=block.type==='quote'?18:block.type==='list'?12:0;
    const lines=layoutBlock(block,CONTENT_W-indent);
    for(const line of lines){
      const leading=Math.max(12,line.maxSize*1.38);
      ensure(leading+(block.after||0));
      current.push({kind:'line',runs:line.runs,y,maxSize:line.maxSize,indent,quote:block.type==='quote'});
      y-=leading;
    }
    y-=block.after||0;
  }
  if(current.length||!pages.length)pages.push(current);
  return pages;
}

function makeRichPdfBlob(materia,notes){
  const pages=paginate(materia,notes);
  const objects=[];
  const fontIds={F1:3,F2:4,F3:5,F4:6};
  const firstPageId=7;
  const pageIds=[],contentIds=[];
  for(let i=0;i<pages.length;i++){pageIds.push(firstPageId+i*2);contentIds.push(firstPageId+i*2+1);}
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[2]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objects[5]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>';
  objects[6]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique /Encoding /WinAnsiEncoding >>';

  pages.forEach((page,pageIndex)=>{
    const cmds=[];
    cmds.push(`${rgb(pdfColor('#198f8a'))} RG 1.2 w ${MARGIN_X} 806 m ${PAGE_W-MARGIN_X} 806 l S`);
    page.forEach(item=>{
      if(item.kind==='rule'){
        cmds.push(`${rgb(pdfColor('#d8e2e8'))} RG 0.7 w ${MARGIN_X} ${item.y.toFixed(1)} m ${PAGE_W-MARGIN_X} ${item.y.toFixed(1)} l S`);return;
      }
      if(item.quote) cmds.push(`${rgb(pdfColor('#58cfc7'))} RG 2 w ${(MARGIN_X+4).toFixed(1)} ${(item.y+3).toFixed(1)} m ${(MARGIN_X+4).toFixed(1)} ${(item.y-item.maxSize*1.2).toFixed(1)} l S`);
      for(const run of item.runs){
        const s=normalizeInlineStyle(run.style); const x=MARGIN_X+(item.indent||0)+(run.width||0); const color=pdfColor(s.color);
        cmds.push(`BT /${fontKey(s)} ${s.size.toFixed(2)} Tf ${rgb(color)} rg ${x.toFixed(1)} ${item.y.toFixed(1)} Td (${toPdfText(run.text)}) Tj ET`);
        if(s.underline && String(run.text).trim()){
          const w=estimateWidth(run.text,s.size,s.bold); const uy=item.y-1.6;
          cmds.push(`${rgb(color)} RG 0.55 w ${x.toFixed(1)} ${uy.toFixed(1)} m ${(x+w).toFixed(1)} ${uy.toFixed(1)} l S`);
        }
      }
    });
    const footer=`${String(currentConcurso||'').trim()}  •  ${materia}  •  Página ${pageIndex+1}/${pages.length}`;
    cmds.push(`BT /F1 7.5 Tf ${rgb(pdfColor('#7b8a99'))} rg ${MARGIN_X} 28 Td (${toPdfText(footer)}) Tj ET`);
    const stream=latin1Bytes(cmds.join('\n'));
    objects[pageIds[pageIndex]]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontIds.F1} 0 R /F2 ${fontIds.F2} 0 R /F3 ${fontIds.F3} 0 R /F4 ${fontIds.F4} 0 R >> >> /Contents ${contentIds[pageIndex]} 0 R >>`;
    objects[contentIds[pageIndex]]={stream};
  });

  const maxId=Math.max(...Object.keys(objects).map(Number)); const chunks=[]; let offset=0;
  const add=str=>{const b=latin1Bytes(str);chunks.push(b);offset+=b.length;};
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'); const offsets=new Array(maxId+1).fill(0);
  for(let id=1;id<=maxId;id++){
    offsets[id]=offset;add(`${id} 0 obj\n`);const obj=objects[id];
    if(obj?.stream){add(`<< /Length ${obj.stream.length} >>\nstream\n`);chunks.push(obj.stream);offset+=obj.stream.length;add('\nendstream\n');}
    else add(String(obj||'<<>>')+'\n');add('endobj\n');
  }
  const xref=offset;add(`xref\n0 ${maxId+1}\n0000000000 65535 f \n`);
  for(let id=1;id<=maxId;id++)add(`${String(offsets[id]).padStart(10,'0')} 00000 n \n`);
  add(`trailer\n<< /Size ${maxId+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const total=chunks.reduce((n,c)=>n+c.length,0),joined=new Uint8Array(total);let pos=0;chunks.forEach(c=>{joined.set(c,pos);pos+=c.length;});
  return new Blob([joined],{type:'application/pdf'});
}

async function exportRich(){
  const materia=String($('notesMateriaSelect')?.value||'').trim();
  if(!materia)return notice('Selecione uma matéria antes de exportar.');
  let notes=[];
  try{const metadata=getConcursosMetadata();notes=(metadata?.[currentConcurso]?.structuredNotes||[]).filter(note=>String(note?.materia||'').trim()===materia);}catch(_){}
  if(!notes.length)return notice(`Não há anotações em “${materia}” para exportar.`);
  try{
    const blob=makeRichPdfBlob(materia,notes),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`${safeName(currentConcurso)}_${safeName(materia)}_anotacoes.pdf`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }catch(error){console.error('[Rich notes export]',error);await notice(`Não foi possível gerar o PDF formatado: ${error.message}`,'Falha na exportação');}
}

function install(){
  const wrap=$('notesIoActions'); if(!wrap)return false;
  const old=[...wrap.querySelectorAll('button')].find(btn=>/^\s*Exportar\s*$/i.test(btn.textContent||''));
  if(!old||old.dataset.richExport==='1')return !!old;
  const button=old.cloneNode(true);button.dataset.richExport='1';button.title='Exportar em PDF preservando parágrafos, títulos e formatação';button.addEventListener('click',exportRich);old.replaceWith(button);return true;
}
function boot(){if(!install())setTimeout(boot,120);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,80));else setTimeout(boot,80);
global.addEventListener('load',()=>setTimeout(boot,120));

global.NotesRichExport=Object.freeze({makeRichPdfBlob,noteHtmlToBlocks,exportRich});
})(window);

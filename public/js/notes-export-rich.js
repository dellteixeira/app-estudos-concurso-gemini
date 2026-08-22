(function(global){
'use strict';

const $ = id => document.getElementById(id);
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN_X = 48;
const TOP = 788;
const BOTTOM = 52;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const DEFAULT_TEXT_COLOR = '#16212f';
const ACCENT = '#198f8a';
const TITLE = '#0b293d';
const MUTED = '#667788';
let notesSelectionObserver = null;
let notesSelectionRestoreTimer = null;
let originalLoadNotesData = null;

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
function pdfColor(value, fallback=[0.08,0.13,0.19]) {
  const raw = String(value || '').trim();
  let m = raw.match(/^#?([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1],16);
    return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255];
  }
  m = raw.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (m) return [Number(m[1])/255,Number(m[2])/255,Number(m[3])/255];
  return fallback;
}
function rgb(c){return `${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)}`;}

function normalizeInlineStyle(style={}) {
  return {
    bold: !!style.bold,
    italic: !!style.italic,
    underline: !!style.underline,
    size: Math.max(8,Math.min(26,Number(style.size)||11)),
    color: style.color || DEFAULT_TEXT_COLOR
  };
}
function mergeStyle(base, patch) { return normalizeInlineStyle({...base,...patch}); }
function parseFontSize(node, inherited) {
  const raw = String(node?.style?.fontSize || '').trim();
  let m = raw.match(/([0-9.]+)px/i);
  if (m) return Math.max(8,Math.min(26,Number(m[1])*0.75));
  m = raw.match(/([0-9.]+)pt/i);
  if (m) return Math.max(8,Math.min(26,Number(m[1])));
  m = raw.match(/([0-9.]+)em/i);
  if (m) return Math.max(8,Math.min(26,Number(m[1]) * inherited));
  return inherited;
}
function inlineStyleFromNode(node, inherited) {
  const tag = String(node?.tagName || '').toUpperCase();
  const style = {...inherited};
  if (['B','STRONG'].includes(tag)) style.bold = true;
  if (['I','EM'].includes(tag)) style.italic = true;
  if (tag === 'U') style.underline = true;
  const weight = String(node?.style?.fontWeight || '').toLowerCase();
  if (weight === 'bold' || Number.parseInt(weight,10) >= 600) style.bold = true;
  const fontStyle = String(node?.style?.fontStyle || '').toLowerCase();
  if (fontStyle.includes('italic') || fontStyle.includes('oblique')) style.italic = true;
  const decoration = String(node?.style?.textDecoration || node?.style?.textDecorationLine || '').toLowerCase();
  if (decoration.includes('underline')) style.underline = true;
  style.size = parseFontSize(node,style.size || 11);
  if (node?.style?.color) style.color = node.style.color;
  return normalizeInlineStyle(style);
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
  const style = inlineStyleFromNode(node,inherited);
  [...node.childNodes].forEach(child=>collectRuns(child,style,out));
}
function elementIsVisuallyEmpty(el) {
  if (!el) return true;
  const clone=el.cloneNode(true);
  clone.querySelectorAll?.('br').forEach(br=>br.replaceWith('\n'));
  return !(clone.textContent || '').replace(/\u00a0/g,' ').trim();
}
function blockDefinition(tag) {
  if (/^H[1-6]$/.test(tag)) {
    const level=Number(tag[1]);
    return {type:'heading',before:level<=2?9:6,after:4,size:[20,17,15,13,12,11][level-1],bold:true};
  }
  if (tag==='LI') return {type:'list',before:0,after:1.5,size:11};
  if (tag==='BLOCKQUOTE') return {type:'quote',before:5,after:6,size:11,italic:true};
  if (tag==='PRE' || tag==='CODE') return {type:'code',before:4,after:5,size:9};
  if (tag==='P') return {type:'paragraph',before:1,after:5,size:11};
  if (tag==='DIV') return {type:'paragraph',before:0.5,after:3,size:11};
  return {type:'paragraph',before:0.5,after:3,size:11};
}
function makeBlockFromElement(el, baseStyle, listPrefix='') {
  const tag=el.tagName.toUpperCase();
  const def=blockDefinition(tag);
  let blockStyle=mergeStyle(baseStyle,{size:def.size,bold:def.bold||baseStyle.bold,italic:def.italic||baseStyle.italic});
  blockStyle=inlineStyleFromNode(el,blockStyle);
  const runs=[];
  collectRuns(el,blockStyle,runs);
  if (listPrefix) runs.unshift({text:listPrefix,style:mergeStyle(blockStyle,{bold:false})});
  return {type:def.type,runs,before:def.before,after:def.after};
}
function collapseBlankBlocks(blocks) {
  const out=[];
  for (const block of blocks) {
    if (block.type==='spacer') {
      if (out.at(-1)?.type==='spacer') out[out.length-1].height=Math.max(out.at(-1).height,block.height);
      else out.push(block);
      continue;
    }
    out.push(block);
  }
  while(out[0]?.type==='spacer') out.shift();
  while(out.at(-1)?.type==='spacer') out.pop();
  return out;
}
function appendElementBlocks(node, base, blocks) {
  if (node.nodeType===Node.TEXT_NODE) {
    const text=String(node.nodeValue||'').replace(/\u00a0/g,' ');
    if(text.trim()) blocks.push({type:'paragraph',runs:[{text,style:base}],before:0,after:3});
    return;
  }
  if(node.nodeType!==Node.ELEMENT_NODE) return;
  const tag=node.tagName.toUpperCase();
  if(['SCRIPT','STYLE','NOSCRIPT'].includes(tag)) return;
  if(elementIsVisuallyEmpty(node)) { blocks.push({type:'spacer',height:7}); return; }
  if(tag==='UL' || tag==='OL') {
    let index=1;
    [...node.children].forEach(child=>{
      if(child.tagName?.toUpperCase()!=='LI') return;
      const prefix=tag==='OL'?`${index++}. `:'• ';
      blocks.push(makeBlockFromElement(child,base,prefix));
    });
    return;
  }
  if(['P','DIV','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE','PRE'].includes(tag)) {
    blocks.push(makeBlockFromElement(node,base));
    return;
  }
  const runs=[]; collectRuns(node,base,runs);
  if(runs.some(run=>String(run.text||'').trim())) blocks.push({type:'paragraph',runs,before:0,after:3});
}
function noteHtmlToBlocks(note) {
  const html=String(note?.conteudo||'').trim();
  const base=normalizeInlineStyle({size:11,color:DEFAULT_TEXT_COLOR});
  if(!html) {
    const text=String(note?.conteudoTexto||'').replace(/\r\n?/g,'\n').trim();
    if(!text) return [];
    const blocks=[];
    text.split('\n').forEach(line=>{
      if(!line.trim()) blocks.push({type:'spacer',height:7});
      else blocks.push({type:'paragraph',runs:[{text:line,style:base}],before:0,after:3});
    });
    return collapseBlankBlocks(blocks);
  }
  const holder=document.createElement('div');
  holder.innerHTML=html;
  const blocks=[];
  [...holder.childNodes].forEach(node=>appendElementBlocks(node,base,blocks));
  return collapseBlankBlocks(blocks);
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
    else if(/\s/.test(ch)) units+=0.34;
    else units+=0.53;
  }
  return units*size*(bold?1.035:1);
}
function tokenizeRuns(runs){
  const tokens=[];
  for(const run of runs){
    const source=String(run.text||'').replace(/\r\n?/g,'\n');
    const parts=source.match(/\n|[^\S\n]*[^\s\n]+|[^\S\n]+/g)||[];
    for(const part of parts){
      if(part==='\n') tokens.push({newline:true,style:run.style});
      else tokens.push({text:part,style:run.style});
    }
  }
  return tokens;
}
function layoutBlock(block,maxWidth=CONTENT_W){
  const tokens=tokenizeRuns(block.runs||[]);
  const lines=[]; let line=[]; let width=0; let maxSize=11;
  const flush=()=>{lines.push({runs:line,width,maxSize});line=[];width=0;maxSize=11;};
  for(const token of tokens){
    if(token.newline){flush();continue;}
    let text=token.text;
    const style=normalizeInlineStyle(token.style);
    if(!line.length) text=text.replace(/^\s+/, '');
    if(!text) continue;
    const w=estimateWidth(text,style.size,style.bold);
    if(line.length && width+w>maxWidth && text.trim()) {
      flush();
      text=text.replace(/^\s+/, '');
    }
    if(!text) continue;
    const finalWidth=estimateWidth(text,style.size,style.bold);
    line.push({text,style,width}); width+=finalWidth; maxSize=Math.max(maxSize,style.size);
  }
  if(line.length||!lines.length) flush();
  return lines;
}

function buildDocumentItems(materia,notes){
  const items=[];
  items.push({kind:'coverTitle',text:'Caderno de Anotações',size:21,bold:true,before:0,after:3,color:TITLE});
  items.push({kind:'coverSubtitle',text:materia,size:15,bold:true,before:0,after:2,color:ACCENT});
  items.push({kind:'meta',text:`Concurso: ${String(currentConcurso||'Concurso').trim()}`,size:9,bold:false,before:0,after:14,color:MUTED});
  notes.forEach((note,index)=>{
    if(index) items.push({kind:'separator',before:7,after:10});
    items.push({kind:'noteTitle',text:note.titulo||note.assunto||`Nota ${index+1}`,size:14,bold:true,before:0,after:3,color:TITLE});
    if(note.assunto&&note.assunto!==note.titulo) items.push({kind:'meta',text:`Assunto: ${note.assunto}`,size:9,bold:true,before:0,after:1,color:ACCENT});
    if(note.data) items.push({kind:'meta',text:`Editado em ${note.data}`,size:8.5,bold:false,before:0,after:7,color:'#778899'});
    noteHtmlToBlocks(note).forEach(block=>items.push({kind:'rich',block}));
  });
  return items;
}
function paginate(materia,notes){
  const pages=[]; let current=[]; let y=TOP;
  const pushPage=()=>{pages.push(current);current=[];y=TOP;};
  const ensure=height=>{if(y-height<BOTTOM&&current.length)pushPage();};
  for(const item of buildDocumentItems(materia,notes)){
    if(item.kind==='separator'){
      ensure(24); y-=item.before||0; current.push({kind:'rule',y}); y-=item.after||0; continue;
    }
    if(item.kind!=='rich'){
      const style=normalizeInlineStyle({size:item.size,bold:item.bold,color:item.color});
      const lines=layoutBlock({runs:[{text:item.text,style}]},CONTENT_W);
      const h=(item.before||0)+(item.after||0)+lines.reduce((n,l)=>n+Math.max(12,l.maxSize*1.35),0);
      ensure(h); y-=item.before||0;
      for(const line of lines){current.push({kind:'line',runs:line.runs,y,maxSize:line.maxSize});y-=Math.max(12,line.maxSize*1.35);}
      y-=item.after||0; continue;
    }
    const block=item.block;
    if(block.type==='spacer'){ensure(block.height||7);y-=Math.min(10,Math.max(4,block.height||7));continue;}
    y-=Math.min(10,Math.max(0,block.before||0));
    const indent=block.type==='quote'?18:block.type==='list'?10:0;
    const lines=layoutBlock(block,CONTENT_W-indent);
    for(const line of lines){
      const leading=Math.max(12,line.maxSize*1.32);
      ensure(leading+(block.after||0));
      current.push({kind:'line',runs:line.runs,y,maxSize:line.maxSize,indent,quote:block.type==='quote'});
      y-=leading;
    }
    y-=Math.min(10,Math.max(0,block.after||0));
  }
  if(current.length||!pages.length) pages.push(current);
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
    cmds.push(`${rgb(pdfColor(ACCENT))} RG 1.2 w ${MARGIN_X} 806 m ${PAGE_W-MARGIN_X} 806 l S`);
    page.forEach(item=>{
      if(item.kind==='rule') {cmds.push(`${rgb(pdfColor('#d8e2e8'))} RG 0.7 w ${MARGIN_X} ${item.y.toFixed(1)} m ${PAGE_W-MARGIN_X} ${item.y.toFixed(1)} l S`);return;}
      if(item.quote) cmds.push(`${rgb(pdfColor('#58cfc7'))} RG 2 w ${(MARGIN_X+4).toFixed(1)} ${(item.y+3).toFixed(1)} m ${(MARGIN_X+4).toFixed(1)} ${(item.y-item.maxSize*1.2).toFixed(1)} l S`);
      for(const run of item.runs){
        const s=normalizeInlineStyle(run.style); const x=MARGIN_X+(item.indent||0)+(run.width||0); const color=pdfColor(s.color);
        cmds.push(`BT /${fontKey(s)} ${s.size.toFixed(2)} Tf ${rgb(color)} rg ${x.toFixed(1)} ${item.y.toFixed(1)} Td (${toPdfText(run.text)}) Tj ET`);
        if(s.underline&&String(run.text).trim()){
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
    else add(String(obj||'<<>>')+'\n');
    add('endobj\n');
  }
  const xref=offset;add(`xref\n0 ${maxId+1}\n0000000000 65535 f \n`);
  for(let id=1;id<=maxId;id++) add(`${String(offsets[id]).padStart(10,'0')} 00000 n \n`);
  add(`trailer\n<< /Size ${maxId+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const total=chunks.reduce((n,c)=>n+c.length,0),joined=new Uint8Array(total);let pos=0;chunks.forEach(c=>{joined.set(c,pos);pos+=c.length;});
  return new Blob([joined],{type:'application/pdf'});
}

async function exportRich(){
  const materia=String($('notesMateriaSelect')?.value||'').trim();
  if(!materia)return notice('Selecione uma matéria antes de exportar.');
  let notes=[];
  try{const metadata=getConcursosMetadata();notes=(metadata?.[currentConcurso]?.structuredNotes||[]).filter(note=>String(note?.materia||'').trim()===materia);}catch(_){notes=[];}
  if(!notes.length)return notice(`Não há anotações em “${materia}” para exportar.`);
  try{
    const blob=makeRichPdfBlob(materia,notes);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${safeName(currentConcurso)}_${safeName(materia)}_anotacoes.pdf`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1600);
  }catch(error){console.error('[Rich notes export]',error);await notice(`Não foi possível gerar o PDF formatado: ${error.message}`,'Falha na exportação');}
}

function selectionStorageKey(){
  const userId=String(global.currentUser?.id||global.currentUser?.email||'anon');
  const concurso=String(global.currentConcurso||'Concurso Geral');
  return `notes_selected_materia:${userId}:${concurso}`;
}
function readSavedMateria(){try{return String(localStorage.getItem(selectionStorageKey())||'').trim();}catch(_){return '';}}
function saveSelectedMateria(value){
  const materia=String(value||'').trim();
  if(!materia)return;
  try{localStorage.setItem(selectionStorageKey(),materia);}catch(_){ }
}
function restoreSelectedMateria(preferred=''){
  const select=$('notesMateriaSelect');
  if(!select||!select.options?.length)return false;
  const desired=String(preferred||readSavedMateria()||'').trim();
  if(!desired)return false;
  if(![...select.options].some(option=>option.value===desired))return false;
  if(select.value!==desired){select.value=desired;if(typeof global.renderNotesList==='function')global.renderNotesList();}
  return true;
}
function scheduleRestore(preferred=''){
  clearTimeout(notesSelectionRestoreTimer);
  notesSelectionRestoreTimer=setTimeout(()=>restoreSelectedMateria(preferred),0);
}
function installSelectionPersistence(){
  const select=$('notesMateriaSelect');
  if(!select)return false;
  if(select.dataset.selectionPersistence!=='1'){
    select.dataset.selectionPersistence='1';
    select.addEventListener('change',()=>saveSelectedMateria(select.value));
    select.addEventListener('input',()=>saveSelectedMateria(select.value));
  }
  if(notesSelectionObserver)notesSelectionObserver.disconnect();
  notesSelectionObserver=new MutationObserver(()=>scheduleRestore());
  notesSelectionObserver.observe(select,{childList:true,subtree:true});
  scheduleRestore();
  if(typeof global.loadNotesData==='function'&&!global.loadNotesData.__notesSelectionWrapped){
    originalLoadNotesData=global.loadNotesData;
    const wrapped=function(...args){
      const desired=readSavedMateria()||String($('notesMateriaSelect')?.value||'');
      const result=originalLoadNotesData.apply(this,args);
      scheduleRestore(desired);
      return result;
    };
    wrapped.__notesSelectionWrapped=true;
    global.loadNotesData=wrapped;
  }
  return true;
}

function install(){
  installSelectionPersistence();
  const wrap=$('notesIoActions'); if(!wrap)return false;
  const old=[...wrap.querySelectorAll('button')].find(btn=>/^\s*Exportar\s*$/i.test(btn.textContent||''));
  if(!old)return false;
  if(old.dataset.richExport==='1')return true;
  const button=old.cloneNode(true);button.dataset.richExport='1';button.title='Exportar em PDF preservando parágrafos, títulos e formatação';button.addEventListener('click',exportRich);old.replaceWith(button);return true;
}
function boot(){if(!install())setTimeout(boot,120);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,80));else setTimeout(boot,80);
global.addEventListener('load',()=>setTimeout(boot,120));
document.addEventListener('click',event=>{const btn=event.target.closest('button');if((btn?.getAttribute('onclick')||'').includes("switchTab('tab-anotacoes'"))setTimeout(()=>{installSelectionPersistence();scheduleRestore();},20);});

global.NotesRichExport=Object.freeze({exportRich,makeRichPdfBlob,noteHtmlToBlocks,restoreSelectedMateria,saveSelectedMateria});
})(window);

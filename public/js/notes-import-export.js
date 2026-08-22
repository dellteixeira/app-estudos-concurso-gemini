(function(global){
'use strict';

const ACCEPT = '.txt,.text,.md,.markdown,.rtf,.html,.htm,.csv,.tsv,.json,.xml,.log,.doc,.docx,.odt,.fodt,.pages';
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ZIP_EOCD = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_LOCAL = 0x04034b50;

const $ = id => document.getElementById(id);
const safeName = value => String(value || 'anotacoes')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,120) || 'anotacoes';
const htmlEscape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const stripExt = name => String(name || 'Documento').replace(/\.[^.]+$/,'').trim() || 'Documento';
const extension = name => (String(name || '').match(/\.([^.]+)$/)?.[1] || '').toLowerCase();

function notice(message, title='Anotações') {
  if (typeof appNotice === 'function') return appNotice(message,{title});
  alert(message);
  return Promise.resolve();
}

function getSelectedMateria() {
  return String($('notesMateriaSelect')?.value || '').trim();
}

function getCurrentNotes() {
  try {
    const metadata = getConcursosMetadata();
    const notes = metadata?.[currentConcurso]?.structuredNotes;
    return Array.isArray(notes) ? notes : [];
  } catch (_) { return []; }
}

function notePlainText(note) {
  if (note?.conteudoTexto) return String(note.conteudoTexto).trim();
  const holder = document.createElement('div');
  holder.innerHTML = String(note?.conteudo || '');
  return (holder.innerText || holder.textContent || '').replace(/\u00a0/g,' ').trim();
}

function addStyles() {
  if ($('notesImportExportStyles')) return;
  const style = document.createElement('style');
  style.id = 'notesImportExportStyles';
  style.textContent = `
    .notes-io-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-left:auto}
    .notes-io-btn{min-width:110px}
    .notes-io-import-input{display:none!important}
    @media(max-width:700px){.notes-io-actions{width:100%;margin-left:0}.notes-io-actions .btn{flex:1 1 30%;min-width:96px}}
  `;
  document.head.appendChild(style);
}

function findIncludeButton() {
  const tab = $('tab-anotacoes') || document;
  return [...tab.querySelectorAll('button')].find(btn => /incluir\s+nota/i.test(btn.textContent || '')) || null;
}

function ensureActions() {
  addStyles();
  if ($('notesIoActions')) return;
  const include = findIncludeButton();
  if (!include) return;
  const wrap = document.createElement('div');
  wrap.id = 'notesIoActions';
  wrap.className = 'notes-io-actions';
  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'btn btn-secondary notes-io-btn';
  exportBtn.textContent = 'Exportar';
  exportBtn.title = 'Exportar as anotações da matéria selecionada em PDF';
  exportBtn.addEventListener('click', exportSelectedMateriaPdf);
  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'btn btn-secondary notes-io-btn';
  importBtn.textContent = 'Importar';
  importBtn.title = 'Importar documentos de texto para a matéria selecionada';
  importBtn.addEventListener('click', () => $('notesImportFileInput')?.click());
  const input = document.createElement('input');
  input.type = 'file';
  input.id = 'notesImportFileInput';
  input.className = 'notes-io-import-input';
  input.accept = ACCEPT;
  input.multiple = true;
  input.addEventListener('change', handleImportFiles);
  const parent = include.parentElement;
  if (!parent) return;
  parent.insertBefore(wrap, include);
  wrap.append(importBtn, exportBtn, include, input);
}

function normalizePdfChar(ch) {
  const map = {'–':'-','—':'-','“':'"','”':'"','‘':"'",'’':"'",'…':'...','•':'-','→':'->','←':'<-','º':'º','ª':'ª','€':'EUR'};
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
function wrapText(text, maxChars=88) {
  const paras = String(text || '').replace(/\r\n?/g,'\n').split('\n');
  const lines = [];
  for (const para of paras) {
    const trimmed = para.trim();
    if (!trimmed) { lines.push(''); continue; }
    const words = trimmed.split(/\s+/);
    let line = '';
    for (const word of words) {
      if (!line) { line = word; continue; }
      if ((line + ' ' + word).length <= maxChars) line += ' ' + word;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines;
}
function makePdfBlob(materia, notes) {
  const pages = [];
  let lines = [];
  const pushLine = (text='', size=11, bold=false, gap=0) => {
    const wrapped = wrapText(text, size >= 16 ? 62 : size >= 13 ? 76 : 92);
    wrapped.forEach(line => lines.push({text:line,size,bold,gap:0}));
    if (gap) lines.push({text:'',size:6,bold:false,gap});
  };
  pushLine(`Anotações — ${materia}`,18,true,8);
  pushLine(`Concurso: ${String(currentConcurso || 'Concurso').trim()}`,10,false,10);
  notes.forEach((note,index) => {
    if (index) lines.push({text:'',size:8,bold:false,gap:8});
    pushLine(note.titulo || note.assunto || `Nota ${index+1}`,14,true,2);
    if (note.assunto && note.assunto !== note.titulo) pushLine(`Assunto: ${note.assunto}`,10,false,2);
    if (note.data) pushLine(`Editado em ${note.data}`,9,false,5);
    pushLine(notePlainText(note),11,false,4);
  });
  const pageHeight = 842, top = 792, bottom = 48;
  let cursor = top, current = [];
  for (const item of lines) {
    const leading = Math.max(12, item.size * 1.35) + (item.gap || 0);
    if (cursor - leading < bottom && current.length) { pages.push(current); current=[]; cursor=top; }
    current.push({...item,y:cursor}); cursor -= leading;
  }
  if (current.length || !pages.length) pages.push(current);

  const objects = [];
  const fontRegularId = 3, fontBoldId = 4;
  const pageIds = [], contentIds = [];
  for (let i=0;i<pages.length;i++) { pageIds.push(5+i*2); contentIds.push(6+i*2); }
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[fontRegularId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[fontBoldId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((page,idx) => {
    const commands = page.map(item => `BT /${item.bold?'F2':'F1'} ${item.size} Tf 48 ${item.y.toFixed(1)} Td (${toPdfText(item.text)}) Tj ET`).join('\n');
    const stream = latin1Bytes(commands);
    objects[pageIds[idx]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentIds[idx]} 0 R >>`;
    objects[contentIds[idx]] = {stream};
  });
  const maxId = Math.max(...Object.keys(objects).map(Number));
  const chunks = [];
  let offset = 0;
  const add = str => { const bytes=latin1Bytes(str); chunks.push(bytes); offset += bytes.length; };
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const offsets = new Array(maxId+1).fill(0);
  for (let id=1;id<=maxId;id++) {
    offsets[id] = offset;
    add(`${id} 0 obj\n`);
    const obj = objects[id];
    if (obj && obj.stream) {
      add(`<< /Length ${obj.stream.length} >>\nstream\n`); chunks.push(obj.stream); offset += obj.stream.length; add('\nendstream\n');
    } else add(String(obj || '<<>>') + '\n');
    add('endobj\n');
  }
  const xref = offset;
  add(`xref\n0 ${maxId+1}\n0000000000 65535 f \n`);
  for (let id=1;id<=maxId;id++) add(`${String(offsets[id]).padStart(10,'0')} 00000 n \n`);
  add(`trailer\n<< /Size ${maxId+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const total = chunks.reduce((n,c)=>n+c.length,0), joined = new Uint8Array(total);
  let pos=0; chunks.forEach(c=>{joined.set(c,pos);pos+=c.length;});
  return new Blob([joined],{type:'application/pdf'});
}

async function exportSelectedMateriaPdf() {
  const materia = getSelectedMateria();
  if (!materia) return notice('Selecione uma matéria antes de exportar.');
  const notes = getCurrentNotes().filter(note => String(note?.materia || '').trim() === materia);
  if (!notes.length) return notice(`Não há anotações em “${materia}” para exportar.`);
  try {
    const blob = makePdfBlob(materia, notes);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName(currentConcurso)}_${safeName(materia)}_anotacoes.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  } catch (error) {
    console.error('[Notes export]', error);
    await notice(`Não foi possível gerar o PDF: ${error.message}`,'Falha na exportação');
  }
}

function decodeTextBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0]===0xFF && bytes[1]===0xFE) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0]===0xFE && bytes[1]===0xFF) {
    const swapped = new Uint8Array(bytes.length-2);
    for(let i=2;i+1<bytes.length;i+=2){swapped[i-2]=bytes[i+1];swapped[i-1]=bytes[i];}
    return new TextDecoder('utf-16le').decode(swapped);
  }
  return new TextDecoder('utf-8',{fatal:false}).decode(bytes).replace(/^\uFEFF/,'');
}
function xmlToText(xml, kind='xml') {
  let source = String(xml || '');
  if (kind==='docx') source = source.replace(/<w:tab\b[^>]*\/>/gi,'\t').replace(/<w:br\b[^>]*\/>/gi,'\n').replace(/<\/w:p>/gi,'\n').replace(/<\/w:tr>/gi,'\n');
  if (kind==='odt') source = source.replace(/<text:tab\b[^>]*\/>/gi,'\t').replace(/<text:line-break\b[^>]*\/>/gi,'\n').replace(/<\/text:(?:p|h)>/gi,'\n');
  const doc = new DOMParser().parseFromString(source,'application/xml');
  if (doc.querySelector('parsererror')) {
    const holder=document.createElement('div'); holder.innerHTML=source.replace(/<[^>]+>/g,' '); return (holder.textContent||'').replace(/[ \t]+\n/g,'\n').trim();
  }
  return (doc.documentElement?.textContent || '').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n\s*\n\s*\n+/g,'\n\n').trim();
}
function htmlToText(html) {
  const doc = new DOMParser().parseFromString(String(html||''),'text/html');
  doc.querySelectorAll('script,style,noscript').forEach(el=>el.remove());
  return (doc.body?.innerText || doc.body?.textContent || '').replace(/\u00a0/g,' ').trim();
}
function rtfToText(rtf) {
  return String(rtf||'')
    .replace(/\\par[d]?\b/g,'\n').replace(/\\line\b/g,'\n').replace(/\\tab\b/g,'\t')
    .replace(/\\'([0-9a-fA-F]{2})/g,(_,hex)=>String.fromCharCode(parseInt(hex,16)))
    .replace(/\\u(-?\d+)\??/g,(_,n)=>String.fromCharCode(Number(n)<0?Number(n)+65536:Number(n)))
    .replace(/\\[a-zA-Z]+-?\d* ?/g,'').replace(/[{}]/g,'').replace(/\\([\\{}])/g,'$1')
    .replace(/\r\n?/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}

function findEocd(bytes) {
  for (let i=Math.max(0,bytes.length-0x10016);i<=bytes.length-22;i++) {
    const p = bytes.length-22-(i-Math.max(0,bytes.length-0x10016));
    if (p>=0 && new DataView(bytes.buffer,bytes.byteOffset+p,4).getUint32(0,true)===ZIP_EOCD) return p;
  }
  return -1;
}
async function unzipEntry(buffer, wantedNames) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  const eocd = findEocd(bytes); if (eocd<0) throw new Error('Arquivo ZIP/Office inválido.');
  const count=view.getUint16(eocd+10,true), centralOffset=view.getUint32(eocd+16,true);
  let pos=centralOffset;
  for(let i=0;i<count;i++){
    if(view.getUint32(pos,true)!==ZIP_CENTRAL) break;
    const method=view.getUint16(pos+10,true), compSize=view.getUint32(pos+20,true), nameLen=view.getUint16(pos+28,true), extraLen=view.getUint16(pos+30,true), commentLen=view.getUint16(pos+32,true), localOffset=view.getUint32(pos+42,true);
    const name=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+nameLen));
    if(wantedNames.includes(name)){
      if(view.getUint32(localOffset,true)!==ZIP_LOCAL) throw new Error('Entrada compactada inválida.');
      const localName=view.getUint16(localOffset+26,true), localExtra=view.getUint16(localOffset+28,true), dataStart=localOffset+30+localName+localExtra;
      const compressed=bytes.slice(dataStart,dataStart+compSize);
      if(method===0) return compressed;
      if(method===8 && typeof DecompressionStream==='function'){
        const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      }
      throw new Error('Este navegador não consegue descompactar este documento.');
    }
    pos += 46+nameLen+extraLen+commentLen;
  }
  return null;
}
function extractLegacyDocText(buffer) {
  const bytes=new Uint8Array(buffer);
  const utf16=[];
  for(let i=0;i+1<bytes.length;i+=2){const c=bytes[i]|(bytes[i+1]<<8);utf16.push((c===9||c===10||c===13||c>=32&&c<0xD800)?String.fromCharCode(c):' ');}
  const ansi=[]; for(const b of bytes) ansi.push((b===9||b===10||b===13||b>=32&&b<=255)?String.fromCharCode(b):' ');
  const clean=s=>s.join('').replace(/[ \t]{3,}/g,' ').replace(/\s*\n\s*/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  const a=clean(utf16), b=clean(ansi);
  const score=s=>(s.match(/[A-Za-zÀ-ÿ]{4,}/g)||[]).length;
  return score(a)>=score(b)?a:b;
}
async function readImportFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error('Arquivo maior que 20 MB.');
  const ext=extension(file.name), buffer=await file.arrayBuffer();
  if (['txt','text','md','markdown','csv','tsv','json','xml','log','fodt'].includes(ext)) {
    const text=decodeTextBuffer(buffer); return ext==='fodt'?xmlToText(text,'odt'):text.trim();
  }
  if (['html','htm'].includes(ext)) return htmlToText(decodeTextBuffer(buffer));
  if (ext==='rtf') return rtfToText(decodeTextBuffer(buffer));
  if (ext==='docx') {
    const entry=await unzipEntry(buffer,['word/document.xml']); if(!entry) throw new Error('O DOCX não contém word/document.xml.');
    return xmlToText(new TextDecoder('utf-8').decode(entry),'docx');
  }
  if (ext==='odt') {
    const entry=await unzipEntry(buffer,['content.xml']); if(!entry) throw new Error('O ODT não contém content.xml.');
    return xmlToText(new TextDecoder('utf-8').decode(entry),'odt');
  }
  if (ext==='pages') {
    const entry=await unzipEntry(buffer,['index.xml','Index/Document.iwa']);
    if(entry && String.fromCharCode(...entry.slice(0,5))?.includes('<?xml')) return xmlToText(new TextDecoder('utf-8').decode(entry),'xml');
    throw new Error('Arquivos Pages atuais usam um formato binário proprietário. No Pages, exporte como DOCX, RTF ou TXT e importe novamente.');
  }
  if (ext==='doc') {
    const text=extractLegacyDocText(buffer);
    if (text.length < 30) throw new Error('Não foi possível extrair texto suficiente deste DOC antigo. Salve-o como DOCX ou RTF e tente novamente.');
    return text;
  }
  throw new Error(`Formato .${ext || '?'} não suportado.`);
}

function textToStoredHtml(text) {
  return String(text||'').replace(/\r\n?/g,'\n').split(/\n{2,}/).map(p=>`<p>${htmlEscape(p).replace(/\n/g,'<br>')}</p>`).join('');
}
async function handleImportFiles(event) {
  const input=event.target, files=[...(input.files||[])]; input.value='';
  if(!files.length) return;
  const materia=getSelectedMateria();
  if(!materia) return notice('Selecione a matéria que receberá as anotações antes de importar.');
  const successes=[], failures=[];
  for(const file of files){
    try{
      const text=(await readImportFile(file)).replace(/\u0000/g,'').trim();
      if(!text) throw new Error('Nenhum texto legível foi encontrado.');
      successes.push({file,text});
    }catch(error){failures.push(`${file.name}: ${error.message}`);}
  }
  if(successes.length){
    const metadata=getConcursosMetadata();
    if(!metadata[currentConcurso]) metadata[currentConcurso]={};
    if(!Array.isArray(metadata[currentConcurso].structuredNotes)) metadata[currentConcurso].structuredNotes=[];
    const assuntos=new Set((editalItems||[]).filter(i=>i.materia===materia).map(i=>String(i.assunto||'').trim()).filter(Boolean));
    const now=new Date(), stamp=now.toLocaleDateString('pt-BR')+' '+now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    successes.forEach(({file,text})=>{
      const title=stripExt(file.name), assunto=assuntos.has(title)?title:'';
      metadata[currentConcurso].structuredNotes.push({materia,assunto,titulo:title,conteudo:textToStoredHtml(text),conteudoTexto:text,formato:'html',data:stamp,source_type:'imported_text',source_filename:file.name});
    });
    await saveConcursosMetadata(metadata);
    if($('notesMateriaSelect')) $('notesMateriaSelect').value=materia;
    if(typeof loadNotesData==='function') loadNotesData(); else if(typeof renderNotesList==='function') renderNotesList();
  }
  let msg=successes.length?`${successes.length} arquivo${successes.length===1?'':'s'} importado${successes.length===1?'':'s'} para “${materia}”.`:'Nenhum arquivo foi importado.';
  if(failures.length) msg += `\n\nFalhas:\n${failures.join('\n')}`;
  await notice(msg,failures.length?'Importação concluída com avisos':'Importação concluída');
}

function boot(){ensureActions();}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0)); else setTimeout(boot,0);
global.addEventListener('load',()=>setTimeout(boot,50));
document.addEventListener('click',event=>{const btn=event.target.closest('button');if((btn?.getAttribute('onclick')||'').includes("switchTab('tab-anotacoes'")) setTimeout(boot,30);});

global.NotesImportExport=Object.freeze({exportSelectedMateriaPdf,readImportFile,makePdfBlob});
})(window);

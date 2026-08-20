import fs from 'node:fs';

const p='public/index.html';
let s=fs.readFileSync(p,'utf8');
const old=s;
s=s.replace(/<button([^>]*?)onclick="PdfStudyReader\.exportToNotes\(\)"([^>]*)>[^<]*Exportar[^<]*<\/button>/i,
  '<button$1onclick="PdfStudyReader.exportAnnotations(\'doc\')"$2>↑ Exportar DOC</button><button class="pdf-reader-side-action" type="button" onclick="PdfStudyReader.exportAnnotations(\'txt\')" title="Exportar anotações em TXT">↑ Exportar TXT</button>');
if(s===old && !s.includes('Exportar DOC')) throw new Error('Botão legado de exportação não localizado.');
fs.writeFileSync(p,s);
console.log('V10.24 export controls normalized.');

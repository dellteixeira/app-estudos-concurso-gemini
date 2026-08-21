import fs from 'node:fs';
const path='scripts/temp-v10-25-6-gemini-parser.mjs';
let source=fs.readFileSync(path,'utf8');
const start=source.indexOf('  const readField = field => {');
const end=source.indexOf('\n\n  const question = cleanText',start);
if(start<0||end<0) throw new Error('Bloco readField não encontrado');
const block=`  const readField = field => {
    const markers = ['"' + field + '"', "'" + field + "'", field];
    let markerIndex = -1, markerLength = 0;
    const lower = relaxed.toLowerCase();
    for (const marker of markers) {
      markerIndex = lower.indexOf(marker.toLowerCase());
      if (markerIndex >= 0) { markerLength = marker.length; break; }
    }
    if (markerIndex < 0) return '';
    const colonIndex = relaxed.indexOf(':', markerIndex + markerLength);
    if (colonIndex < 0) return '';
    const rest = relaxed.slice(colonIndex + 1).trim();
    const quote = rest[0];
    if (quote === '"' || quote === "'") {
      const endQuote = rest.indexOf(quote, 1);
      return endQuote > 0 ? rest.slice(1, endQuote) : rest.slice(1);
    }
    const lineEnd = rest.search(/[\\n}]/);
    return (lineEnd >= 0 ? rest.slice(0, lineEnd) : rest).replace(/,\\s*$/, '').trim();
  };`;
source=source.slice(0,start)+block+source.slice(end);
fs.writeFileSync(path,source);
fs.rmSync(new URL(import.meta.url),{force:true});

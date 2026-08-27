const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(p,'utf8');
const write=(p,t)=>fs.writeFileSync(p,t);
function sub1(text,pattern,replacement,label){
  const matches=text.match(pattern);
  if(!matches) throw new Error(`${label}: trecho não encontrado`);
  const next=text.replace(pattern,replacement);
  if(next===text) throw new Error(`${label}: substituição não aplicada`);
  return next;
}

// Cronograma Mensal: o painel passa a representar apenas pendências atrasadas.
{
  const p='public/index.html';
  let t=read(p);
  t=sub1(t,/<span class="delayed-title">Revisões \/ Matérias Agendadas<\/span>/,
    '<span class="delayed-title">Matérias Atrasadas</span>','título Matérias Atrasadas');
  t=sub1(t,/\s*<div class="filter-tabs">\s*<button class="filter-tab active" data-inline-click="ih-011"[^>]*>Hoje<\/button>\s*<button class="filter-tab" data-inline-click="ih-012"[^>]*>Atrasadas<\/button>\s*<button class="filter-tab" data-inline-click="ih-013"[^>]*>Próximas<\/button>\s*<\/div>\s*/s,'\n','abas Hoje/Atrasadas/Próximas');
  t=sub1(t,/\s*<div class="pdf-library-selection-row">\s*<button class="btn btn-secondary" id="btnPdfSelectionMode"[^>]*>Selecionar<\/button>\s*<\/div>\s*/s,'\n','linha isolada Selecionar');
  write(p,t);
}

{
  const p='public/js/app-core.js';
  let t=read(p);
  t=sub1(t,/^\s*let currentDelayedFilter = 'hoje';\s*\r?\n/m,'','estado currentDelayedFilter');
  t=sub1(t,/\s*\/\/ Atualização coordenada: calendário, abas Hoje\/Atrasadas\/Próximas,\s*\r?\n\s*\/\/ Meta Diária, Pomodoro, Horas por Matéria e Progresso Geral\.\s*\r?\n\s*currentDelayedFilter = 'hoje';\s*\r?\n\s*document\.querySelectorAll\('\.filter-tab'\)\.forEach\(\(tb, idx\) => tb\.classList\.toggle\('active', idx === 0\)\);\s*/s,
    '\n            // Atualização coordenada: calendário, matérias atrasadas,\n            // Meta Diária, Pomodoro, Horas por Matéria e Progresso Geral.\n','reset de abas');
  t=sub1(t,/\r?\n\s*function filterDelayedList\(type, btn\) \{\s*\r?\n\s*currentDelayedFilter = type;\s*\r?\n\s*document\.querySelectorAll\('\.filter-tab'\)\.forEach\(tb => tb\.classList\.remove\('active'\)\);\s*\r?\n\s*if \(btn\) btn\.classList\.add\('active'\);\s*\r?\n\s*renderDelayedPanel\(\);\s*\r?\n\s*\}\s*\r?\n/s,'\n','função filterDelayedList');
  t=sub1(t,/const displayList = scheduleWithPending\.filter\(group => \{\s*if \(!group\.items\.length\) return false;\s*if \(currentDelayedFilter === 'hoje'\) return group\.date === todayStr;\s*if \(currentDelayedFilter === 'atrasadas'\) return group\.date < todayStr;\s*if \(currentDelayedFilter === 'proximas'\) return group\.date > todayStr;\s*return false;\s*\}\);/s,
    "const displayList = scheduleWithPending.filter(group =>\n                group.items.length && group.date < todayStr\n            );",'filtro somente atrasadas');
  if(!t.includes('Nenhum item agendado para esta aba.')) throw new Error('mensagem vazia antiga não encontrada');
  t=t.replace('Nenhum item agendado para esta aba.','Nenhuma matéria atrasada.');
  write(p,t);
}

{
  const p='public/js/app-ui.js';
  let t=read(p);
  for(const [id,type] of [['ih-011','hoje'],['ih-012','atrasadas'],['ih-013','proximas']]){
    const re=new RegExp(`^\\s*'${id}': function\\(event\\) \\{ filterDelayedList\\('${type}', this\\) \\},\\s*\\r?\\n`,'m');
    t=sub1(t,re,'',`handler ${id}`);
  }
  write(p,t);
}

{
  const p='public/js/app-pwa.js';
  let t=read(p);
  t=sub1(t,/^\s*window\.filterDelayedList = filterDelayedList;\s*\r?\n/m,'','export filterDelayedList');
  write(p,t);
}

// Biblioteca Offline: Selecionar fica imediatamente antes de Enviar.
{
  const p='public/js/pdf/pdf-offline-library-ui.js';
  let t=read(p);
  t=sub1(t,/#pdfOfflineSyncBtn,#pdfOfflineCancelBtn\{/,
    '#btnPdfSelectionMode,#pdfOfflineSyncBtn,#pdfOfflineCancelBtn{','CSS botões offline');
  t=sub1(t,/<div class="pdf-offline-actions"><button class="btn btn-secondary primary" id="pdfOfflineSyncBtn" type="button">Enviar<\/button><button class="btn btn-secondary" id="pdfOfflineCancelBtn" type="button">Cancelar fila<\/button><\/div>/,
    '<div class="pdf-offline-actions"><button class="btn btn-secondary" id="btnPdfSelectionMode" type="button" data-action="call" data-call="PdfStudyLibraryUI.toggleSelectionMode">Selecionar</button><button class="btn btn-secondary primary" id="pdfOfflineSyncBtn" type="button">Enviar</button><button class="btn btn-secondary" id="pdfOfflineCancelBtn" type="button">Cancelar fila</button></div>','ações offline');
  write(p,t);
}

// Remove os dois contratos CSS da antiga linha própria do botão Selecionar.
{
  const p='public/js/pdf/pdf-library-layout-fix.js';
  let t=read(p);
  const before=(t.match(/pdf-library-selection-row/g)||[]).length;
  t=t.replace(/\r?\n\s*\.pdf-library-selection-row(?:\s+#btnPdfSelectionMode)?\s*\{[^}]*\}/g,'');
  if(before<2 || t.includes('pdf-library-selection-row')) throw new Error(`CSS residual pdf-library-selection-row; antes=${before}`);
  write(p,t);
}

// Atualiza contratos de regressão existentes.
{
  const p='tests/library-controls-v10.60.test.cjs';
  let t=read(p);
  t=sub1(t,/test\('Selecionar fica imediatamente antes da área de seleção e da grade de PDFs',[\s\S]*?\r?\n\}\);/,
`test('Selecionar fica imediatamente antes de Enviar na Biblioteca Offline',()=>{
  assert.doesNotMatch(index,/id="btnPdfSelectionMode"/);
  assert.doesNotMatch(index,/pdf-library-selection-row/);
  const select=offlineUi.indexOf('id="btnPdfSelectionMode"');
  const send=offlineUi.indexOf('id="pdfOfflineSyncBtn"');
  const cancel=offlineUi.indexOf('id="pdfOfflineCancelBtn"');
  assert.ok(select>=0&&send>select&&cancel>send);
});`,'teste posição Selecionar');
  write(p,t);
}

{
  const p='tests/library-desktop-single-row-layout.test.cjs';
  let t=read(p);
  t=sub1(t,/test\('Selecionar possui linha própria junto à grade',[^\r\n]*\);/,
    "test('layout não mantém linha própria obsoleta para Selecionar',()=>{assert.doesNotMatch(layout,/pdf-library-selection-row/);assert.doesNotMatch(layout,/btnPdfSelectionMode/)});",'teste layout Selecionar');
  write(p,t);
}

{
  const p='tests/library-toolbar-cleanup.test.cjs';
  let t=read(p);
  t=sub1(t,/test\('Selecionar saiu do cabeçalho e ficou junto da grade',[^\r\n]*\);/,
    "test('Selecionar saiu do cabeçalho e fica na barra offline antes de Enviar',()=>{assert.doesNotMatch(index,/id=\"btnPdfSelectionMode\"/);assert.doesNotMatch(layout,/pdf-library-selection-row/)});",'teste toolbar Selecionar');
  write(p,t);
}

fs.writeFileSync('tests/calendar-overdue-only-v10.61.test.cjs',`const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const index=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const core=fs.readFileSync(path.join(root,'public/js/app-core.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'public/js/app-ui.js'),'utf8');
const pwa=fs.readFileSync(path.join(root,'public/js/app-pwa.js'),'utf8');
const start=index.indexOf('class="delayed-panel"');
const end=index.indexOf('id="delayedItemsContainer"',start);
const panel=index.slice(start,end+64);

test('Cronograma mostra Matérias Atrasadas sem tabs de período',()=>{
  assert.match(panel,/class="delayed-title">Matérias Atrasadas<\\/span>/);
  assert.doesNotMatch(panel,/class="filter-tabs"/);
  assert.doesNotMatch(panel,/>Hoje<\\/button>|>Atrasadas<\\/button>|>Próximas<\\/button>/);
  assert.doesNotMatch(index,/data-inline-click="ih-011"|data-inline-click="ih-012"|data-inline-click="ih-013"/);
});

test('código não mantém estado, função, handlers ou export das abas removidas',()=>{
  assert.doesNotMatch(core,/currentDelayedFilter|function filterDelayedList/);
  assert.doesNotMatch(ui,/filterDelayedList|'ih-011'|'ih-012'|'ih-013'/);
  assert.doesNotMatch(pwa,/window\\.filterDelayedList/);
});

test('painel renderiza exclusivamente grupos vencidos',()=>{
  assert.match(core,/group\\.items\\.length && group\\.date < todayStr/);
  assert.match(core,/Nenhuma matéria atrasada\\./);
});
`);

// Versão 10.61.0 e cache-busters. Preserva marcadores source exigidos pelo pipeline.
require('node:child_process').execFileSync(process.execPath,['scripts/release-version.mjs','10.61.0'],{stdio:'inherit'});
{
  const p='public/version.json';
  const data=JSON.parse(read(p));
  data.version='10.61.0';
  data.build='source';
  data.commit='source';
  write(p,JSON.stringify(data,null,2)+'\n');
}
{
  const p='config/app-assets.json';
  const data=JSON.parse(read(p));
  if(Object.hasOwn(data,'version')) data.version='10.61.0';
  write(p,JSON.stringify(data,null,2)+'\n');
}
for(const p of ['public/js/app-pwa.js','public/js/app-state.js']){
  write(p,read(p).replaceAll('10.60.0','10.61.0'));
}

const merged=['public/index.html','public/js/app-core.js','public/js/app-ui.js','public/js/app-pwa.js'].map(read).join('\n');
for(const bad of ['currentDelayedFilter','filterDelayedList']) if(merged.includes(bad)) throw new Error(`referência obsoleta remanescente: ${bad}`);
if(read('public/index.html').includes('pdf-library-selection-row')||read('public/js/pdf/pdf-library-layout-fix.js').includes('pdf-library-selection-row')) throw new Error('linha própria obsoleta do Selecionar ainda presente');
console.log('Patch estrutural v10.61.0 aplicado com sucesso.');

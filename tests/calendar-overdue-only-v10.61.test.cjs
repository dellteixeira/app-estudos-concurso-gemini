const test=require('node:test');
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
  assert.match(panel,/class="delayed-title">Matérias Atrasadas<\/span>/);
  assert.doesNotMatch(panel,/class="filter-tabs"/);
  assert.doesNotMatch(panel,/>Hoje<\/button>|>Atrasadas<\/button>|>Próximas<\/button>/);
  assert.doesNotMatch(index,/data-inline-click="ih-011"|data-inline-click="ih-012"|data-inline-click="ih-013"/);
});

test('código não mantém estado, função, handlers ou export das abas removidas',()=>{
  assert.doesNotMatch(core,/currentDelayedFilter|function filterDelayedList/);
  assert.doesNotMatch(ui,/filterDelayedList|'ih-011'|'ih-012'|'ih-013'/);
  assert.doesNotMatch(pwa,/window\.filterDelayedList/);
});

test('painel renderiza exclusivamente grupos vencidos',()=>{
  assert.match(core,/group\.items\.length && group\.date < todayStr/);
  assert.match(core,/Nenhuma matéria atrasada\./);
});

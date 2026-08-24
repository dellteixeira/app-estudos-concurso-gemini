import fs from 'node:fs';

const CORE='public/js/app-core.js';
const UI='public/js/app-ui.js';
const CSS='public/css/base.css';

const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s,'utf8');

function count(s,re){return (s.match(re)||[]).length;}
function replaceLiteralDisplays(src){
  const before=count(src,/\.style\.display\b/g);
  const pattern=/(document\.getElementById\([^\n;)]*\)|document\.querySelector\([^\n;)]*\)|\b[A-Za-z_$][\w$]*)\.style\.display\s*=\s*(['"])(flex|none|block|grid|inline-flex|inline-block|)\2/g;
  src=src.replace(pattern,(_,expr,_q,mode)=>`setRuntimeDisplay(${expr}, '${mode||'default'}')`);
  return {src,before,after:count(src,/\.style\.display\b/g)};
}

let core=read(CORE);
let ui=read(UI);
let css=read(CSS);

if(!core.includes('RUNTIME_STYLE_DEBT_BATCH8')){
  const anchor="        const PALETA_SOLIDAS = ['#3b82f6', '#22c55e', '#c084fc', '#f97316', '#ec4899', '#8b5cf6', '#06b6d4', '#eab308'];";
  if(!core.includes(anchor)) throw new Error('core utility anchor not found');
  const utility=`${anchor}\n\n        // RUNTIME_STYLE_DEBT_BATCH8 — estados visuais sem style attributes\n        const RUNTIME_DISPLAY_CLASSES = ['u-runtime-flex','u-runtime-block','u-runtime-grid','u-runtime-inline-flex','u-runtime-inline-block'];\n        const RUNTIME_PROGRESS_CLASSES = Array.from({length:101}, (_,i) => \`u-progress-w-\${i}\`);\n        function setRuntimeDisplay(element, mode = 'default') {\n            if (!element) return;\n            element.classList.remove(...RUNTIME_DISPLAY_CLASSES);\n            if (mode === 'none') {\n                element.hidden = true;\n                element.setAttribute('aria-hidden','true');\n                return;\n            }\n            element.hidden = false;\n            element.setAttribute('aria-hidden','false');\n            const className = { flex:'u-runtime-flex', block:'u-runtime-block', grid:'u-runtime-grid', 'inline-flex':'u-runtime-inline-flex', 'inline-block':'u-runtime-inline-block' }[mode];\n            if (className) element.classList.add(className);\n        }\n        function getProgressWidthClass(value) {\n            const pct=Math.max(0,Math.min(100,Math.round(Number(value)||0)));\n            return \`u-progress-w-\${pct}\`;\n        }\n        function setProgressWidthClass(element, value) {\n            if (!element) return;\n            element.classList.remove(...RUNTIME_PROGRESS_CLASSES);\n            element.classList.add(getProgressWidthClass(value));\n        }`;
  core=core.replace(anchor,utility);
}

// Static style attributes emitted by templates.
core=core.replace('<span style="opacity:.7">${escapeHtml(snapshot.reason || \'backup automático\')}</span>','<span class="backup-slot-reason">${escapeHtml(snapshot.reason || \'backup automático\')}</span>');
core=core.replace('<div style="margin-top:10px;"><button class="btn btn-secondary btn-sm" onclick="ignoreFlexibleRestForOpportunity()">','<div class="opportunity-empty-action"><button class="btn btn-secondary btn-sm" onclick="ignoreFlexibleRestForOpportunity()">');
core=core.replace('`<th style="width:90px;">Prioridade</th><th style="text-align:left;padding-left:1rem;">Assunto</th><th>Teoria</th><th>Questões</th>${revisionHeaders}<th>Ações</th>`','`<th class="edital-priority-col">Prioridade</th><th class="edital-subject-col">Assunto</th><th>Teoria</th><th>Questões</th>${revisionHeaders}<th>Ações</th>`');
core=core.replace('<div class="edit-selector-box" style="margin-top:12px; border-color:rgba(56,189,248,.35);">','<div class="edit-selector-box adaptive-next-study-box">');
core=core.replace('<div style="display:flex; gap:12px; align-items:center; justify-content:space-between; flex-wrap:wrap;">','<div class="adaptive-next-study-row">');
core=core.replace('<div style="min-width:220px; flex:1;">','<div class="adaptive-next-study-copy">');
core=core.replace('<strong style="color:var(--modern-blue-2);">Próximo estudo sugerido</strong>','<strong class="adaptive-next-study-title">Próximo estudo sugerido</strong>');
core=core.replace('<div style="margin-top:4px; font-size:.88rem; opacity:.88;">','<div class="adaptive-next-study-meta">');
core=core.replace('<div style="margin-top:3px; font-size:.76rem; opacity:.65;">','<div class="adaptive-next-study-help">');
core=core.replace('<strong style="color:var(--modern-blue-2);">Planejar assunto longo</strong>','<strong class="topic-plan-editor-title">Planejar assunto longo</strong>');
core=core.replace('<div style="display:flex; justify-content:flex-end; gap:7px; flex-wrap:wrap;">','<div class="topic-plan-editor-actions">');
core=core.replace(/<span class=\\"topic-plan-progress\\"><span style=\\"width:\$\{progress\.pct\}%\\"><\/span><\/span>/g,'<span class="topic-plan-progress"><span class="${getProgressWidthClass(progress.pct)}"></span></span>');

ui=ui.replace('<div style="padding:12px;color:var(--modern-muted);font-size:.84rem;">Nenhum resultado encontrado.</div>','<div class="global-search-empty">Nenhum resultado encontrado.</div>');
ui=ui.replace(/<span class=\\"retention-risk-progress\\" aria-hidden=\\"true\\"><span style=\\"width:\$\{retention\}%\\"><\/span><\/span>/g,'<span class="retention-risk-progress" aria-hidden="true"><span class="${getProgressWidthClass(retention)}"></span></span>');
ui=ui.replace("if(el) el.style.width=`${Math.max(0,Math.min(100,Number(value)||0))}%`;","if(el) setProgressWidthClass(el, value);");

const coreDisplay=replaceLiteralDisplays(core); core=coreDisplay.src;
const uiDisplay=replaceLiteralDisplays(ui); ui=uiDisplay.src;

if(!css.includes('RUNTIME_STYLE_DEBT_BATCH8')){
  css += `\n\n/* RUNTIME_STYLE_DEBT_BATCH8 — classes para estado visual sem atributos style */\n.u-runtime-flex{display:flex!important}\n.u-runtime-block{display:block!important}\n.u-runtime-grid{display:grid!important}\n.u-runtime-inline-flex{display:inline-flex!important}\n.u-runtime-inline-block{display:inline-block!important}\n.backup-slot-reason{opacity:.7}\n.opportunity-empty-action{margin-top:10px}\n.edital-priority-col{width:90px}\n.edital-subject-col{text-align:left;padding-left:1rem}\n.adaptive-next-study-box{margin-top:12px;border-color:rgba(56,189,248,.35)}\n.adaptive-next-study-row{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}\n.adaptive-next-study-copy{min-width:220px;flex:1}\n.adaptive-next-study-title,.topic-plan-editor-title{color:var(--modern-blue-2)}\n.adaptive-next-study-meta{margin-top:4px;font-size:.88rem;opacity:.88}\n.adaptive-next-study-help{margin-top:3px;font-size:.76rem;opacity:.65}\n.topic-plan-editor-actions{display:flex;justify-content:flex-end;gap:7px;flex-wrap:wrap}\n${Array.from({length:101},(_,i)=>`.u-progress-w-${i}{width:${i}%}`).join('\n')}\n/* RUNTIME_STYLE_DEBT_BATCH8_END */\n`;
}

write(CORE,core); write(UI,ui); write(CSS,css);

const remaining={
  coreStyleDisplay:count(core,/\.style\.display\b/g),
  uiStyleDisplay:count(ui,/\.style\.display\b/g),
  coreTemplateStyle:count(core,/style=\\?["']/g),
  uiTemplateStyle:count(ui,/style=\\?["']/g),
  coreStyleWidth:count(core,/\.style\.width\b/g),
  uiStyleWidth:count(ui,/\.style\.width\b/g),
  coreSetProperty:count(core,/\.style\.setProperty\b/g),
  uiSetProperty:count(ui,/\.style\.setProperty\b/g)
};
fs.writeFileSync('security/runtime-style-debt.json',JSON.stringify({batch:8,policy:'UI/non-PDF runtime styles are migrated incrementally; PDF reader geometry remains excluded.',migratedDisplay:{core:coreDisplay.before-coreDisplay.after,ui:uiDisplay.before-uiDisplay.after},remaining},null,2)+'\n');

const test=`'use strict';\nconst test=require('node:test');\nconst assert=require('node:assert/strict');\nconst fs=require('node:fs');\nconst core=fs.readFileSync('public/js/app-core.js','utf8');\nconst ui=fs.readFileSync('public/js/app-ui.js','utf8');\nconst css=fs.readFileSync('public/css/base.css','utf8');\nconst budget=JSON.parse(fs.readFileSync('security/runtime-style-debt.json','utf8'));\n\ntest('runtime display mutations are reduced and guarded',()=>{\n  assert.match(core,/RUNTIME_STYLE_DEBT_BATCH8/);\n  assert.match(core,/function setRuntimeDisplay/);\n  assert.ok(budget.migratedDisplay.core + budget.migratedDisplay.ui > 0);\n  assert.equal((core.match(/\\.style\\.display\\b/g)||[]).length,budget.remaining.coreStyleDisplay);\n  assert.equal((ui.match(/\\.style\\.display\\b/g)||[]).length,budget.remaining.uiStyleDisplay);\n});\n\ntest('dynamic percentage bars use bounded classes instead of style.width in migrated UI',()=>{\n  assert.match(core,/function setProgressWidthClass/);\n  assert.match(css,/\\.u-progress-w-100\\{width:100%\\}/);\n  assert.doesNotMatch(ui,/retention-risk-progress[^\\n]*style=/);\n  assert.doesNotMatch(core,/topic-plan-progress[^\\n]*style=/);\n});\n\ntest('known static runtime template styles are externalized',()=>{\n  assert.match(css,/\\.backup-slot-reason\\{opacity:\\.7\\}/);\n  assert.match(core,/class=\\"backup-slot-reason\\"/);\n  assert.match(ui,/global-search-empty/);\n});\n`;
write('tests/runtime-style-debt-batch8.test.cjs',test);
console.log(JSON.stringify({coreDisplay,uiDisplay,remaining},null,2));

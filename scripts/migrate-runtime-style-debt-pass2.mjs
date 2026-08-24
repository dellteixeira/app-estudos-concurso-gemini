import fs from 'node:fs';
const CORE='public/js/app-core.js', UI='public/js/app-ui.js', CSS='public/css/base.css';
let core=fs.readFileSync(CORE,'utf8');
let ui=fs.readFileSync(UI,'utf8');
let css=fs.readFileSync(CSS,'utf8');
const r=(a,b)=>{core=core.split(a).join(b)};

// Last conditional display mutation.
r("if (minutesGroup) minutesGroup.style.display = options.sessionId ? 'none' : '';","if (minutesGroup) setRuntimeDisplay(minutesGroup, options.sessionId ? 'none' : 'default');");

// Bounded percentage widths.
r('<span class="topic-plan-progress"><span style="width:${progress.pct}%"></span></span>','<span class="topic-plan-progress"><span class="${getProgressWidthClass(progress.pct)}"></span></span>');
r('<div class="day-progress-track"><div class="day-progress-fill" style="width:${completionPercent}%"></div></div>','<div class="day-progress-track"><div class="day-progress-fill ${getProgressWidthClass(completionPercent)}"></div></div>');
r('<div class="subject-hours-track"><div class="subject-hours-fill" style="width:${pct}%"></div></div>','<div class="subject-hours-track"><div class="subject-hours-fill ${getProgressWidthClass(pct)}"></div></div>');
r("progressEl.style.width = '0%';","setProgressWidthClass(progressEl, 0);");
r("progressEl.style.width = `${Math.min(100, Math.max(0, percent))}%`;","setProgressWidthClass(progressEl, percent);");

// Empty and helper states.
r('<p style="opacity:0.85; padding:1rem;">Nenhum tópico agendado para este dia.</p>','<p class="runtime-empty-state runtime-empty-state-strong">Nenhum tópico agendado para este dia.</p>');
r('<p style="opacity:0.8; padding:1rem;">Nenhuma anotação cadastrada para a matéria <strong>${escapeHtml(selectedMat)}</strong>.</p>','<p class="runtime-empty-state">Nenhuma anotação cadastrada para a matéria <strong>${escapeHtml(selectedMat)}</strong>.</p>');
r('<p style="opacity: 0.75; font-size:0.9rem;">Nenhum baralho disponível.</p>','<p class="runtime-empty-inline">Nenhum baralho disponível.</p>');
r('<p style="opacity: 0.8; padding:1rem;">Nenhum flashcard encontrado para este filtro.</p>','<p class="runtime-empty-state">Nenhum flashcard encontrado para este filtro.</p>');
r('<p style="opacity: 0.8; font-size:0.9rem;">Nenhum item agendado para esta aba.</p>','<p class="runtime-empty-inline runtime-empty-inline-strong">Nenhum item agendado para esta aba.</p>');

// Day topic badges/layout.
r('<span style="display:inline-flex; margin-left:8px; padding:2px 7px; border-radius:999px; font-size:.68rem; color:#7dd3fc; border:1px solid rgba(56,189,248,.3); background:rgba(14,165,233,.08);">Antecipado de ${formatDateKeyShort(advanceHistory.plannedDateKey)}</span>','<span class="day-topic-badge day-topic-badge-advanced">Antecipado de ${formatDateKeyShort(advanceHistory.plannedDateKey)}</span>');
r('<span style="display:block; margin-top:3px; font-size:.68rem; opacity:.58;">Estudar agora pode antecipar este tópico com reflow do futuro.</span>','<span class="day-topic-future-hint">Estudar agora pode antecipar este tópico com reflow do futuro.</span>');
r('<span style="display:inline-flex;margin-left:8px;padding:2px 7px;border-radius:999px;font-size:.68rem;color:#86efac;border:1px solid rgba(34,197,94,.35);background:rgba(34,197,94,.08);">Revisada</span>','<span class="day-topic-badge day-topic-badge-reviewed">Revisada</span>');
r('<div style="flex:1;"><strong style="color:var(--primary-blue); font-size:0.95rem;">','<div class="day-topic-main"><strong class="day-topic-title">');
r('<div id="editArea_${idx}" style="width:100%; display:none;"></div>','<div id="editArea_${idx}" class="day-topic-edit-area" hidden></div>');

// Edit/add topic forms.
r('<label style="font-size:0.82rem; font-weight:700; color:#93c5fd;">Selecione a Matéria e o Assunto do Edital:</label>','<label class="day-topic-form-label day-topic-form-label-edit">Selecione a Matéria e o Assunto do Edital:</label>');
r('<label style="font-size:0.85rem; font-weight:700; color:var(--primary-blue);">Adicionar Tópico a Este Dia (Selecione da Lista do Edital):</label>','<label class="day-topic-form-label">Adicionar Tópico a Este Dia (Selecione da Lista do Edital):</label>');
r('<div style="display:flex; gap:8px; flex-wrap:wrap;">','<div class="day-topic-form-row">');
r('style="flex:1; min-width:160px;"','class="day-topic-select day-topic-select-materia"');
r('style="flex:1; min-width:180px;"','class="day-topic-select day-topic-select-assunto"');
r('<div style="display:flex; justify-content:flex-end; gap:6px; margin-top:4px;">','<div class="day-topic-form-actions day-topic-form-actions-edit">');
r('<div style="display:flex; justify-content:flex-end; gap:6px; margin-top:6px;">','<div class="day-topic-form-actions">');

// Flashcards generated markup.
r('<span style="font-size:0.9rem; font-weight:600;">','<span class="anki-subfolder-name">');
r('<span style="font-size:0.8rem; opacity:0.8;">${count} cartões</span>','<span class="anki-subfolder-count">${count} cartões</span>');
r('<span style="color:#34d399; font-size:0.75rem;">(Caixa Aberta)</span>','<span class="anki-folder-open-badge">(Caixa Aberta)</span>');
r('<div style="display:flex; align-items:center; gap:10px;">','<div class="anki-folder-actions">');
r('<p style="margin-top:6px; color:#34d399;"><strong>R:</strong>','<p class="flashcard-answer"><strong>R:</strong>');
r('<div style="display:flex; gap:6px; flex-shrink:0;">','<div class="flashcard-card-actions">');
r('<div style="margin-bottom:1.5rem; background: rgba(0,0,0,0.15); padding: 1rem; border-radius: 8px; border: 1px solid var(--primary-blue);">','<div class="flashcard-group-card">');
r('<h4 style="color:var(--header-materia-text); margin-bottom:0.8rem; border-bottom:1px solid var(--border-color); padding-bottom:4px; display:flex; justify-content:space-between; align-items:center;">','<h4 class="flashcard-group-heading">');
r('<span style="font-size:0.8rem; font-weight:normal;">(${grouped[mName].length} cartões)</span>','<span class="flashcard-group-count">(${grouped[mName].length} cartões)</span>');

// Delayed/study context.
r('<span class="delayed-day-late" style="color:#38bdf8;border-color:rgba(56,189,248,.35);background:rgba(56,189,248,.12);">Hoje</span>','<span class="delayed-day-late delayed-day-today">Hoje</span>');
r('<span style="margin-left:8px; font-size:.72rem; color:#7dd3fc;">Antecipando de ${formatDateKeyShort(activeStudyContext.plannedDateKey)} para hoje</span>','<span class="study-context-advance">Antecipando de ${formatDateKeyShort(activeStudyContext.plannedDateKey)} para hoje</span>');
r('<span style="margin-left:8px;font-size:.72rem;opacity:.8;">${escapeHtml(activeStudyContext.norma)}','<span class="study-context-legal">${escapeHtml(activeStudyContext.norma)}');

// Edital generated layout + bounded CSS variables.
r('<tr class="materia-header-row" data-materia="${safeMateriaHandler}" style="background: ${PALETA_CORES_MATERIAS[colorIdx % PALETA_CORES_MATERIAS.length]};"','<tr class="materia-header-row materia-gradient-${colorIdx % PALETA_CORES_MATERIAS.length}" data-materia="${safeMateriaHandler}"');
r('<span class="materia-progress-ring" style="--pct:${materiaPct}"><span>${materiaPct}%</span></span>','<span class="materia-progress-ring u-ring-pct-${materiaPct}"><span>${materiaPct}%</span></span>');
r('<tr class="adaptive-edital-row" style="--control-count:${2 + activeRevisionOffsets.length};">','<tr class="adaptive-edital-row u-control-count-${Math.min(12, 2 + activeRevisionOffsets.length)}">');
r('<td style="text-align: left; padding-left: 1.5rem;">','<td class="adaptive-edital-subject-cell">');

// Chart legend: deterministic finite class set instead of runtime style variables.
core=core.replace(/<div class="chart-legend-item" style="--subject-gradient:linear-gradient\(135deg, \$\{pair\[0\]\}, \$\{pair\[1\]\}\);">\s*<span class="chart-legend-color" style="background:var\(--subject-gradient\);"><\/span>/g,'<div class="chart-legend-item subject-gradient-${idx % 32}">\n                            <span class="chart-legend-color"></span>');

// UI last template style, if still present.
ui=ui.replace('<div style="padding:12px;color:var(--modern-muted);font-size:.84rem;">Nenhum resultado encontrado.</div>','<div class="global-search-empty">Nenhum resultado encontrado.</div>');

if(!css.includes('RUNTIME_STYLE_DEBT_BATCH8_PASS2')){
  const gradients=Array.from({length:32},(_,idx)=>{const hueA=(214+idx*47)%360;const hueB=(hueA+32+(idx%4)*9)%360;return `.subject-gradient-${idx}{--subject-gradient:linear-gradient(135deg,hsl(${hueA} 92% 57%),hsl(${hueB} 88% 51%))}`}).join('\n');
  const materia=['linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%)','linear-gradient(135deg,#14532d 0%,#22c55e 100%)','linear-gradient(135deg,#701a75 0%,#c084fc 100%)','linear-gradient(135deg,#7c2d12 0%,#f97316 100%)','linear-gradient(135deg,#831843 0%,#ec4899 100%)'].map((g,i)=>`.materia-gradient-${i}{background:${g}}`).join('\n');
  css += `\n/* RUNTIME_STYLE_DEBT_BATCH8_PASS2 */\n.runtime-empty-state{opacity:.8;padding:1rem}.runtime-empty-state-strong{opacity:.85}.runtime-empty-inline{opacity:.75;font-size:.9rem}.runtime-empty-inline-strong{opacity:.8}\n.day-topic-badge{display:inline-flex;margin-left:8px;padding:2px 7px;border-radius:999px;font-size:.68rem}.day-topic-badge-advanced{color:#7dd3fc;border:1px solid rgba(56,189,248,.3);background:rgba(14,165,233,.08)}.day-topic-badge-reviewed{color:#86efac;border:1px solid rgba(34,197,94,.35);background:rgba(34,197,94,.08)}.day-topic-future-hint{display:block;margin-top:3px;font-size:.68rem;opacity:.58}.day-topic-main{flex:1}.day-topic-title{color:var(--primary-blue);font-size:.95rem}.day-topic-edit-area{width:100%}\n.day-topic-form-label{font-size:.85rem;font-weight:700;color:var(--primary-blue)}.day-topic-form-label-edit{font-size:.82rem;color:#93c5fd}.day-topic-form-row{display:flex;gap:8px;flex-wrap:wrap}.day-topic-select{flex:1}.day-topic-select-materia{min-width:160px}.day-topic-select-assunto{min-width:180px}.day-topic-form-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:6px}.day-topic-form-actions-edit{margin-top:4px}\n.anki-subfolder-name{font-size:.9rem;font-weight:600}.anki-subfolder-count{font-size:.8rem;opacity:.8}.anki-folder-open-badge{color:#34d399;font-size:.75rem}.anki-folder-actions{display:flex;align-items:center;gap:10px}.flashcard-answer{margin-top:6px;color:#34d399}.flashcard-card-actions{display:flex;gap:6px;flex-shrink:0}.flashcard-group-card{margin-bottom:1.5rem;background:rgba(0,0,0,.15);padding:1rem;border-radius:8px;border:1px solid var(--primary-blue)}.flashcard-group-heading{color:var(--header-materia-text);margin-bottom:.8rem;border-bottom:1px solid var(--border-color);padding-bottom:4px;display:flex;justify-content:space-between;align-items:center}.flashcard-group-count{font-size:.8rem;font-weight:400}\n.delayed-day-today{color:#38bdf8;border-color:rgba(56,189,248,.35);background:rgba(56,189,248,.12)}.study-context-advance{margin-left:8px;font-size:.72rem;color:#7dd3fc}.study-context-legal{margin-left:8px;font-size:.72rem;opacity:.8}.adaptive-edital-subject-cell{text-align:left;padding-left:1.5rem}\n${materia}\n${Array.from({length:101},(_,i)=>`.u-ring-pct-${i}{--pct:${i}}`).join('\n')}\n${Array.from({length:13},(_,i)=>`.u-control-count-${i}{--control-count:${i}}`).join('\n')}\n${gradients}\n.chart-legend-color{background:var(--subject-gradient)}\n/* RUNTIME_STYLE_DEBT_BATCH8_PASS2_END */\n`;
}

fs.writeFileSync(CORE,core,'utf8');fs.writeFileSync(UI,ui,'utf8');fs.writeFileSync(CSS,css,'utf8');
const count=(s,re)=>(s.match(re)||[]).length;
const remaining={coreStyleDisplay:count(core,/\.style\.display\b/g),uiStyleDisplay:count(ui,/\.style\.display\b/g),coreTemplateStyle:count(core,/style=\\?["']/g),uiTemplateStyle:count(ui,/style=\\?["']/g),coreStyleWidth:count(core,/\.style\.width\b/g),uiStyleWidth:count(ui,/\.style\.width\b/g),coreSetProperty:count(core,/\.style\.setProperty\b/g),uiSetProperty:count(ui,/\.style\.setProperty\b/g)};
const budget=JSON.parse(fs.readFileSync('security/runtime-style-debt.json','utf8'));budget.remaining=remaining;budget.pass2=true;budget.geometryExceptions=['materia drag ghost width/left/top'];fs.writeFileSync('security/runtime-style-debt.json',JSON.stringify(budget,null,2)+'\n');
fs.appendFileSync('tests/runtime-style-debt-batch8.test.cjs',`\ntest('pass2 removes remaining display mutation and known generated style attributes',()=>{\n  const budget2=JSON.parse(fs.readFileSync('security/runtime-style-debt.json','utf8'));\n  assert.equal(budget2.remaining.coreStyleDisplay,0);\n  assert.equal(budget2.remaining.uiStyleDisplay,0);\n  assert.equal(budget2.remaining.uiTemplateStyle,0);\n  assert.ok(budget2.remaining.coreTemplateStyle < 15);\n  assert.match(css,/RUNTIME_STYLE_DEBT_BATCH8_PASS2/);\n});\n`);
console.log(JSON.stringify(remaining,null,2));

from pathlib import Path


def read(path): return Path(path).read_text(encoding='utf-8')
def write(path, text): Path(path).write_text(text, encoding='utf-8')
def replace(path, old, new, count=None):
    text=read(path)
    found=text.count(old)
    if found == 0:
        raise SystemExit(f'pattern not found in {path}: {old[:120]!r}')
    if count is not None and found != count:
        raise SystemExit(f'unexpected count in {path}: {found} != {count} for {old[:120]!r}')
    write(path, text.replace(old,new))

# CSP: style attributes are blocked explicitly while style elements remain temporarily allowed.
replace('public/_headers',
        "style-src 'self' 'unsafe-inline'; img-src",
        "style-src 'self' 'unsafe-inline'; style-src-attr 'none'; img-src", 1)

# AI generated HTML: remove source/generated style attributes; presentation moves to CSS classes.
repls={
'<br><span style="color:#fbbf24;">A análise automática aceita PDF com texto pesquisável.</span>':'<br><span class="ai-inline-warning">A análise automática aceita PDF com texto pesquisável.</span>',
'<div class="ai-source-note" style="margin-bottom:0.8rem; padding:0.65rem 0.75rem; border:1px solid rgba(139,92,246,.35); border-radius:9px;">':'<div class="ai-source-note ai-source-note-compact">',
'<small style="opacity:.65;">':'<small class="ai-preview-meta">',
'<p style="opacity: 0.85; margin-bottom: 12px;">Nenhum documento anexado para o concurso':'<p class="edital-viewer-empty">Nenhum documento anexado para o concurso',
'<embed src="${activeObjectUrl}#toolbar=1" type="application/pdf" style="width:100%; height:100%; min-height:500px; border:none; border-radius:6px;"></embed>':'<embed class="edital-viewer-embed" src="${activeObjectUrl}#toolbar=1" type="application/pdf"></embed>',
'<img src="${activeObjectUrl}" alt="Pré-visualização do edital" style="max-width:100%; max-height:480px; border-radius:6px; object-fit:contain;">':'<img class="edital-viewer-image" src="${activeObjectUrl}" alt="Pré-visualização do edital">',
'<p style="font-size:1.1rem; font-weight:700; color:var(--primary-blue);">${escapeHtml(fileObj.name)}</p>':'<p class="edital-viewer-filename">${escapeHtml(fileObj.name)}</p>',
'<p style="color:#ef4444;">Erro ao carregar arquivo do edital.</p>':'<p class="edital-viewer-error">Erro ao carregar arquivo do edital.</p>',
}
text=read('public/js/app-ai.js')
for old,new in repls.items():
    if old not in text: raise SystemExit(f'app-ai pattern missing: {old[:100]!r}')
    text=text.replace(old,new)
write('public/js/app-ai.js',text)

features='public/css/features.css'
css=read(features)
marker='/* STYLE_SRC_ATTR_HARDENING */'
if marker not in css:
    css += '''\n\n/* STYLE_SRC_ATTR_HARDENING */\n.ai-inline-warning{color:#fbbf24}\n.ai-source-note-compact{margin-bottom:.8rem;padding:.65rem .75rem;border:1px solid rgba(139,92,246,.35);border-radius:9px}\n.ai-preview-meta{opacity:.65}\n.edital-viewer-empty{opacity:.85;margin-bottom:12px}\n.edital-viewer-embed{width:100%;height:100%;min-height:500px;border:0;border-radius:6px}\n.edital-viewer-image{max-width:100%;max-height:480px;border-radius:6px;object-fit:contain}\n.edital-viewer-filename{font-size:1.1rem;font-weight:700;color:var(--primary-blue)}\n.edital-viewer-error{color:#ef4444}\n'''
write(features,css)

# PDF reader: cssText and generated style attributes become direct property writes / semantic classes.
reader=read('public/js/pdf/pdf-reader.js')
old="const wrap=document.createElement('div');wrap.className='pdf-flashcard-ai-model-wrap';wrap.style.cssText='display:grid;gap:6px;margin:10px 0 4px;text-align:left';wrap.innerHTML='<label for=\"pdfFlashcardAiModel\" style=\"color:#8dc8e7;font-weight:700;font-size:.88rem\">Modelo de IA</label><select id=\"pdfFlashcardAiModel\" style=\"width:100%;min-height:44px;border:1px solid #294b64;border-radius:11px;background:#071d2d;color:#e8f3ff;padding:0 12px;font:inherit\">'+FLASHCARD_AI_MODEL_OPTIONS.map(([value,label])=>`<option value=\"${value}\"${value===saved?' selected':''}>${label}</option>`).join('')+'</select><small style=\"color:#8fa9bc;line-height:1.35\">O modelo escolhido é a preferência. Se falhar, o app tenta fallback e, por último, o gerador local sem IA.</small>'"
new="const wrap=document.createElement('div');wrap.className='pdf-flashcard-ai-model-wrap';wrap.innerHTML='<label for=\"pdfFlashcardAiModel\">Modelo de IA</label><select id=\"pdfFlashcardAiModel\">'+FLASHCARD_AI_MODEL_OPTIONS.map(([value,label])=>`<option value=\"${value}\"${value===saved?' selected':''}>${label}</option>`).join('')+'</select><small>O modelo escolhido é a preferência. Se falhar, o app tenta fallback e, por último, o gerador local sem IA.</small>'"
if old not in reader: raise SystemExit('pdf reader AI selector pattern missing')
reader=reader.replace(old,new)
old2="mark.style.cssText=`--mark-color:${color};left:${r.x*100}%;top:${r.y*100}%;width:${r.width*100}%;height:${r.height*100}%`;"
new2="mark.style.setProperty('--mark-color',color);mark.style.left=`${r.x*100}%`;mark.style.top=`${r.y*100}%`;mark.style.width=`${r.width*100}%`;mark.style.height=`${r.height*100}%`;"
if old2 not in reader: raise SystemExit('pdf mark cssText pattern missing')
reader=reader.replace(old2,new2)
write('public/js/pdf/pdf-reader.js',reader)

reader_css=read('public/css/pdf-reader.css')
rm='/* STYLE_SRC_ATTR_READER */'
if rm not in reader_css:
    reader_css += '''\n\n/* STYLE_SRC_ATTR_READER */\n.pdf-flashcard-ai-model-wrap{display:grid;gap:6px;margin:10px 0 4px;text-align:left}\n.pdf-flashcard-ai-model-wrap label{color:#8dc8e7;font-weight:700;font-size:.88rem}\n.pdf-flashcard-ai-model-wrap select{width:100%;min-height:44px;border:1px solid #294b64;border-radius:11px;background:#071d2d;color:#e8f3ff;padding:0 12px;font:inherit}\n.pdf-flashcard-ai-model-wrap small{color:#8fa9bc;line-height:1.35}\n'''
write('public/css/pdf-reader.css',reader_css)

# Password hint: cssText is blocked by style-src-attr none; direct style properties are CSP-compatible.
study=read('public/js/study-domain.js')
old="hint.style.cssText = 'margin-top:6px;font-size:.74rem;line-height:1.35;color:#9fb2c6;';"
new="hint.style.marginTop='6px';hint.style.fontSize='.74rem';hint.style.lineHeight='1.35';hint.style.color='#9fb2c6';"
if old not in study: raise SystemExit('study-domain cssText pattern missing')
study=study.replace(old,new)
write('public/js/study-domain.js',study)

# Performance diagnostics: static presentation becomes semantic classes.
perf=read('public/js/performance-metrics.js')
perf_repls={
"    modal.style.zIndex = '1460';":"    modal.classList.add('performance-diagnostics-overlay');",
'<div class="modal" style="max-width:860px;">':'<div class="modal performance-diagnostics-modal">',
'<p style="font-size:.85rem;opacity:.8;line-height:1.5;">Métricas medidas neste navegador. Nenhum dado é enviado para servidor externo.</p>':'<p class="performance-diagnostics-intro">Métricas medidas neste navegador. Nenhum dado é enviado para servidor externo.</p>',
'<div id="performanceDiagnosticsDetails" style="margin-top:14px;font-size:.82rem;line-height:1.55;"></div>':'<div id="performanceDiagnosticsDetails" class="performance-diagnostics-details"></div>',
}
for old,new in perf_repls.items():
    if old not in perf: raise SystemExit(f'performance pattern missing: {old!r}')
    perf=perf.replace(old,new)
oldcss='.perf-diagnostics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}'
newcss='.performance-diagnostics-overlay{z-index:1460}.performance-diagnostics-modal{max-width:860px}.performance-diagnostics-intro{font-size:.85rem;opacity:.8;line-height:1.5}.performance-diagnostics-details{margin-top:14px;font-size:.82rem;line-height:1.55}.perf-diagnostics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}'
if oldcss not in perf: raise SystemExit('performance style text marker missing')
perf=perf.replace(oldcss,newcss,1)
write('public/js/performance-metrics.js',perf)

# Library card progress: generated style attribute becomes data + a CSP-compatible direct property write.
lib=read('public/js/pdf/pdf-library-ui.js')
old='<div class="pdf-progress-line"><span style="width:${Math.min(100,Math.max(0,p))}%"></span></div>'
new='<div class="pdf-progress-line"><span class="pdf-progress-fill" data-progress="${Math.min(100,Math.max(0,p))}"></span></div>'
if old not in lib: raise SystemExit('library progress inline style missing')
lib=lib.replace(old,new)
oldjoin="  }).join('');\n}"
newjoin="  }).join('');\n  c.querySelectorAll('.pdf-progress-fill[data-progress]').forEach(bar=>{bar.style.width=`${Math.min(100,Math.max(0,Number(bar.dataset.progress)||0))}%`});\n}"
if oldjoin not in lib: raise SystemExit('library render end missing')
lib=lib.replace(oldjoin,newjoin,1)
write('public/js/pdf/pdf-library-ui.js',lib)

# Audit: direct element.style.property assignments are allowed by CSP3 style-src-attr.
test=read('tests/style-src-attr-runtime.test.cjs')
start=test.index('function runtimeStyleOffenders()')
end=test.index("test('style-src-attr can be locked", start)
replacement=r'''function runtimeStyleOffenders(){
  const files=walk('public').filter(file=>/\.(?:js|html)$/i.test(file));
  const patterns=[
    /\.style\.cssText\s*=/g,
    /\.style\s*=\s*['"`]/g,
    /setAttribute\(\s*['"]style['"]/g,
    /\sstyle\s*=\s*['"`]/g
  ];
  const offenders=[];
  for(const file of files){
    const text=fs.readFileSync(file,'utf8');
    const lines=text.split(/\r?\n/);
    lines.forEach((line,index)=>{
      if(patterns.some(re=>{re.lastIndex=0;return re.test(line)})) offenders.push(`${file}:${index+1}: ${line.trim().slice(0,220)}`);
    });
  }
  return offenders;
}

'''
test=test[:start]+replacement+test[end:]
test += r'''

test('Reader geometry and drag ghost keep direct style-property updates',()=>{
  const reader=fs.readFileSync('public/js/pdf/pdf-reader.js','utf8');
  const core=fs.readFileSync('public/js/app-core.js','utf8');
  assert.match(reader,/shell\.style\.width=/);
  assert.match(reader,/host\.style\.transform=/);
  assert.match(core,/ghost\.style\.width=/);
  assert.match(core,/state\.ghost\.style\.top=/);
  assert.doesNotMatch(reader,/\.style\.cssText\s*=/);
});
'''
write('tests/style-src-attr-runtime.test.cjs',test)

# Structural CSP audit now requires the explicit attr directive.
audit=read('scripts/audit-inline-csp.mjs')
needle="if (!/script-src-attr\\s+'unsafe-inline'/i.test(csp)) fail('Header CSP deve manter compatibilidade temporária apenas em script-src-attr');"
if needle not in audit:
    raise SystemExit('CSP audit insertion point missing')
audit=audit.replace(needle, needle+"\nif (!/style-src-attr\\s+'none'/i.test(csp)) fail(\"Header CSP deve bloquear atributos style com style-src-attr 'none'\");")
write('scripts/audit-inline-csp.mjs',audit)

print('style-src-attr hardening patch applied')

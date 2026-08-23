from pathlib import Path

p=Path('public/index.html')
raw=p.read_bytes()
replacements=[
    (b'<div id="authStatusMessage" style="display:none; margin-top:12px; padding:10px 12px; border-radius:8px; font-size:.82rem; line-height:1.4; background:rgba(34,197,94,.10); border:1px solid rgba(34,197,94,.28); color:#86efac;"></div>', b'<div id="authStatusMessage" class="auth-status-message" hidden aria-hidden="true"></div>'),
    (b'<span id="superUserBadge" class="super-user-badge" style="display: none;">Super Usu\xc3\xa1rio</span>', b'<span id="superUserBadge" class="super-user-badge" hidden aria-hidden="true">Super Usu\xc3\xa1rio</span>'),
    (b'<div id="customDailyHoursPanel" class="custom-daily-hours-panel" style="display:none;">', b'<div id="customDailyHoursPanel" class="custom-daily-hours-panel" hidden aria-hidden="true">'),
    (b'<div class="form-group" id="notaTituloCustomGroup" style="display:none;">', b'<div class="form-group" id="notaTituloCustomGroup" hidden aria-hidden="true">'),
    (b'<button id="btnDownloadEdital" class="btn btn-primary btn-sm" style="display: none;" data-action="call" data-call="downloadEditalFile">Baixar Arquivo</button>', b'<button id="btnDownloadEdital" class="btn btn-primary btn-sm" hidden aria-hidden="true" data-action="call" data-call="downloadEditalFile">Baixar Arquivo</button>'),
    (b'<button id="btnRemoveEdital" class="btn btn-danger btn-sm" style="display: none;" data-action="call" data-call="removerEditalFile">Apagar Edital</button>', b'<button id="btnRemoveEdital" class="btn btn-danger btn-sm" hidden aria-hidden="true" data-action="call" data-call="removerEditalFile">Apagar Edital</button>'),
    (b'<div id="modalPdfNoteEditor" class="pdf-note-modal" style="display:none" role="dialog" aria-modal="true" aria-labelledby="pdfNoteEditorTitle">', b'<div id="modalPdfNoteEditor" class="pdf-note-modal" hidden aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="pdfNoteEditorTitle">'),
]
for old,new in replacements:
    if raw.count(old)!=1:
        raise SystemExit(f'index target mismatch: {old[:70]!r}')
    raw=raw.replace(old,new,1)
p.write_bytes(raw)

def rx(path,pairs):
    f=Path(path); t=f.read_text(encoding='utf-8')
    for old,new in pairs:
        if old not in t:
            raise SystemExit(f'{path}: missing {old[:90]!r}')
        t=t.replace(old,new)
    f.write_text(t,encoding='utf-8')

rx('public/js/app-ai.js',[
    ("btnDownload.style.display = 'none';","setVisualState(btnDownload, false);"),
    ("btnRemove.style.display = 'none';","setVisualState(btnRemove, false);"),
    ("btnDownload.style.display = 'inline-flex';","setVisualState(btnDownload, true);"),
    ("btnRemove.style.display = 'inline-flex';","setVisualState(btnRemove, true);"),
    ("status.style.display = message ? 'block' : 'none';","status.classList.remove('is-error');\n                setVisualState(status, Boolean(message));"),
    ("if (badge) badge.style.display = isSuperUser ? 'inline-block' : 'none';","setVisualState(badge, isSuperUser);")
])
rx('public/js/app-core.js',[
    ("document.getElementById('customDailyHoursPanel').style.display = useCustomDailyHours ? 'block' : 'none';","setVisualState(document.getElementById('customDailyHoursPanel'), useCustomDailyHours);"),
    ("if (panel) panel.style.display = 'none';","setVisualState(panel, false);"),
    ("if (panel) panel.style.display = 'block';","setVisualState(panel, true);"),
    ("titleGroup.style.display = isOutro ? 'flex' : 'none';","setVisualState(titleGroup, isOutro);")
])
rx('public/js/pdf/pdf-reader.js',[
    ("$('modalPdfNoteEditor').style.display='flex'","setVisualState($('modalPdfNoteEditor'),true)"),
    ("function closePdfNoteEditor(){if($('modalPdfNoteEditor'))$('modalPdfNoteEditor').style.display='none'}","function closePdfNoteEditor(){setVisualState($('modalPdfNoteEditor'),false)}")
])

f=Path('public/js/study-domain.js'); t=f.read_text(encoding='utf-8')
old="""        box.style.display = 'block';
        box.textContent = message;
        if (kind === 'error') {
            box.style.background = 'rgba(239,68,68,.10)';
            box.style.borderColor = 'rgba(239,68,68,.35)';
            box.style.color = '#fca5a5';
        } else {
            box.style.background = 'rgba(34,197,94,.10)';
            box.style.borderColor = 'rgba(34,197,94,.28)';
            box.style.color = '#86efac';
        }
"""
new="""        if (typeof root.setVisualState === 'function') root.setVisualState(box, true);
        else { box.hidden = false; box.setAttribute('aria-hidden', 'false'); }
        box.textContent = message;
        box.classList.toggle('is-error', kind === 'error');
"""
if t.count(old)!=1: raise SystemExit('study-domain block mismatch')
f.write_text(t.replace(old,new,1),encoding='utf-8')

f=Path('public/css/base.css'); t=f.read_text(encoding='utf-8')
anchor="""        .super-user-badge {
            background: linear-gradient(135deg, #f59e0b, #ef4444); color: white; font-size: 0.75rem;
            font-weight: 800; padding: 3px 8px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.5px;
        }
"""
add=anchor+"""        .super-user-badge.is-open { display: inline-block; }
        .auth-status-message { margin-top:12px; padding:10px 12px; border-radius:8px; font-size:.82rem; line-height:1.4; background:rgba(34,197,94,.10); border:1px solid rgba(34,197,94,.28); color:#86efac; }
        .auth-status-message.is-error { background:rgba(239,68,68,.10); border-color:rgba(239,68,68,.35); color:#fca5a5; }
"""
if '.auth-status-message {' not in t:
    if t.count(anchor)!=1: raise SystemExit('base css anchor mismatch')
    t=t.replace(anchor,add,1)
f.write_text(t,encoding='utf-8')

f=Path('public/css/pdf-reader.css'); t=f.read_text(encoding='utf-8')
marker='.pdf-note-modal{position:fixed;inset:0;z-index:3060;background:rgba(2,10,18,.76);align-items:center;justify-content:center;padding:18px}'
if '.pdf-note-modal.is-open{display:flex}' not in t:
    if marker not in t: raise SystemExit('pdf note css marker mismatch')
    t=t.replace(marker,marker+'.pdf-note-modal.is-open{display:flex}',1)
f.write_text(t,encoding='utf-8')

f=Path('scripts/audit-inline-csp.mjs'); t=f.read_text(encoding='utf-8')
if 'const STYLE_BUDGET = 82;' not in t: raise SystemExit('budget 82 missing')
f.write_text(t.replace('const STYLE_BUDGET = 82;','const STYLE_BUDGET = 75;',1),encoding='utf-8')

Path('tests/visual-state-batch3.test.cjs').write_text("""'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');

test('batch3 removes seven static inline visual states',()=>{
  const html=read('public/index.html');
  const ids=['authStatusMessage','superUserBadge','customDailyHoursPanel','notaTituloCustomGroup','btnDownloadEdital','btnRemoveEdital','modalPdfNoteEditor'];
  assert.equal((html.match(/\\sstyle\\s*=\\s*[\"']/gi)||[]).length,75);
  for(const id of ids){
    const tag=html.match(new RegExp(`<[^>]+\\bid=[\"']${id}[\"'][^>]*>`,`i`))?.[0]||'';
    assert.ok(tag,`missing #${id}`);
    assert.match(tag,/\\shidden(?:\\s|>|=)/i);
    assert.doesNotMatch(tag,/\\sstyle\\s*=/i);
  }
});

test('batch3 JS uses semantic visibility',()=>{
  const ai=read('public/js/app-ai.js'), core=read('public/js/app-core.js'), reader=read('public/js/pdf/pdf-reader.js'), domain=read('public/js/study-domain.js');
  assert.doesNotMatch(ai,/btn(?:Download|Remove)\\.style\\.display/);
  assert.doesNotMatch(ai,/badge\\.style\\.display|status\\.style\\.display/);
  assert.doesNotMatch(core,/titleGroup\\.style\\.display/);
  assert.doesNotMatch(reader,/modalPdfNoteEditor[^\\n]{0,120}style\\.display/);
  assert.doesNotMatch(domain,/box\\.style\\.(?:display|background|borderColor|color)/);
});

test('semantic CSS preserves visual modes',()=>{
  const base=read('public/css/base.css'), pdf=read('public/css/pdf-reader.css');
  assert.match(base,/\\.auth-status-message\\s*\\{/);
  assert.match(base,/\\.auth-status-message\\.is-error\\s*\\{/);
  assert.match(base,/\\.super-user-badge\\.is-open\\s*\\{\\s*display:\\s*inline-block;/);
  assert.match(pdf,/\\.pdf-note-modal\\.is-open\\{display:flex\\}/);
});
""",encoding='utf-8')

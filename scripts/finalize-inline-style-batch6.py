from pathlib import Path

p=Path('public/index.html')
raw=p.read_bytes()
repls=[
(b'<p style="font-size:0.85rem; color:#94a3b8; text-transform:uppercase; margin-bottom:8px;" id="studyCardLabel">',b'<p class="study-card-label" id="studyCardLabel">'),
(b'<div id="editalViewerContainer" style="flex: 1; min-height: 480px; display: flex; flex-direction: column; justify-content: center; align-items: center; border: 1px dashed var(--border-color); border-radius: 8px; padding: 10px; text-align: center; overflow: hidden; background: rgba(0,0,0,0.15);">',b'<div id="editalViewerContainer" class="edital-viewer-empty-state">')]
for old,new in repls:
    if raw.count(old)!=1: raise SystemExit(f'target count {raw.count(old)} for {old[:80]!r}')
    raw=raw.replace(old,new,1)
p.write_bytes(raw)
cssp=Path('public/css/base.css')
css=cssp.read_text(encoding='utf-8')
marker='/* INLINE_STYLE_BATCH6_FINAL_STATIC */'
if marker in css: raise SystemExit('final marker already exists')
css += '\n'+marker+'\n.study-card-label { font-size: .85rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; }\n.edital-viewer-empty-state { flex: 1; min-height: 480px; display: flex; flex-direction: column; justify-content: center; align-items: center; border: 1px dashed var(--border-color); border-radius: 8px; padding: 10px; text-align: center; overflow: hidden; background: rgba(0,0,0,.15); }\n'
cssp.write_text(css,encoding='utf-8')
a=Path('scripts/audit-inline-csp.mjs')
t=a.read_text(encoding='utf-8')
if 'const STYLE_BUDGET = 5;' not in t: raise SystemExit('expected budget 5')
a.write_text(t.replace('const STYLE_BUDGET = 5;','const STYLE_BUDGET = 3;',1),encoding='utf-8')
test=Path('tests/inline-style-batch6.test.cjs')
s=test.read_text(encoding='utf-8').replace('length,5);','length,3);').replace('STYLE_BUDGET = 5','STYLE_BUDGET = 3')
test.write_text(s,encoding='utf-8')
print('batch6 final: 5 -> 3')

from pathlib import Path
import re

INDEX = Path('public/index.html')
raw = INDEX.read_bytes()
text = raw.decode('utf-8')
reader_match = re.search(r'<section\b[^>]*\bid="pdfReaderOverlay"[^>]*>', text, re.I)
if not reader_match:
    raise SystemExit('pdf reader overlay not found')
reader_start = reader_match.start()
reader_end = text.find('</section>', reader_match.end())
if reader_end < 0:
    raise SystemExit('pdf reader overlay closing tag not found')
reader_end += len('</section>')

allowed = {
    'z-index','max-width','width','height','max-height','min-height','display','grid-template-columns',
    'gap','align-items','justify-content','flex-wrap','flex-direction','font-size','font-family','font-weight',
    'line-height','opacity','margin','margin-top','margin-right','margin-bottom','margin-left','padding',
    'border','border-radius','color','background','text-align','white-space','letter-spacing','flex','min-width'
}
forbidden_display = {'none'}
style_re = re.compile(r'\sstyle="([^"]*)"')
class_re = re.compile(r'\bclass="([^"]*)"')
classes = {}
count_before = len(style_re.findall(text))
migrated = 0

tag_re = re.compile(r'<[^>]+>')
out = []
for m in tag_re.finditer(text):
    tag = m.group(0)
    pos = m.start()
    in_reader = reader_start <= pos < reader_end
    if in_reader or ' style="' not in tag:
        continue
    sm = style_re.search(tag)
    if not sm:
        continue
    style = sm.group(1).strip()
    decls = []
    safe = True
    for part in style.split(';'):
        part = part.strip()
        if not part:
            continue
        if ':' not in part:
            safe = False; break
        prop, value = [x.strip() for x in part.split(':',1)]
        prop = prop.lower()
        if prop not in allowed:
            safe = False; break
        if prop == 'display' and value.lower() in forbidden_display:
            safe = False; break
        if any(tok in value.lower() for tok in ('var(--dynamic', '${', 'calc(')):
            safe = False; break
        decls.append((prop, value))
    if not safe or not decls:
        continue
    key = '; '.join(f'{p}: {v}' for p,v in decls) + ';'
    cls = classes.get(key)
    if not cls:
        cls = f'u-layout-b6-{len(classes)+1:03d}'
        classes[key] = cls
    new_tag = style_re.sub('', tag, count=1)
    cm = class_re.search(new_tag)
    if cm:
        new_class = cm.group(1) + ' ' + cls
        new_tag = new_tag[:cm.start(1)] + new_class + new_tag[cm.end(1):]
    else:
        insert_at = new_tag.find('>')
        new_tag = new_tag[:insert_at] + f' class="{cls}"' + new_tag[insert_at:]
    out.append((m.start(), m.end(), new_tag))
    migrated += 1

for start,end,new_tag in reversed(out):
    text = text[:start] + new_tag + text[end:]

count_after = len(style_re.findall(text))
if count_before != 44:
    raise SystemExit(f'expected 44 inline styles before batch6, found {count_before}')
if migrated < 8:
    raise SystemExit(f'batch6 migrated too few styles: {migrated}')
INDEX.write_bytes(text.encode('utf-8'))

css_path = Path('public/css/base.css')
css = css_path.read_text(encoding='utf-8')
marker = '/* INLINE_STYLE_BATCH6_FIXED_LAYOUTS */'
if marker in css:
    raise SystemExit('batch6 marker already exists')
block = ['','',marker]
for style, cls in classes.items():
    block.append(f'.{cls} {{ {style} }}')
css_path.write_text(css.rstrip() + '\n'.join(block) + '\n', encoding='utf-8')

audit_path = Path('scripts/audit-inline-csp.mjs')
audit = audit_path.read_text(encoding='utf-8')
if 'const STYLE_BUDGET = 44;' not in audit:
    raise SystemExit('expected STYLE_BUDGET 44 not found')
audit_path.write_text(audit.replace('const STYLE_BUDGET = 44;', f'const STYLE_BUDGET = {count_after};', 1), encoding='utf-8')

Path('security/inline-style-batch6-result.json').write_text(
    '{\n  "before": 44,\n  "after": %d,\n  "migrated": %d,\n  "classes": %d\n}\n' % (count_after, migrated, len(classes)),
    encoding='utf-8'
)

Path('tests/inline-style-batch6.test.cjs').write_text(f"""'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');

test('batch6 reduces fixed inline layout budget',()=>{{
  const html=read('public/index.html');
  assert.equal((html.match(/\\sstyle\\s*=\\s*[\"']/gi)||[]).length,{count_after});
  assert.match(read('scripts/audit-inline-csp.mjs'),/const STYLE_BUDGET = {count_after};/);
}});

test('batch6 generated layout classes are present',()=>{{
  const css=read('public/css/base.css');
  assert.match(css,/INLINE_STYLE_BATCH6_FIXED_LAYOUTS/);
  assert.ok((css.match(/\\.u-layout-b6-/g)||[]).length >= {len(classes)});
}});

test('batch6 leaves runtime-hidden and PDF reader styles untouched',()=>{{
  const html=read('public/index.html');
  const reset=html.match(/<button[^>]+id=[\"']btnResetFcFilter[\"'][^>]*>/i)?.[0]||'';
  assert.match(reset,/style=[\"']display:\\s*none;?[\"']/i);
  const readerTag=html.match(/<section\\b[^>]*\\bid=[\"']pdfReaderOverlay[\"'][^>]*>/i)?.[0]||'';
  assert.ok(readerTag,'PDF Reader overlay missing');
}});
""",encoding='utf-8')

print(f'inline styles {count_before} -> {count_after}; migrated {migrated}; classes {len(classes)}')

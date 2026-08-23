from pathlib import Path

INDEX = Path('public/index.html')
raw = INDEX.read_bytes()
replacements = [
    (b'<input type="email" id="email" placeholder="seu@email.com" style="width:100%; margin-bottom: 0.5rem;" required>', b'<input type="email" id="email" class="auth-field auth-field-spaced" placeholder="seu@email.com" required>'),
    (b'<input type="password" id="password" placeholder="Senha (min. 6 caracteres)" style="width:100%;" required>', b'<input type="password" id="password" class="auth-field" placeholder="Senha (min. 6 caracteres)" required>'),
    (b'<div style="display:flex; gap:0.5rem;">\r\n                <button class="btn btn-primary u-static-002" data-action="auth-login">Entrar</button>', b'<div class="auth-action-row">\r\n                <button class="btn btn-primary u-static-002" data-action="auth-login">Entrar</button>'),
    (b'<div id="studyActivityDistribution" style="margin-top:12px;font-size:.78rem;opacity:.8;"></div>', b'<div id="studyActivityDistribution" class="study-activity-distribution"></div>'),
    (b'<th style="width: 90px;">Prioridade</th>', b'<th class="edital-priority-column">Prioridade</th>'),
    (b'<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">\r\n                    <h3>Anota\xc3\xa7\xc3\xb5es e Caderno de Resumos</h3>', b'<div class="notes-section-header">\r\n                    <h3>Anota\xc3\xa7\xc3\xb5es e Caderno de Resumos</h3>'),
    (b'<div class="flashcards-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">', b'<div class="flashcards-header">'),
]
for old, new in replacements:
    count = raw.count(old)
    if count != 1:
        raise SystemExit(f'index target count={count}, expected 1: {old[:100]!r}')
    raw = raw.replace(old, new, 1)
INDEX.write_bytes(raw)

css_path = Path('public/css/base.css')
css = css_path.read_text(encoding='utf-8')
marker = '/* INLINE_STYLE_BATCH4_STATIC_COMPONENTS */'
block = '''\n\n/* INLINE_STYLE_BATCH4_STATIC_COMPONENTS */
.auth-field { width: 100%; }
.auth-field-spaced { margin-bottom: .5rem; }
.auth-action-row { display: flex; gap: .5rem; }
.study-activity-distribution { margin-top: 12px; font-size: .78rem; opacity: .8; }
.edital-priority-column { width: 90px; }
.notes-section-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; }
.flashcards-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem; }
'''
if marker in css:
    raise SystemExit('batch4 CSS marker already exists')
css_path.write_text(css.rstrip() + block + '\n', encoding='utf-8')

audit_path = Path('scripts/audit-inline-csp.mjs')
audit = audit_path.read_text(encoding='utf-8')
if 'const STYLE_BUDGET = 75;' not in audit:
    raise SystemExit('expected STYLE_BUDGET 75 not found')
audit_path.write_text(audit.replace('const STYLE_BUDGET = 75;', 'const STYLE_BUDGET = 68;', 1), encoding='utf-8')

test_path = Path('tests/inline-style-batch4.test.cjs')
test_path.write_text(r'''\'use strict\';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');

test('batch4 reduces static inline-style budget from 75 to 68',()=>{
  const html=read('public/index.html');
  assert.equal((html.match(/\sstyle\s*=\s*["']/gi)||[]).length,68);
  const audit=read('scripts/audit-inline-csp.mjs');
  assert.match(audit,/const STYLE_BUDGET = 68;/);
});

test('batch4 static targets use semantic classes instead of style attributes',()=>{
  const html=read('public/index.html');
  const targets=[
    ['email','auth-field auth-field-spaced'],
    ['password','auth-field'],
    ['studyActivityDistribution','study-activity-distribution']
  ];
  for(const [id,className] of targets){
    const marker=`id="${id}"`;
    const pos=html.indexOf(marker);
    assert.ok(pos>=0,`missing #${id}`);
    const start=html.lastIndexOf('<',pos);
    const end=html.indexOf('>',pos);
    const tag=html.slice(start,end+1);
    assert.doesNotMatch(tag,/\sstyle\s*=/i,`#${id} still has inline style`);
    for(const token of className.split(/\s+/)) assert.match(tag,new RegExp(`\\b${token}\\b`));
  }
  assert.match(html,/<div class="auth-action-row">/);
  assert.match(html,/<th class="edital-priority-column">Prioridade<\/th>/);
  assert.match(html,/<div class="notes-section-header">/);
  assert.match(html,/<div class="flashcards-header">/);
});

test('batch4 CSS preserves migrated presentation',()=>{
  const css=read('public/css/base.css');
  assert.match(css,/\.auth-field\s*\{\s*width:\s*100%;\s*\}/);
  assert.match(css,/\.auth-action-row\s*\{[^}]*display:\s*flex;[^}]*gap:\s*\.5rem;/);
  assert.match(css,/\.study-activity-distribution\s*\{[^}]*margin-top:\s*12px;[^}]*font-size:\s*\.78rem;[^}]*opacity:\s*\.8;/);
  assert.match(css,/\.edital-priority-column\s*\{\s*width:\s*90px;/);
  assert.match(css,/\.notes-section-header\s*\{[^}]*margin-bottom:\s*1\.5rem;/);
  assert.match(css,/\.flashcards-header\s*\{[^}]*margin-bottom:\s*1rem;/);
});
'''.replace("\\'use strict\\';","'use strict';"),encoding='utf-8')

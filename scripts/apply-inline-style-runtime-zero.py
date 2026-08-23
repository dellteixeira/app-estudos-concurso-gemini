from pathlib import Path
import re

# ---- index.html: remove the final three inline style attributes deterministically ----
index = Path('public/index.html')
raw = index.read_bytes()
replacements = [
    (b'<div class="pomodoro-ring" id="pomodoroRing" style="--timer-progress:0;">',
     b'<div class="pomodoro-ring pomodoro-progress-0" id="pomodoroRing" data-mode="focus">'),
    (b'<button class="btn btn-secondary btn-sm" id="btnResetFcFilter" data-inline-click="ih-021" style="display: none;">',
     b'<button class="btn btn-secondary btn-sm" id="btnResetFcFilter" data-inline-click="ih-021" hidden aria-hidden="true">'),
    (b'<div id="appPromptHelp" class="account-helper" style="display:none;"></div>',
     b'<div id="appPromptHelp" class="account-helper" hidden aria-hidden="true"></div>'),
]
for old, new in replacements:
    count = raw.count(old)
    if count != 1:
        raise SystemExit(f'index target count={count}, expected 1: {old!r}')
    raw = raw.replace(old, new, 1)
index.write_bytes(raw)

# ---- app-core.js: semantic visibility + class-based Pomodoro progress ----
core_path = Path('public/js/app-core.js')
core = core_path.read_text(encoding='utf-8')

old_reset = """            const btnReset = document.getElementById('btnResetFcFilter');
            if (btnReset) btnReset.style.display = (activeFcMateriaFilter || activeFcAssuntoFilter) ? 'inline-flex' : 'none';
"""
new_reset = """            const btnReset = document.getElementById('btnResetFcFilter');
            if (btnReset) setVisualState(btnReset, Boolean(activeFcMateriaFilter || activeFcAssuntoFilter));
"""
if core.count(old_reset) != 1:
    raise SystemExit('btnResetFcFilter runtime target mismatch')
core = core.replace(old_reset, new_reset, 1)

old_help = """            if (help) {
                help.textContent = options.help || '';
                help.style.display = options.help ? '' : 'none';
            }
"""
new_help = """            if (help) {
                help.textContent = options.help || '';
                setVisualState(help, Boolean(options.help));
            }
"""
if core.count(old_help) != 1:
    raise SystemExit('appPromptHelp runtime target mismatch')
core = core.replace(old_help, new_help, 1)

old_ring = """            if (ringEl) {
                ringEl.style.setProperty('--timer-progress', String(getPomodoroRingProgress()));
                ringEl.style.setProperty('--timer-accent', timerMode === 'focus' ? 'var(--modern-blue-2)' : 'var(--modern-warning)');
                ringEl.dataset.mode = timerMode;
                ringEl.setAttribute('aria-label', `${min} minutos e ${sec} segundos restantes — ${modeLabel}`);
            }
"""
new_ring = """            if (ringEl) {
                const progressPercent = Math.max(0, Math.min(100, Math.round(getPomodoroRingProgress() * 100)));
                const progressClass = `pomodoro-progress-${progressPercent}`;
                const previousProgressClass = ringEl.dataset.progressClass || 'pomodoro-progress-0';
                if (previousProgressClass !== progressClass) {
                    ringEl.classList.remove(previousProgressClass);
                    ringEl.classList.add(progressClass);
                    ringEl.dataset.progressClass = progressClass;
                }
                ringEl.dataset.mode = timerMode;
                ringEl.setAttribute('aria-label', `${min} minutos e ${sec} segundos restantes — ${modeLabel}`);
            }
"""
if core.count(old_ring) != 1:
    raise SystemExit('Pomodoro runtime style target mismatch')
core = core.replace(old_ring, new_ring, 1)
core_path.write_text(core, encoding='utf-8')

# ---- CSS: map progress classes to the existing custom property; mode controls accent ----
css_path = Path('public/css/base.css')
css = css_path.read_text(encoding='utf-8')
marker = '/* INLINE_STYLE_RUNTIME_ZERO */'
if marker in css:
    raise SystemExit('runtime-zero CSS marker already exists')
lines = ['', marker,
         '.pomodoro-ring[data-mode="focus"] { --timer-accent: var(--modern-blue-2); }',
         '.pomodoro-ring[data-mode="interval"] { --timer-accent: var(--modern-warning); }',
         '.pomodoro-ring[data-mode="break"] { --timer-accent: var(--modern-warning); }']
for pct in range(101):
    lines.append(f'.pomodoro-progress-{pct} {{ --timer-progress: {pct / 100:.2f}; }}')
css_path.write_text(css.rstrip() + '\n' + '\n'.join(lines) + '\n', encoding='utf-8')

# ---- CSP source budget: 3 -> 0 ----
audit_path = Path('scripts/audit-inline-csp.mjs')
audit = audit_path.read_text(encoding='utf-8')
if 'const STYLE_BUDGET = 3;' not in audit:
    raise SystemExit('expected STYLE_BUDGET = 3')
audit_path.write_text(audit.replace('const STYLE_BUDGET = 3;', 'const STYLE_BUDGET = 0;', 1), encoding='utf-8')

# ---- batch6 remains monotonic, while the new contract requires zero ----
b6_path = Path('tests/inline-style-batch6.test.cjs')
b6 = b6_path.read_text(encoding='utf-8')
b6 = b6.replace("assert.equal((html.match(/\\sstyle\\s*=\\s*[\"']/gi)||[]).length,3);", "assert.ok((html.match(/\\sstyle\\s*=\\s*[\"']/gi)||[]).length <= 3);")
b6 = b6.replace("assert.match(read('scripts/audit-inline-csp.mjs'),/const STYLE_BUDGET = 3;/);", "assert.match(read('scripts/audit-inline-csp.mjs'),/const STYLE_BUDGET = (?:0|1|2|3);/);")
b6 = b6.replace("  const reset=html.match(/<button[^>]+id=[\"']btnResetFcFilter[\"'][^>]*>/i)?.[0]||'';\n  assert.match(reset,/style=[\"']display:\\s*none;?[\"']/i);\n", "  const reset=html.match(/<button[^>]+id=[\"']btnResetFcFilter[\"'][^>]*>/i)?.[0]||'';\n  assert.ok(reset,'btnResetFcFilter missing');\n")
b6_path.write_text(b6, encoding='utf-8')

new_test = Path('tests/inline-style-runtime-zero.test.cjs')
new_test.write_text("""'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');

test('HTML source has zero inline style attributes',()=>{
  const html=read('public/index.html');
  assert.equal((html.match(/\\sstyle\\s*=\\s*[\"']/gi)||[]).length,0);
  assert.match(read('scripts/audit-inline-csp.mjs'),/const STYLE_BUDGET = 0;/);
});

test('remaining visibility states use semantic hidden state',()=>{
  const html=read('public/index.html');
  for(const id of ['btnResetFcFilter','appPromptHelp']){
    const tag=html.match(new RegExp(`<[^>]+id=[\"']${id}[\"'][^>]*>`,'i'))?.[0]||'';
    assert.ok(tag,`${id} missing`);
    assert.match(tag,/\\shidden(?:\\s|>|$)/i,`${id} should start hidden`);
    assert.doesNotMatch(tag,/\\sstyle=/i,`${id} must not use inline style`);
  }
  const core=read('public/js/app-core.js');
  assert.match(core,/setVisualState\\(btnReset, Boolean\\(activeFcMateriaFilter \\|\\| activeFcAssuntoFilter\\)\\)/);
  assert.match(core,/setVisualState\\(help, Boolean\\(options\\.help\\)\\)/);
});

test('Pomodoro progress is class-based and does not write style properties',()=>{
  const html=read('public/index.html');
  const ring=html.match(/<div[^>]+id=[\"']pomodoroRing[\"'][^>]*>/i)?.[0]||'';
  assert.match(ring,/pomodoro-progress-0/);
  assert.doesNotMatch(ring,/\\sstyle=/i);
  const core=read('public/js/app-core.js');
  assert.match(core,/const progressClass = `pomodoro-progress-\\$\\{progressPercent\\}`/);
  assert.doesNotMatch(core,/ringEl\\.style\\.setProperty\\(['\"]--timer-(?:progress|accent)/);
  const css=read('public/css/base.css');
  assert.match(css,/INLINE_STYLE_RUNTIME_ZERO/);
  assert.match(css,/\\.pomodoro-progress-0\\s*\\{\\s*--timer-progress:\\s*0\\.00;/);
  assert.match(css,/\\.pomodoro-progress-100\\s*\\{\\s*--timer-progress:\\s*1\\.00;/);
  assert.match(css,/\\.pomodoro-ring\\[data-mode=[\"']focus[\"']\\]/);
});
""", encoding='utf-8')

# Final hard requirement: source count is zero.
final_html = index.read_text(encoding='utf-8')
count = len(re.findall(r'\\sstyle\\s*=\\s*[\"\']', final_html, flags=re.I))
if count != 0:
    raise SystemExit(f'expected 0 inline style attrs, found {count}')

print('runtime inline-style source budget: 3 -> 0')

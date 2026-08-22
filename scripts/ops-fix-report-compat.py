from pathlib import Path

core_path=Path('public/js/study-performance-report-core.js')
legacy_test_path=Path('tests/study-performance-report-polish.test.cjs')

core=core_path.read_text(encoding='utf-8')
old="rect(p,MX+7,p.cursor-1,8,8,m.color);strokeRect(p,MX+7,p.cursor-1,8,8,'#ffffff',.3)"
new="rect(p,MX+7,p.cursor-1,9,9,m.color);strokeRect(p,MX+7,p.cursor-1,9,9,'#ffffff',.3)"
if old not in core:
    raise SystemExit('new legend swatch block not found')
core=core.replace(old,new,1)
core_path.write_text(core,encoding='utf-8')

legacy=legacy_test_path.read_text(encoding='utf-8')
if 'study-performance-report-core\\.js\\?rev=20260822-4' not in legacy or 'study-performance-report-v2\\.js\\?rev=20260822-4' not in legacy:
    raise SystemExit('legacy cache revision expectations not found')
legacy=legacy.replace('study-performance-report-core\\.js\\?rev=20260822-4','study-performance-report-core\\.js\\?rev=20260822-5')
legacy=legacy.replace('study-performance-report-v2\\.js\\?rev=20260822-4','study-performance-report-v2\\.js\\?rev=20260822-5')
legacy_test_path.write_text(legacy,encoding='utf-8')

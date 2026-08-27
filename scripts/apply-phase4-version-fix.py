from pathlib import Path

root = Path(__file__).resolve().parents[1]
pwa = root / 'public/js/app-pwa.js'
text = pwa.read_text(encoding='utf-8')
old = '10.64.2'
new = '10.64.3'
count = text.count(old)
if count != 5:
    raise SystemExit(f'app-pwa.js: esperado 5 ocorrências de {old}, encontrado {count}')
pwa.write_text(text.replace(old, new), encoding='utf-8')

for rel in [
    'phase4-test-failure.txt',
    '.github/workflows/temp-phase4-test-debug.yml',
    'scripts/apply-phase4-version-fix.py',
    '.github/workflows/temp-phase4-version-fix.yml',
]:
    path = root / rel
    if path.exists():
        path.unlink()

from pathlib import Path
import subprocess

OLD = '10.41.0'
NEW = '10.42.0'
OLD_ESC = r'10\.41\.0'
NEW_ESC = r'10\.42\.0'
OLD_HYPHEN = '10-41-0'
NEW_HYPHEN = '10-42-0'

tracked = subprocess.check_output(['git','ls-files'], text=True).splitlines()
selected = []
for name in tracked:
    if name.startswith(('public/','src/','config/','tests/')) or name in {'package.json','package-lock.json'}:
        selected.append(name)

changed = []
for name in selected:
    path = Path(name)
    try:
        text = path.read_text()
    except (UnicodeDecodeError, OSError):
        continue
    new_text = text.replace(OLD_ESC, NEW_ESC).replace(OLD, NEW).replace(OLD_HYPHEN, NEW_HYPHEN)
    if new_text != text:
        path.write_text(new_text)
        changed.append(name)

if not changed:
    raise SystemExit('promotion changed no files')

residual = []
for name in selected:
    path = Path(name)
    try:
        text = path.read_text()
    except (UnicodeDecodeError, OSError):
        continue
    if OLD_ESC in text or OLD in text or OLD_HYPHEN in text:
        residual.append(name)

if residual:
    raise SystemExit('old identity remains in: ' + ', '.join(residual))

print(f'promoted {len(changed)} tracked files')
for name in changed:
    print(name)

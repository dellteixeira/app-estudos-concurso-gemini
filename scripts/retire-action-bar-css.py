from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / 'public' / 'css' / 'base.css',
    ROOT / 'public' / 'css' / 'dashboard.css',
]


def retire_action_bar(source: str) -> str:
    # Remove standalone rules whose selector belongs only to the retired action bar.
    source = re.sub(
        r'(?m)^[ \t]*\.action-bar[^\n{]*\{[^{}]*\}\s*',
        '',
        source,
    )

    # Remove retired selector entries from comma-separated selector lists.
    source = re.sub(
        r'(?m)^[ \t]*(?:body\.light-mode\s+)?\.action-bar,\s*\n',
        '',
        source,
    )

    # Handle the retired selector when it is the last entry before a rule body.
    source = re.sub(
        r',\s*\n[ \t]*(?:body\.light-mode\s+)?\.action-bar\s*\{',
        ' {',
        source,
    )

    # Collapse excessive blank lines created by deleted rules without reformatting files.
    source = re.sub(r'\n{4,}', '\n\n\n', source)
    return source


changed = []
for path in TARGETS:
    before = path.read_text(encoding='utf-8')
    after = retire_action_bar(before)
    if '.action-bar' in after:
        occurrences = [
            line.strip()
            for line in after.splitlines()
            if '.action-bar' in line
        ]
        raise SystemExit(f'{path.name}: action-bar residual: {occurrences}')
    if after != before:
        path.write_text(after, encoding='utf-8', newline='')
        changed.append(path.name)

if not changed:
    raise SystemExit('No CSS files changed; expected legacy action-bar residue was not found.')

print('Retired .action-bar CSS from:', ', '.join(changed))

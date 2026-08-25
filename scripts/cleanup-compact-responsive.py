from pathlib import Path

path = Path('public/css/responsive-system.css')
css = path.read_text(encoding='utf-8')

css = css.replace(
'''   Phase 3 normalizes the application header, navigation and generic
   action toolbars across the canonical viewport bands without changing
   navigation/authentication business logic.
''',
'''   Phase 3 normalizes the application header, navigation and compact
   action menu across the canonical viewport bands without changing
   navigation/authentication business logic.
''',
1
)

old_tablet_header = '''    header.modern-header {
        grid-template-columns: minmax(0, 1fr) auto;
        grid-template-areas:
            "brand sync"
            "controls controls";
    }
'''
new_tablet_header = '''    header.modern-header {
        grid-template-columns: minmax(0, 1fr) auto auto;
        grid-template-areas:
            "brand sync tools"
            "controls controls controls";
    }
'''
if old_tablet_header not in css:
    raise SystemExit('tablet header grid block not found')
css = css.replace(old_tablet_header, new_tablet_header, 1)

old_tablet_utility = '''    header.modern-header .header-utility-cluster {
        grid-column: 1 / -1;
        grid-template-columns: minmax(0, 1fr) minmax(120px, .36fr);
    }
'''
new_tablet_utility = '''    header.modern-header .header-utility-cluster {
        grid-column: 1 / -1;
    }
'''
if old_tablet_utility not in css:
    raise SystemExit('tablet utility legacy grid block not found')
css = css.replace(old_tablet_utility, new_tablet_utility, 1)

old_action_bar = '''
    .action-bar {
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
'''
if old_action_bar not in css:
    raise SystemExit('residual tablet action-bar block not found')
css = css.replace(old_action_bar, '', 1)

for residue in ('.action-bar {', '.action-bar.mobile-open', '.mobile-tools-toggle', '.header-account-actions'):
    if residue in css:
        raise SystemExit(f'legacy responsive residue still present: {residue}')

path.write_text(css, encoding='utf-8')

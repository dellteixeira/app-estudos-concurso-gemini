from pathlib import Path
import subprocess


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Expected block not found: {label}')
    return text.replace(old, new, 1)

# Restore the exact main blob first so unchanged lines keep their original CRLF bytes.
raw = subprocess.check_output(['git', 'show', 'origin/main:public/index.html'])
text = raw.decode('utf-8')
nl = '\r\n'

old_toggle = '            <button class="mobile-tools-toggle" type="button" data-action="toggle-modern-tools" aria-label="Abrir ferramentas">Menu</button>' + nl
new_toggle = nl.join([
'            <div class="compact-actions-menu" data-compact-actions-root>',
'                <button class="compact-actions-toggle" type="button" data-action="toggle-modern-tools" aria-label="Abrir menu de ações" aria-expanded="false" aria-controls="compactActionsDropdown">',
'                    <span aria-hidden="true"></span>',
'                    <span aria-hidden="true"></span>',
'                    <span aria-hidden="true"></span>',
'                </button>',
'                <div id="compactActionsDropdown" class="compact-actions-dropdown" role="menu" hidden aria-hidden="true">',
'                    <button class="compact-menu-item" type="button" data-inline-click="ih-001" role="menuitem">Sincronizar Agora</button>',
'                    <button class="compact-menu-item" type="button" data-inline-click="ih-002" role="menuitem">Ver / Anexar Edital PDF</button>',
'                    <label class="compact-menu-item compact-menu-file" role="menuitem">',
'                        Importar JSON',
'                        <input type="file" id="jsonInput" accept=".json" hidden data-inline-change="ih-003">',
'                    </label>',
'                    <button class="compact-menu-item" type="button" data-inline-click="ih-004" role="menuitem">Analisar Edital com IA</button>',
'                    <button class="compact-menu-item" type="button" data-inline-click="ih-005" role="menuitem">Como Gerar JSON com IA</button>',
'                    <button class="compact-menu-item" type="button" data-action="call" data-call="clearData" role="menuitem">Limpar Edital Atual</button>',
'                    <div class="compact-menu-divider" aria-hidden="true"></div>',
'                    <button class="compact-menu-item" type="button" data-action="open-account" role="menuitem" title="Abrir dados e segurança da conta">Conta</button>',
'                    <button class="compact-menu-item" type="button" data-action="toggle-theme" role="menuitem" title="Alternar modo claro/escuro">Modo Claro/Escuro</button>',
'                    <button class="compact-menu-item compact-menu-danger" type="button" data-action="logout" role="menuitem" title="Sair da conta">Sair</button>',
'                </div>',
'            </div>',
''])
text = replace_once(text, old_toggle, new_toggle, 'header menu trigger')

old_account = nl.join([
'                        <div class="header-account-actions">',
'                            <button class="btn btn-secondary btn-sm btn-account-header" type="button" data-action="open-account" title="Abrir dados e segurança da conta">Conta</button>',
'                            <button class="btn btn-secondary btn-sm btn-theme-header" type="button" data-action="toggle-theme" title="Alternar modo claro/escuro">Modo Claro/Escuro</button>',
'                            <button class="btn btn-secondary btn-sm btn-logout-header" type="button" data-action="logout" title="Sair da conta">Sair</button>',
'                        </div>',
''])
text = replace_once(text, old_account, '', 'header account buttons')
text = text.replace('aria-label="Conta, aparência e pesquisa"', 'aria-label="Pesquisa"', 1)

old_bar = nl.join([
'        <!-- BARRA DE AÇÕES — V9.52: Backup/Restaurar centralizado em Conta -->',
'        <div class="action-bar">',
'            <button class="btn-action" data-inline-click="ih-001">Sincronizar Agora</button>',
'            <button class="btn-action" data-inline-click="ih-002">Ver / Anexar Edital PDF</button>',
'            <label class="btn-action u-static-003">',
'                Importar JSON',
'                <input type="file" id="jsonInput" accept=".json" hidden data-inline-change="ih-003">',
'            </label>',
'            <button class="btn-action" data-inline-click="ih-004">Analisar Edital com IA</button>',
'            <button class="btn-action" data-inline-click="ih-005">Como Gerar JSON com IA</button>',
'            <button class="btn-action" type="button" data-action="call" data-call="clearData">Limpar Edital Atual</button>',
'                    </div>',
'',
''])
text = replace_once(text, old_bar, '', 'legacy horizontal action bar')

mobile_more = '            <button class="mobile-nav-btn" type="button" data-action="toggle-modern-tools"><span>Mais</span></button>' + nl
text = replace_once(text, mobile_more, '', 'duplicate mobile More action')

for legacy in ('mobile-tools-toggle', 'header-account-actions', 'btn-account-header', 'btn-theme-header', 'btn-logout-header', '<div class="action-bar">'):
    if legacy in text:
        raise SystemExit(f'Legacy markup still present: {legacy}')
for handler in ('ih-001','ih-002','ih-003','ih-004','ih-005'):
    if text.count(handler) != 1:
        raise SystemExit(f'Handler {handler} must remain exactly once')
if text.count('data-action="toggle-modern-tools"') != 1:
    raise SystemExit('Compact menu trigger must exist exactly once')

Path('public/index.html').write_bytes(text.encode('utf-8'))

# Tighten the focused regression test to cover cleanup of the mobile duplicate.
test_path = Path('tests/compact-actions-menu.test.cjs')
test = test_path.read_text(encoding='utf-8')
needle = "  assert.doesNotMatch(html,/mobile-tools-toggle|header-account-actions|btn-account-header|btn-theme-header|btn-logout-header/);\n"
replacement = needle + "  assert.equal((html.match(/data-action=\\\"toggle-modern-tools\\\"/g)||[]).length,1);\n  assert.doesNotMatch(html,/>Mais<\\/span>/);\n  assert.match(html,/header-utility-cluster\\\" aria-label=\\\"Pesquisa\\\"/);\n"
if needle not in test:
    raise SystemExit('Focused test insertion point not found')
test = test.replace(needle, replacement, 1)
test_path.write_text(test, encoding='utf-8')

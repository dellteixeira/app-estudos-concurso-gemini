from pathlib import Path
import json


def replace_exact(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}")
    p.write_text(text.replace(old, new, 1))


index = Path("public/index.html")
text = index.read_text()
old = '''                <div class="edital-guide-actions">
                    <button class="btn btn-secondary btn-sm" data-inline-click="ih-009">Expandir Todas as Guias</button>
                    <button class="btn btn-secondary btn-sm" data-inline-click="ih-010">Recolher Todas as Guias</button>
                </div>'''
new = '''                <div class="edital-guide-actions">
                    <button id="toggleAllGuidesBtn" class="btn btn-secondary btn-sm" type="button" data-inline-click="ih-009" aria-expanded="false">Expandir Todas as Guias</button>
                </div>'''
if old not in text:
    raise SystemExit("Guide buttons block not found in public/index.html")
index.write_text(text.replace(old, new, 1))

replace_exact(
    "public/js/app-core.js",
    "        function toggleMateria(materiaName) { openMaterias[materiaName] = !openMaterias[materiaName]; renderTable(); }\n        function toggleAllAccordions(open) { editalItems.forEach(i => openMaterias[i.materia] = open); renderTable(); }",
    "        function syncAllGuidesToggleButton() {\n            const button = document.getElementById('toggleAllGuidesBtn');\n            if (!button) return;\n            const materias = [...new Set(editalItems.map(item => item.materia).filter(Boolean))];\n            const allOpen = materias.length > 0 && materias.every(materia => !!openMaterias[materia]);\n            button.textContent = allOpen ? 'Recolher Todas as Guias' : 'Expandir Todas as Guias';\n            button.setAttribute('aria-expanded', allOpen ? 'true' : 'false');\n        }\n\n        function toggleMateria(materiaName) {\n            openMaterias[materiaName] = !openMaterias[materiaName];\n            renderTable();\n            syncAllGuidesToggleButton();\n        }\n        function toggleAllAccordions(open) {\n            editalItems.forEach(i => openMaterias[i.materia] = open);\n            renderTable();\n            syncAllGuidesToggleButton();\n        }\n        function toggleAllGuides() {\n            const materias = [...new Set(editalItems.map(item => item.materia).filter(Boolean))];\n            const allOpen = materias.length > 0 && materias.every(materia => !!openMaterias[materia]);\n            toggleAllAccordions(!allOpen);\n        }"
)

replace_exact(
    "public/js/app-ui.js",
    "            'ih-009': function(event) { toggleAllAccordions(true) },\n            'ih-010': function(event) { toggleAllAccordions(false) },",
    "            'ih-009': function(event) { toggleAllGuides() },"
)

for path in ["package.json", "config/app-assets.json", "public/version.json"]:
    p = Path(path)
    data = json.loads(p.read_text())
    if str(data.get("version")) != "10.61.0":
        raise SystemExit(f"Unexpected version in {path}: {data.get('version')}")
    data["version"] = "10.62.0"
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

for path in ["public/sw.js", "src/index.js", "public/js/app-pwa.js"]:
    p = Path(path)
    text = p.read_text()
    if "10.61.0" not in text:
        raise SystemExit(f"10.61.0 not found in {path}")
    p.write_text(text.replace("10.61.0", "10.62.0"))

Path("tests/edital-guides-single-toggle-v10.62.test.cjs").write_text('''const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = path => fs.readFileSync(path, 'utf8');

test('Edital usa um único botão alternável para expandir e recolher guias', () => {
  const html = read('public/index.html');
  const ui = read('public/js/app-ui.js');
  const core = read('public/js/app-core.js');
  assert.equal((html.match(/id="toggleAllGuidesBtn"/g) || []).length, 1);
  assert.match(html, /data-inline-click="ih-009"[^>]*>Expandir Todas as Guias<\\/button>/);
  assert.doesNotMatch(html, /data-inline-click="ih-010"/);
  assert.match(ui, /'ih-009': function\\(event\\) \\{ toggleAllGuides\\(\\) \\}/);
  assert.doesNotMatch(ui, /'ih-010':/);
  assert.match(core, /function toggleAllGuides\\(\\)/);
  assert.match(core, /toggleAllAccordions\\(!allOpen\\)/);
  assert.match(core, /button\\.textContent = allOpen \\? 'Recolher Todas as Guias' : 'Expandir Todas as Guias'/);
  assert.match(core, /button\\.setAttribute\\('aria-expanded', allOpen \\? 'true' : 'false'\\)/);
});
''')

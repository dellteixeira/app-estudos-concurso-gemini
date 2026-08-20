from pathlib import Path
import json

reader_path = Path('public/js/pdf/pdf-reader.js')
reader = reader_path.read_text(encoding='utf-8')
old = "closeFlashcardComposer();clearSelection();status('Flashcard salvo na área de Flashcards.');await close();global.openSearchFlashcardResult?.({materia:draft.materia,assunto:draft.assunto})"
new = "closeFlashcardComposer();clearSelection();status('Flashcard salvo. Continue estudando na Biblioteca.')"
if old not in reader:
    raise SystemExit('Trecho esperado de redirecionamento não encontrado')
reader = reader.replace(old, new, 1)
reader_path.write_text(reader, encoding='utf-8')

package_path = Path('package.json')
package_data = json.loads(package_path.read_text(encoding='utf-8'))
package_data['version'] = '10.24.10'
package_path.write_text(json.dumps(package_data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

version_path = Path('public/version.json')
version_data = json.loads(version_path.read_text(encoding='utf-8'))
version_data['version'] = '10.24.10'
version_path.write_text(json.dumps(version_data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

sw_path = Path('public/sw.js')
sw = sw_path.read_text(encoding='utf-8')
sw = sw.replace("const APP_VERSION = '10.24.9';", "const APP_VERSION = '10.24.10';", 1)
sw_path.write_text(sw, encoding='utf-8')

test_path = Path('tests/v10-24-10-keep-library-after-flashcard.test.cjs')
test_path.write_text("""const test=require('node:test');\nconst assert=require('node:assert/strict');\nconst fs=require('node:fs');\nconst reader=fs.readFileSync('public/js/pdf/pdf-reader.js','utf8');\n\ntest('salvar flashcard mantém o leitor da Biblioteca aberto',()=>{\n  assert.match(reader,/Flashcard salvo\\. Continue estudando na Biblioteca\\./);\n  assert.doesNotMatch(reader,/status\\('Flashcard salvo na área de Flashcards\\.'\\);await close\\(\\);global\\.openSearchFlashcardResult/);\n});\n""", encoding='utf-8')

print('v10.24.10 applied')

from pathlib import Path

reader_path = Path('public/js/pdf/pdf-reader.js')
reader = reader_path.read_text(encoding='utf-8')
old = "closeFlashcardComposer();clearSelection();status('Flashcard salvo na área de Flashcards.');await close();global.openSearchFlashcardResult?.({materia:draft.materia,assunto:draft.assunto})"
new = "closeFlashcardComposer();clearSelection();status('Flashcard salvo. Continue estudando na Biblioteca.')"
if old not in reader:
    raise SystemExit('Trecho esperado de redirecionamento não encontrado')
reader = reader.replace(old, new, 1)
reader_path.write_text(reader, encoding='utf-8')

pdf_test_path = Path('tests/pdf-reader.test.cjs')
pdf_test = pdf_test_path.read_text(encoding='utf-8')
pdf_test = pdf_test.replace("test('flashcard do PDF salva a partir do modal e abre o baralho do app'", "test('flashcard do PDF salva a partir do modal e mantém a Biblioteca aberta'", 1)
pdf_test = pdf_test.replace("assert.match(r,/Flashcard salvo na área de Flashcards/);assert.match(r,/global\\.openSearchFlashcardResult\\?\\.\\(\\{materia:draft\\.materia,assunto:draft\\.assunto\\}\\)/);assert.match(u,/function openSearchFlashcardResult\\(fc\\)/);assert.match(u,/setFlashcardViewFilter\\(fc\\.materia \\|\\| '', fc\\.assunto \\|\\| ''\\)/);", "assert.match(r,/Flashcard salvo\\. Continue estudando na Biblioteca\\./);assert.doesNotMatch(r,/await close\\(\\);global\\.openSearchFlashcardResult/);assert.match(u,/function openSearchFlashcardResult\\(fc\\)/);", 1)
pdf_test_path.write_text(pdf_test, encoding='utf-8')

test_path = Path('tests/v10-24-10-keep-library-after-flashcard.test.cjs')
test_path.write_text("""const test=require('node:test');\nconst assert=require('node:assert/strict');\nconst fs=require('node:fs');\nconst reader=fs.readFileSync('public/js/pdf/pdf-reader.js','utf8');\n\ntest('salvar flashcard mantém o leitor da Biblioteca aberto',()=>{\n  assert.match(reader,/Flashcard salvo\\. Continue estudando na Biblioteca\\./);\n  assert.doesNotMatch(reader,/status\\('Flashcard salvo na área de Flashcards\\.'\\);await close\\(\\);global\\.openSearchFlashcardResult/);\n});\n""", encoding='utf-8')

print('keep-library change applied')

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const reader=fs.readFileSync('public/js/pdf/pdf-reader.js','utf8');

test('salvar flashcard mantém o leitor da Biblioteca aberto',()=>{
  assert.match(reader,/Flashcard salvo\. Continue estudando na Biblioteca\./);
  assert.doesNotMatch(reader,/status\('Flashcard salvo na área de Flashcards\.'\);await close\(\);global\.openSearchFlashcardResult/);
});

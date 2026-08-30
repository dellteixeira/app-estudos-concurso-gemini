const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const flashcards=fs.readFileSync('public/js/adaptive-flashcards.js','utf8');
const timeline=fs.readFileSync('public/js/study-evidence-timeline.js','utf8');

test('evento canônico de flashcard coincide entre emissor e timeline',()=>{
  assert.match(flashcards,/adaptive-flashcard-launched/);
  assert.match(timeline,/bind\('adaptive-flashcard-launched','flashcard'\)/);
});

test('evento legado é preservado apenas para compatibilidade',()=>{
  assert.match(flashcards,/adaptive-flashcards-started/);
  assert.match(flashcards,/function emitLaunch/);
});

test('payload permanece mínimo e sem conteúdo de flashcard',()=>{
  assert.match(flashcards,/topicId:/);
  assert.match(flashcards,/reason:/);
  assert.match(flashcards,/source:'adaptive-flashcards'/);
  const emit=flashcards.slice(flashcards.indexOf('function emitLaunch'),flashcards.indexOf('function start'));
  assert.doesNotMatch(emit,/front|back|pergunta|resposta|questionText|answerText/);
});

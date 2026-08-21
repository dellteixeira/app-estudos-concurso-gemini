const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const worker=fs.readFileSync('src/index.js','utf8');
const reader=fs.readFileSync('public/js/pdf/pdf-reader.js','utf8');

test('Gemini é a IA principal dos flashcards com fallback seguro',()=>{
  assert.ok(worker.includes('GEMINI_API_KEY'));
  assert.ok(worker.includes('gemini-3.6-flash'));
  assert.ok(worker.includes('const FLASHCARD_AUTO_CHAIN = ["gemini", "llama"]'));
  assert.ok(worker.includes('responseMimeType: "application/json"'));
  assert.ok(worker.includes('x-goog-api-key'));
  assert.ok(worker.includes('model?.provider === "gemini"'));
  assert.ok(reader.includes('Gemini 3.6 Flash'));
  assert.ok(reader.includes('Automático — Gemini 3.6 + fallback'));
});

test('a chave Gemini não é exposta no frontend',()=>{
  assert.ok(!reader.includes('GEMINI_API_KEY'));
  assert.ok(!reader.includes('x-goog-api-key'));
});

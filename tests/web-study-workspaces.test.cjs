const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const js = fs.readFileSync('public/js/web-study-workspaces.js', 'utf8');
const css = fs.readFileSync('public/css/web-study-workspaces.css', 'utf8');
const appPwa = fs.readFileSync('public/js/app-pwa.js', 'utf8');
const releaseContract = JSON.parse(fs.readFileSync('config/release-contract.json', 'utf8'));

test('flashcards ganha dashboard e ações de estudo sem alterar dados', () => {
  assert.match(js, /data-web-flashcards-dashboard/);
  assert.match(js, /startShuffleStudyModal/);
  assert.match(js, /openModalFiltroEstudoFlashcards/);
  assert.match(js, /setFlashcardViewFilter\('', ''\)/);
});

test('biblioteca ganha busca local não destrutiva', () => {
  assert.match(js, /data-web-library-dashboard/);
  assert.match(js, /data-library-search/);
  assert.match(js, /function filterLibrary/);
  assert.doesNotMatch(js, /removeChild\(|\.remove\(\)/);
});

test('anotações ganham resumo contextual e busca', () => {
  assert.match(js, /data-web-notes-dashboard/);
  assert.match(js, /structuredNotes/);
  assert.match(js, /data-notes-search/);
  assert.match(js, /openModalNovaNota/);
});

test('workspaces não observam toda a árvore DOM nem criam loop de renderização', () => {
  assert.doesNotMatch(js, /observer\.observe\(document\.documentElement/);
  assert.doesNotMatch(js, /new MutationObserver/);
  assert.match(js, /requestAnimationFrame/);
  assert.match(js, /setHtmlIfChanged/);
});

test('buscas pesadas são coalescidas e reutilizam texto normalizado', () => {
  assert.match(js, /WeakMap/);
  assert.match(js, /function debounce/);
  assert.match(js, /library-search/);
  assert.match(js, /notes-search/);
  assert.match(js, /getSearchableText/);
});

test('workspaces possuem adaptação explícita para web mobile', () => {
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.study-workspace-primary\s*\{[\s\S]*width:\s*100%/);
});

test('loader dos workspaces usa a release canônica', () => {
  assert.ok(appPwa.includes(`./css/web-study-workspaces.css?v=${releaseContract.version}`));
  assert.ok(appPwa.includes(`./js/web-study-workspaces.js?v=${releaseContract.version}`));
});

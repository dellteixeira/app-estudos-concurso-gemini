const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const worker=fs.readFileSync('src/index.js','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const version=JSON.parse(fs.readFileSync('public/version.json','utf8'));
const assets=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));
const sw=fs.readFileSync('public/sw.js','utf8');

test('v10.26 builds deterministic evidence before asking AI',()=>{
  const buildPos=worker.indexOf('const evidenceCatalog = buildFlashcardEvidenceCatalog(text)');
  const promptPos=worker.indexOf('const systemPrompt =', buildPos);
  assert.ok(buildPos>0);
  assert.ok(promptPos>buildPos);
  assert.match(worker,/function classifyFlashcardKnowledge\(/);
  assert.match(worker,/knowledgeType: classifyFlashcardKnowledge\(sentence\)/);
});

test('v10.26 uses structured output and low thinking',()=>{
  assert.match(worker,/responseMimeType: "application\/json"/);
  assert.match(worker,/evidenceId: \{ type: "STRING" \}/);
  assert.match(worker,/knowledgeType: \{ type: "STRING" \}/);
  assert.match(worker,/thinkingConfig: \{ thinkingLevel: "LOW" \}/);
});

test('v10.26 validates source grounding and rejects weak questions',()=>{
  assert.match(worker,/function evidenceSupportsAnswer\(/);
  assert.match(worker,/lexicalCoverage >= 0\.72/);
  assert.match(worker,/function isGenericFlashcardQuestion\(/);
  assert.match(worker,/function flashcardQuestionSimilarity\(/);
  assert.match(worker,/reasons\.push\("answer-not-grounded"\)/);
  assert.match(worker,/reasons\.push\("duplicate-question"\)/);
  assert.match(worker,/sourceValidated: true/);
});

test('v10.26 preserves hedge and deterministic fallback',()=>{
  assert.match(worker,/const FLASHCARD_HEDGE_DELAY_MS = 4500/);
  assert.match(worker,/runFlashcardProvidersHedged/);
  assert.match(worker,/buildDeterministicFlashcard/);
  assert.match(worker,/provider: "local-deterministic"/);
});

test('canonical version is synchronized across package, manifest, Worker and Service Worker',()=>{
  const canonical=String(pkg.version||'').trim();
  const publicVersion=String(version.version||'').trim();
  const assetVersion=String(assets.version||'').trim();
  const workerVersion=worker.match(/const APP_VERSION = "([^"]+)"/)?.[1];
  const swVersion=sw.match(/const APP_VERSION = '([^']+)'/)?.[1];
  assert.match(canonical,/^10\.64\.\d+$/);
  assert.equal(publicVersion,canonical);
  assert.equal(assetVersion,canonical);
  assert.equal(workerVersion,canonical);
  assert.equal(swVersion,canonical);
});

import fs from 'node:fs';

const indexPath = 'src/index.js';
let source = fs.readFileSync(indexPath, 'utf8');

source = source.replace('const APP_VERSION = "10.25.6";', 'const APP_VERSION = "10.25.7";');

const functionStart = source.indexOf('async function runGeminiFlashcard(env, model, systemPrompt, userPrompt) {');
const functionEnd = source.indexOf('\nfunction withTimeout(promise, ms, label) {', functionStart);
if (functionStart < 0 || functionEnd < 0) throw new Error('runGeminiFlashcard block not found');

let block = source.slice(functionStart, functionEnd);
block = block.replace('async function runGeminiFlashcard(env, model, systemPrompt, userPrompt) {', 'async function runGeminiFlashcard(env, model, systemPrompt, userPrompt, { compactRetry = false } = {}) {');
block = block.replace('contents: [{ role: "user", parts: [{ text: userPrompt }] }],', 'contents: [{ role: "user", parts: [{ text: compactRetry ? `${userPrompt}\\n\\nRETRY COMPACTO: devolva apenas um JSON curto e completo, com pergunta objetiva e resposta concisa. Não explique, não raciocine em texto e não inclua markdown.` : userPrompt }] }],');
block = block.replace('temperature: 0.35,\n          maxOutputTokens: 600,', 'temperature: compactRetry ? 0.1 : 0.35,\n          maxOutputTokens: compactRetry ? 900 : 1600,');
block = block.replace('console.info(`Flashcard Gemini response model=${model.id} status=200 candidates=${summary.candidates} parts=${summary.parts} textParts=${summary.textParts} textChars=${summary.textChars} finishReasons=${summary.finishReasons}`);', 'console.info(`Flashcard Gemini response model=${model.id} status=200 candidates=${summary.candidates} parts=${summary.parts} textParts=${summary.textParts} textChars=${summary.textChars} finishReasons=${summary.finishReasons} compactRetry=${compactRetry}`);');

const insertionPoint = '  const recovered = parseGeminiFlashcardPayload(payload);\n  if (!recovered?.flashcard) {';
if (!block.includes(insertionPoint)) throw new Error('Gemini recovery insertion point not found');
block = block.replace(insertionPoint, `  const recovered = parseGeminiFlashcardPayload(payload);\n  if (!recovered?.flashcard && !compactRetry && summary.finishReasons.split(',').includes('MAX_TOKENS')) {\n    console.info(\`Flashcard Gemini retry reason=MAX_TOKENS model=\${model.id} firstDuration=\${Date.now() - startedAt}ms\`);\n    return runGeminiFlashcard(env, model, systemPrompt, userPrompt, { compactRetry: true });\n  }\n  if (!recovered?.flashcard) {`);

source = source.slice(0, functionStart) + block + source.slice(functionEnd);
fs.writeFileSync(indexPath, source);

for (const path of ['package.json', 'public/version.json', 'public/sw.js']) {
  let text = fs.readFileSync(path, 'utf8');
  text = text.replaceAll('10.25.6', '10.25.7');
  fs.writeFileSync(path, text);
}

for (const name of fs.readdirSync('tests').filter(name => name.endsWith('.test.cjs'))) {
  const path = `tests/${name}`;
  let text = fs.readFileSync(path, 'utf8');
  const updated = text
    .replaceAll('10.25.6', '10.25.7')
    .replaceAll('10\\.25\\.6', '10\\.25\\.7')
    .replaceAll('10\\\\.25\\\\.6', '10\\\\.25\\\\.7');
  if (updated !== text) fs.writeFileSync(path, updated);
}

fs.writeFileSync('tests/v10-25-7-gemini-max-tokens-retry.test.cjs', `const test=require('node:test');\nconst assert=require('node:assert/strict');\nconst fs=require('node:fs');\nconst worker=fs.readFileSync('src/index.js','utf8');\n\ntest('v10.25.7 increases Gemini output budget',()=>{\n  assert.match(worker,/maxOutputTokens: compactRetry \\? 900 : 1600/);\n  assert.match(worker,/const APP_VERSION = \\\"10\\.25\\.7\\\"/);\n});\n\ntest('v10.25.7 retries Gemini once when MAX_TOKENS truncates JSON',()=>{\n  assert.match(worker,/compactRetry = false/);\n  assert.match(worker,/summary\\.finishReasons\\.split\\('\\,'\\)\\.includes\\('MAX_TOKENS'\\)/);\n  assert.match(worker,/runGeminiFlashcard\\(env, model, systemPrompt, userPrompt, \\{ compactRetry: true \\}\\)/);\n  assert.match(worker,/RETRY COMPACTO/);\n});\n\ntest('v10.25.7 keeps hedge and fallback intact',()=>{\n  assert.match(worker,/FLASHCARD_HEDGE_DELAY_MS = 4500/);\n  assert.match(worker,/runFlashcardProvidersHedged/);\n  assert.match(worker,/buildDeterministicFlashcard/);\n});\n\ntest('v10.25.7 logs retry without source content',()=>{\n  assert.match(worker,/Flashcard Gemini retry reason=MAX_TOKENS/);\n  assert.doesNotMatch(worker,/console\\.(?:info|warn)\\([^\\n]*TRECHO-FONTE/);\n});\n`);

const normalWorkflow = `name: Quality Check\n\non:\n  push:\n    branches: [main]\n  pull_request:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n\njobs:\n  test-and-audit:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n      - name: Testes automatizados\n        run: node --test tests/*.test.cjs\n      - name: Auditoria estrutural\n        env:\n          AUDIT_ALLOW_ANY_ROOT: '1'\n        run: node scripts/audit-release.mjs\n`;
fs.writeFileSync('.github/workflows/quality-check.yml', normalWorkflow);
fs.rmSync(new URL(import.meta.url), { force: true });

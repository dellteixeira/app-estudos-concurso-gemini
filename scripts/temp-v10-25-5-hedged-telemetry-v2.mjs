import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const sourcePath = new URL('./temp-v10-25-5-hedged-telemetry.mjs', import.meta.url);
const fixedPath = new URL('./temp-v10-25-5-hedged-telemetry-fixed.mjs', import.meta.url);
let source = fs.readFileSync(sourcePath, 'utf8');
source = source.replace(
  "duration=${durationMs}ms hedged=${hedged}",
  "duration=\\${durationMs}ms hedged=\\${hedged}"
);
fs.writeFileSync(fixedPath, source);

const replaceInFile = (path, from, to) => {
  const current = fs.readFileSync(path, 'utf8');
  if (!current.includes(from)) throw new Error(`${path}: regression token not found: ${from}`);
  fs.writeFileSync(path, current.replace(from, to));
};

try {
  await import(pathToFileURL(fixedPath.pathname).href + `?ts=${Date.now()}`);

  replaceInFile(
    'tests/v10-24-9-flashcard-ai.test.cjs',
    'assert.match(worker,/model\\.provider === "gemini"/);',
    'assert.match(worker,/model\\?\\.provider === "gemini"/);'
  );
  replaceInFile(
    'tests/v10-25-1-gemini-flashcards.test.cjs',
    'assert.ok(worker.includes(\'model.provider === "gemini"\'));',
    'assert.ok(worker.includes(\'model?.provider === "gemini"\'));'
  );
  replaceInFile(
    'tests/v10-25-3-ai-resilience.test.cjs',
    'assert.ok(worker.includes(\'provider, modelKey: key, fallbackUsed\'));',
    'assert.ok(worker.includes(\'provider: result.provider, modelKey: result.key, fallbackUsed\'));'
  );
  replaceInFile(
    'tests/v10-25-library-ai-models.test.cjs',
    'assert.match(worker,/model\\.provider === "gemini"/);',
    'assert.match(worker,/model\\?\\.provider === "gemini"/);'
  );
} finally {
  fs.rmSync(fixedPath, { force: true });
}

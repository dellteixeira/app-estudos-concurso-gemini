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
try {
  await import(pathToFileURL(fixedPath.pathname).href + `?ts=${Date.now()}`);
} finally {
  fs.rmSync(fixedPath, { force: true });
}

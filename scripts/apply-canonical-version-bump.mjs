import fs from 'node:fs';

const FROM = '10.26.0';
const TO = '10.26.1';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`);
}

const pkg = JSON.parse(read('package.json'));
if (![FROM, TO].includes(pkg.version)) throw new Error(`package.json version inesperada: ${pkg.version}`);
pkg.version = TO;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

const publicVersion = JSON.parse(read('public/version.json'));
if (![FROM, TO].includes(publicVersion.version)) throw new Error(`public/version.json version inesperada: ${publicVersion.version}`);
publicVersion.version = TO;
write('public/version.json', `${JSON.stringify(publicVersion, null, 2)}\n`);

const workerPath = 'src/index.js';
let worker = read(workerPath);
const workerOld = `const APP_VERSION = "${FROM}";`;
const workerNew = `const APP_VERSION = "${TO}";`;
if (worker.includes(workerOld)) worker = worker.replace(workerOld, workerNew);
else if (!worker.includes(workerNew)) throw new Error('APP_VERSION do Worker não corresponde ao baseline esperado.');
write(workerPath, worker);

const swPath = 'public/sw.js';
let sw = read(swPath);
const swOld = `const APP_VERSION = '${FROM}';`;
const swNew = `const APP_VERSION = '${TO}';`;
if (sw.includes(swOld)) sw = sw.replace(swOld, swNew);
else if (!sw.includes(swNew)) throw new Error('APP_VERSION do Service Worker não corresponde ao baseline esperado.');
write(swPath, sw);

const checks = {
  package: JSON.parse(read('package.json')).version,
  public: JSON.parse(read('public/version.json')).version,
  worker: read(workerPath).match(/const APP_VERSION = "([^"]+)"/)?.[1],
  serviceWorker: read(swPath).match(/const APP_VERSION = '([^']+)'/)?.[1]
};
if (Object.values(checks).some(version => version !== TO)) {
  throw new Error(`Versões inconsistentes após bump: ${JSON.stringify(checks)}`);
}
console.log(`Canonical version bump applied: ${FROM} -> ${TO}`);

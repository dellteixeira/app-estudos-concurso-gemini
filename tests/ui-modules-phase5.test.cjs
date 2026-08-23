const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const modules = [
  'public/js/ui/mobile.js',
  'public/js/ui/navigation.js',
  'public/js/ui/search.js'
];

test('fase 5 separa navegação, busca e comportamento mobile em módulos próprios', () => {
  for (const file of modules) assert.ok(fs.existsSync(path.join(root, file)), `${file} deve existir`);
  assert.match(read(modules[0]), /AppMobileUI/);
  assert.match(read(modules[1]), /AppNavigation/);
  assert.match(read(modules[2]), /AppSearch/);
});

test('novos módulos de UI possuem sintaxe JavaScript válida', () => {
  for (const file of modules) {
    const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});

test('bootstrap carrega módulos após o núcleo com fallback legado', () => {
  const bootstrap = read('public/pwa-update.js');
  const mobile = bootstrap.indexOf("'./js/ui/mobile.js'");
  const navigation = bootstrap.indexOf("'./js/ui/navigation.js'");
  const search = bootstrap.indexOf("'./js/ui/search.js'");
  assert.ok(mobile >= 0 && navigation > mobile && search > navigation);
  assert.match(bootstrap, /__uiModulesReady/);
  assert.match(bootstrap, /compatibilidade legada permanecerá ativa/);
});

test('módulos de UI fazem parte do app shell offline e da estratégia core', () => {
  const sw = read('public/sw.js');
  for (const asset of ['./js/ui/mobile.js', './js/ui/navigation.js', './js/ui/search.js']) {
    assert.ok(sw.includes(asset), `${asset} deve integrar o app shell`);
  }
  for (const asset of ['/js/ui/mobile.js', '/js/ui/navigation.js', '/js/ui/search.js']) {
    assert.ok(sw.includes(asset), `${asset} deve ser core asset`);
  }
});

test('fase 5 não introduz acesso direto a Supabase nos módulos de UI', () => {
  for (const file of modules) {
    const source = read(file);
    assert.doesNotMatch(source, /supabase|service_role|from\s*\(/i, `${file} deve permanecer apenas na camada de interface`);
  }
});

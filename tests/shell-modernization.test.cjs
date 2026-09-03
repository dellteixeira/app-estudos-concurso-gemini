const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('modern shell is loaded after canonical/responsive UI and only once', () => {
  const navigation = read('public/js/ui/navigation.js');
  const canonical = navigation.indexOf("data-canonical-ui");
  const responsive = navigation.indexOf("data-responsive-polish");
  const shell = navigation.indexOf("data-shell-modernization");

  assert.ok(canonical >= 0, 'canonical UI loader must remain present');
  assert.ok(responsive > canonical, 'responsive polish must remain after canonical UI');
  assert.ok(shell > responsive, 'shell modernization must load after the stable responsive layer');
  assert.match(navigation, /querySelector\('link\[data-shell-modernization\]'\)/);
  assert.match(navigation, /shell-modernization\.css/);
});

test('modern shell stays presentation-only and avoids global reactive loops', () => {
  const css = read('public/css/shell-modernization.css');
  const navigation = read('public/js/ui/navigation.js');

  assert.doesNotMatch(css, /javascript:/i);
  assert.doesNotMatch(navigation, /MutationObserver/);
  assert.doesNotMatch(navigation, /setInterval\s*\(/);
  assert.doesNotMatch(navigation, /document\.documentElement.*subtree\s*:\s*true/s);
});

test('modern shell preserves the five canonical study tabs', () => {
  const html = read('public/index.html');
  for (const tab of ['tab-edital', 'tab-calendario', 'tab-biblioteca', 'tab-flashcards', 'tab-anotacoes']) {
    assert.match(html, new RegExp(`data-tab=["']${tab}["']`), `${tab} navigation must remain available`);
  }
});

test('modern shell participates in the canonical offline and worker contracts', () => {
  const assets = JSON.parse(read('config/app-assets.json'));
  const sw = read('public/sw.js');
  const worker = read('src/index.js');
  const route = '/css/shell-modernization.css';

  assert.ok(assets.criticalAppShell.includes(route), 'shell CSS must be pre-cached for first-install offline use');
  assert.ok(assets.networkFirstPaths.includes(route), 'shell CSS must follow the canonical network-first policy');
  assert.ok(assets.workerNoStorePaths.includes(route), 'worker must not serve a stale shell asset');
  assert.match(sw, /shell-modernization\.css/, 'service worker must know the shell CSS');
  assert.match(worker, /shell-modernization\.css/, 'Cloudflare worker must know the shell CSS');
});

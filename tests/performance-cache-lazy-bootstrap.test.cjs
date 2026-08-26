const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const swPath = path.join(root, 'public/sw.js');
const loaderPath = path.join(root, 'public/js/performance-loader.js');

function source(file) {
  return fs.readFileSync(file, 'utf8');
}

test('service worker serves static assets from cache while revalidating in background', () => {
  const code = source(swPath);
  assert.doesNotThrow(() => new vm.Script(code));
  assert.match(code, /ALWAYS_NETWORK_FIRST/);
  assert.match(code, /event\.waitUntil\(updateCacheFromNetwork/);
  assert.match(code, /if \(cached\)/);
  assert.match(code, /return cached/);
  assert.match(code, /cache:'no-cache'/);
  assert.doesNotMatch(code, /fetch\(request, \{ cache:'no-store' \}\)/);
});

test('heavy optional offline assets are not primed during activation', () => {
  const code = source(swPath);
  const activateBlock = code.slice(code.indexOf("self.addEventListener('activate'"), code.indexOf("self.addEventListener('message'"));
  assert.doesNotMatch(activateBlock, /primeOptionalAssets/);
  assert.match(code, /PRIME_OFFLINE_ASSETS/);
  assert.match(code, /primeOptionalAssets/);
});

test('performance loader defers metrics and heavy feature warmups', () => {
  const code = source(loaderPath);
  assert.doesNotThrow(() => new vm.Script(code));
  assert.match(code, /scheduleIdleTask\(ensurePerformanceMetrics, 2600\)/);
  assert.match(code, /warmPdfAssets/);
  assert.match(code, /pointerenter/);
  assert.match(code, /touchstart/);
  assert.match(code, /setTimeout\(warmOptionalFeatures, 3600\)/);
});

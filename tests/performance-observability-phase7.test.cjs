const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const metricsPath = path.join(root, 'public/js/performance-metrics.js');
const loaderPath = path.join(root, 'public/js/performance-loader.js');
const swPath = path.join(root, 'public/sw.js');

const metrics = fs.readFileSync(metricsPath, 'utf8');
const loader = fs.readFileSync(loaderPath, 'utf8');
const sw = fs.readFileSync(swPath, 'utf8');

test('phase 7 scripts have valid JavaScript syntax', () => {
  assert.doesNotThrow(() => new vm.Script(metrics, { filename: metricsPath }));
  assert.doesNotThrow(() => new vm.Script(loader, { filename: loaderPath }));
});

test('phase 7 measures requested browser metrics', () => {
  for (const token of [
    "largest-contentful-paint",
    "layout-shift",
    "'event'",
    "'longtask'",
    'domContentLoadedMs',
    'startupMs',
    'ttfbMs'
  ]) {
    assert.match(metrics, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('phase 7 uses Core Web Vitals thresholds and local-only history', () => {
  assert.match(metrics, /lcp:\s*\{\s*good:\s*2500,\s*needsImprovement:\s*4000/);
  assert.match(metrics, /inp:\s*\{\s*good:\s*200,\s*needsImprovement:\s*500/);
  assert.match(metrics, /cls:\s*\{\s*good:\s*0\.1,\s*needsImprovement:\s*0\.25/);
  assert.match(metrics, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(metrics, /MAX_SAMPLES\s*=\s*20/);
  assert.doesNotMatch(metrics, /supabase/i);
  assert.doesNotMatch(metrics, /fetch\s*\(/);
  assert.doesNotMatch(metrics, /sendBeacon/);
});

test('phase 7 exposes diagnostics and handles unsupported browser APIs', () => {
  assert.match(metrics, /supportedEntryTypes/);
  assert.match(metrics, /indisponível/);
  assert.match(metrics, /Diagnóstico de performance/);
  assert.match(metrics, /copyDiagnostics/);
  assert.match(metrics, /btnPerformanceDiagnostics/);
});

test('performance loader starts metrics as a non-critical enhancement', () => {
  assert.match(loader, /ensurePerformanceMetrics/);
  assert.match(loader, /\.\/js\/performance-metrics\.js/);
  assert.match(loader, /catch\(error\s*=>/);
});

test('performance support remains available offline without becoming critical app shell', () => {
  const optionalStart = sw.indexOf('const OPTIONAL_OFFLINE_ASSETS');
  const optionalEnd = sw.indexOf('];', optionalStart);
  const optionalBlock = sw.slice(optionalStart, optionalEnd);
  const criticalStart = sw.indexOf('const CRITICAL_APP_SHELL');
  const criticalEnd = sw.indexOf('];', criticalStart);
  const criticalBlock = sw.slice(criticalStart, criticalEnd);

  assert.match(optionalBlock, /performance-loader\.js/);
  assert.match(optionalBlock, /performance-metrics\.js/);
  assert.doesNotMatch(criticalBlock, /performance-metrics\.js/);
  assert.match(sw, /\/js\/performance-metrics\.js/);
});

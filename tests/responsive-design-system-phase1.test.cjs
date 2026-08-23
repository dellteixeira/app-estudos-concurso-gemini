// Phase 1 contract: responsive tokens, canonical viewport bands and offline shell integration.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cssPath = path.join(root, 'public/css/responsive-system.css');
const htmlPath = path.join(root, 'public/index.html');
const swPath = path.join(root, 'public/sw.js');

test('responsive design system defines canonical tokens and viewport bands', () => {
  const css = fs.readFileSync(cssPath, 'utf8');
  for (const token of [
    '--space-1:', '--space-4:', '--control-md:', '--touch-target:',
    '--radius-lg:', '--content-max:', '--page-gutter:', '--safe-bottom:'
  ]) assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /@media \(min-width: 601px\) and \(max-width: 900px\)/);
  assert.match(css, /@media \(min-width: 901px\) and \(max-width: 1200px\)/);
  assert.match(css, /@media \(min-width: 1201px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('responsive system is loaded by the app and cached by the service worker', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const sw = fs.readFileSync(swPath, 'utf8');
  assert.match(html, /\.\/css\/responsive-system\.css/);
  assert.match(sw, /\.\/css\/responsive-system\.css/);
});

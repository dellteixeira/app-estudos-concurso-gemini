const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'public/js/pdf/pdf-offline-library-manager.js'), 'utf8');
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

test('Fase 7 permanece na linha canônica 10.64.x', () => {
  assert.match(packageVersion, /^10\.64\.\d+$/);
});

test('worker encerra imediatamente quando encontra pausa de política', () => {
  const worker = manager.slice(manager.indexOf('async function worker'), manager.indexOf('async function start'));
  assert.match(worker, /if\(paused\)break;/);
  assert.doesNotMatch(worker, /while\(paused[\s\S]*await sleep/);
});

test('pausa por offline ou rede não permitida encerra o worker', () => {
  const worker = manager.slice(manager.indexOf('async function worker'), manager.indexOf('async function start'));
  assert.match(worker, /if\(!global\.navigator\.onLine\)\{paused=true;[\s\S]*emit\('paused',[\s\S]*break\}/);
  assert.match(worker, /if\(!network\.allowed\)\{paused=true;[\s\S]*emit\('paused',[\s\S]*break\}/);
});

test('start libera running após todos os workers encerrarem para permitir retomada', () => {
  const start = manager.slice(manager.indexOf('async function start'), manager.indexOf('function cancel'));
  assert.match(start, /await Promise\.all\([\s\S]*worker\(runId\)[\s\S]*\)/);
  assert.match(start, /finally\{[\s\S]*running=false;activeDownloads\.clear\(\)/);
  assert.match(manager, /if\(running\)\{schedulePolicyResume\(reason,350\);return\}/);
});

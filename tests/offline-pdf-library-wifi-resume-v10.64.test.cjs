const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'public/js/pdf/pdf-offline-library-manager.js'), 'utf8');

test('fila pausada observa mudança do tipo de conexão', () => {
  assert.match(manager, /connection\?\.addEventListener\?\.\('change'/);
  assert.match(manager, /if\(paused\)schedulePolicyResume\('connection-change',250\)/);
});

test('desativar Somente Wi-Fi agenda retomada quando a fila está pausada', () => {
  assert.match(manager, /if\(!settings\.wifiOnly&&paused\)schedulePolicyResume\('wifi-only-disabled',0\)/);
});

test('retomada revalida online e política de rede antes de reiniciar', () => {
  const resume = manager.slice(manager.indexOf("function schedulePolicyResume"), manager.indexOf('async function listTargets'));
  assert.match(resume, /if\(!global\.navigator\.onLine\)/);
  assert.match(resume, /const network=connectionStatus\(s\)/);
  assert.match(resume, /if\(s\.wifiOnly&&!network\.allowed\)/);
  assert.match(resume, /paused=false;lastError='';emit\('resuming'/);
  assert.match(resume, /await syncCurrentPolicy\(\)/);
});

test('cancelamento remove retomada pendente', () => {
  const cancel = manager.slice(manager.indexOf('function cancel()'), manager.indexOf('async function syncCurrentPolicy'));
  assert.match(cancel, /clearTimeout\?\.\(resumeTimer\)/);
  assert.match(cancel, /resumeTimer=0/);
});

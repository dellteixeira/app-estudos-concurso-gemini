const test = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../public/js/study-domain.js');

test('merge de sessões deduplica por id e preserva versão primária', () => {
  const cloud=[{id:'a',minutes:30,createdAt:'2026-08-18T10:00:00Z',materia:'A'}];
  const local=[{id:'a',minutes:40,createdAt:'2026-08-18T10:00:00Z',materia:'A'},{id:'b',minutes:20,createdAt:'2026-08-18T11:00:00Z'}];
  const merged=domain.mergeStudySessions(local,cloud);
  assert.equal(merged.length,2);
  assert.equal(merged.find(x=>x.id==='a').minutes,40);
});

test('merge deduplica legado por fingerprint quando não existe id', () => {
  const s={dateKey:'2026-08-18',materia:'A',assunto:'X',activityType:'teoria',minutes:40};
  assert.equal(domain.mergeStudySessions([s],[{...s}]).length,1);
});

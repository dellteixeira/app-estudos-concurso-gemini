const test = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../public/js/study-domain.js');

test('minutos usam a primeira duração válida e arredondam corretamente', () => {
  assert.equal(domain.getSessionMinutes({ minutes: 26.4 }), 26);
  assert.equal(domain.getSessionMinutes({ durationMinutes: 40 }), 40);
  assert.equal(domain.getSessionMinutes({ minutes: 0, focusMinutes: 15 }), 15);
  assert.equal(domain.getSessionMinutes({ minutes: -10 }), 0);
});

test('total permanente soma somente minutos válidos de studySessions', () => {
  assert.equal(domain.totalStudyMinutes([{minutes:40},{durationMinutes:25},{minutes:0},{elapsedMinutes:12}]), 77);
});

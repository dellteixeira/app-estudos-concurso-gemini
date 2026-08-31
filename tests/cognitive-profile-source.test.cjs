const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('public/js/core/cognitive-profile-source.js', 'utf8');

function loadSource() {
  const window = {};
  window.window = window;
  const context = vm.createContext({ window, Date, Number, String, Object, Array });
  vm.runInContext(`
    let currentUser = { id: 'user-lexical' };
    let currentConcurso = 'TJ-CE';
    function getConcursosMetadata() {
      return {
        'TJ-CE': {
          studySessions: [{ id: 's1', minutes: 35 }],
          retentionEngine: {
            topics: {
              'p': {
                materia: 'Português',
                assunto: 'Pontuação',
                retention: .8,
                questionStats: { averageAccuracy: 76 }
              }
            }
          }
        }
      };
    }
    function calculateRetentionFromState() { return .84; }
  `, context);
  vm.runInContext(source, context, { filename: 'cognitive-profile-source.js' });
  return window.AppCognitiveDataSource;
}

test('snapshot reads authenticated lexical context without exposing scheduler state', () => {
  const api = loadSource();
  const snapshot = api.snapshot();
  assert.equal(snapshot.userId, 'user-lexical');
  assert.equal(snapshot.contest, 'TJ-CE');
  assert.equal(snapshot.sessions.length, 1);
  assert.equal(snapshot.rows.length, 1);
  assert.equal(snapshot.rows[0].retention, .84);
  assert.equal(snapshot.rows[0].questionAccuracy, 76);
  assert.equal('schedule' in snapshot, false);
  assert.equal('calendar' in snapshot, false);
});

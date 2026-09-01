const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('public/js/core/cognitive-profile-runtime.js', 'utf8');

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function createRuntime() {
  const storage = new Map();
  const select = {
    value: 'TJ-CE',
    dataset: {},
    addEventListener() {}
  };
  const document = {
    readyState: 'complete',
    hidden: false,
    getElementById(id) {
      if (id === 'concursoSelect') return select;
      if (id === 'edital-title') return { textContent: 'Edital: TJ-CE' };
      return null;
    },
    addEventListener() {}
  };
  const localStorage = {
    get length() { return storage.size; },
    key(index) { return [...storage.keys()][index] ?? null; },
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(String(key), String(value)); },
    removeItem(key) { storage.delete(String(key)); }
  };

  const contestMeta = {
    studySessions: [
      { id: 's1', materia: 'Português', assunto: 'Pontuação', minutes: 40, createdAt: '2026-08-31T10:00:00Z' }
    ],
    retentionEngine: {
      topics: {
        'Português - Pontuação': {
          key: 'Português - Pontuação',
          materia: 'Português',
          assunto: 'Pontuação',
          retention: 70,
          difficulty: 6,
          lapseCount: 1,
          reviewCount: 2,
          sessionCount: 3,
          totalMinutes: 100,
          updatedAt: '2026-08-31T12:00:00Z',
          questionStats: { averageAccuracy: 82, lastAccuracy: 80, confidence: 0.8 }
        }
      }
    }
  };

  let refreshInput = null;
  const window = {
    document,
    localStorage,
    editalItems: [
      { materia: 'Português', assunto: 'Pontuação', prioridade: 1, assunto_prioridade: 7 }
    ],
    atob(value) { return Buffer.from(value, 'base64').toString('utf8'); },
    setTimeout(fn) { fn(); return 1; },
    clearTimeout() {},
    addEventListener() {},
    dispatchEvent() {},
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    AppCognitiveProfile: {
      refresh(input) {
        refreshInput = input;
        return { userId: input.userId, contest: input.contest, updatedAt: 'now', metrics: { avgRetention: 74 } };
      },
      read() { return null; }
    },
    getConcursosMetadata() { return { 'TJ-CE': contestMeta }; },
    calculateRetentionFromState() { return 74; },
    loadData() {},
    syncAllWithSupabase() {},
    changeConcurso() {},
    recordStudyMinutesForContext() {},
    submitQuestionPerformance() {},
    submitAdaptiveReviewFeedback() {},
    rebuildRetentionEngineForContest() {},
    renderRetentionDiagnostics() {}
  };
  window.window = window;

  const context = vm.createContext({ window, document, CustomEvent: window.CustomEvent });
  vm.runInContext(source, context, { filename: 'cognitive-profile-runtime.js' });
  return { window, localStorage, storage, select, contestMeta, getRefreshInput: () => refreshInput };
}

test('resolve authenticated user from Supabase persisted session without global currentUser', () => {
  const runtime = createRuntime();
  const token = `x.${encodePayload({ sub: 'user-123' })}.y`;
  runtime.localStorage.setItem('sb-project-auth-token', JSON.stringify({ access_token: token }));
  assert.equal(runtime.window.AppCognitiveProfileRuntime.resolveUserId(), 'user-123');
});

test('buildRows uses live retention and question performance from retention engine', () => {
  const runtime = createRuntime();
  const rows = runtime.window.AppCognitiveProfileRuntime.buildRows(runtime.contestMeta);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].materia, 'Português');
  assert.equal(rows[0].assunto, 'Pontuação');
  assert.equal(rows[0].retention, 74);
  assert.equal(rows[0].questionAccuracy, 82);
  assert.equal(rows[0].state.lapseCount, 1);
});

test('buildRows transports imported edital priorities without recalculating them', () => {
  const runtime = createRuntime();
  const rows = runtime.window.AppCognitiveProfileRuntime.buildRows(runtime.contestMeta);
  assert.equal(rows[0].editalPriority, 1);
  assert.equal(rows[0].topicPriority, 7);
});

test('refresh scopes cognitive snapshot to authenticated user and selected contest', () => {
  const runtime = createRuntime();
  runtime.localStorage.setItem('sb-project-auth-token', JSON.stringify({ user: { id: 'user-abc' } }));
  const profile = runtime.window.AppCognitiveProfileRuntime.refresh({ force: true });
  const input = runtime.getRefreshInput();
  assert.equal(profile.userId, 'user-abc');
  assert.equal(input.userId, 'user-abc');
  assert.equal(input.contest, 'TJ-CE');
  assert.equal(input.rows.length, 1);
  assert.equal(input.sessions.length, 1);
});

test('runtime wraps study mutations without changing their return values', async () => {
  const runtime = createRuntime();
  runtime.localStorage.setItem('sb-project-auth-token', JSON.stringify({ user: { id: 'user-wrap' } }));
  runtime.window.recordStudyMinutesForContext = async () => {
    runtime.contestMeta.retentionEngine.topics['Português - Pontuação'].totalMinutes += 10;
    return { id: 'kept-result' };
  };
  runtime.window.AppCognitiveProfileRuntime.installHooks();
  const result = await runtime.window.recordStudyMinutesForContext();
  assert.deepEqual(result, { id: 'kept-result' });
  assert.ok(runtime.getRefreshInput(), 'profile should refresh after a completed study mutation');
});

test('renderRetentionDiagnostics is never monkey-patched as a cognitive mutation', () => {
  const runtime = createRuntime();
  const original = runtime.window.renderRetentionDiagnostics;
  runtime.window.AppCognitiveProfileRuntime.installHooks();
  assert.equal(runtime.window.renderRetentionDiagnostics, original);
  assert.doesNotMatch(source, /'renderRetentionDiagnostics'\s*,/);
});

test('fingerprint changes when any tracked topic changes, not only the last row', () => {
  const runtime = createRuntime();
  const api = runtime.window.AppCognitiveProfileRuntime;
  const rows = api.buildRows(runtime.contestMeta);
  const first = api.fingerprintInput('u', 'TJ-CE', rows, runtime.contestMeta.studySessions);
  rows[0].state.reviewCount += 1;
  const second = api.fingerprintInput('u', 'TJ-CE', rows, runtime.contestMeta.studySessions);
  assert.notEqual(first, second);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const dashboardSource = fs.readFileSync('public/js/core/domain-risk-dashboard.js', 'utf8');

function loadDashboard() {
  const listeners = new Map();
  const document = {
    readyState: 'loading',
    addEventListener(name, fn) { listeners.set(name, fn); },
    getElementById() { return null; }
  };
  const window = {
    document,
    clearTimeout,
    setTimeout,
    addEventListener() {},
    dispatchEvent() {}
  };
  window.window = window;
  const context = vm.createContext({ window, document, Number, String, Object, Array, Math, JSON, Map, Set, Date, clearTimeout, setTimeout });
  vm.runInContext(dashboardSource, context, { filename: 'domain-risk-dashboard.js' });
  return window.AppDomainRiskDashboard;
}

function profile() {
  return {
    metrics: {
      weightedMastery: 64,
      weightedCoverage: 48,
      highRiskTopics: 1,
      mediumRiskTopics: 1,
      atRiskTopics: 2
    },
    topicState: {
      'a::primeiro': {
        materia: 'Matéria A', assunto: 'Primeiro',
        domainRisk: { masteryScore: 88, predictedRetention7d: 84, forgettingRisk: 21, riskBand: 'low', evidenceLevel: 'high', trend: 'stable', priorityWeight: 1 }
      },
      'b::segundo': {
        materia: 'Matéria B', assunto: 'Segundo',
        domainRisk: { masteryScore: 43, predictedRetention7d: 48, forgettingRisk: 72, riskBand: 'high', evidenceLevel: 'medium', trend: 'declining', priorityWeight: 4 }
      },
      'c::terceiro': {
        materia: 'Matéria C', assunto: 'Terceiro',
        domainRisk: { masteryScore: 59, predictedRetention7d: 61, forgettingRisk: 49, riskBand: 'medium', evidenceLevel: 'low', trend: 'insufficient_evidence', priorityWeight: 3 }
      }
    }
  };
}

test('view model consolida domínio, cobertura, previsão e qualidade da evidência', () => {
  const api = loadDashboard();
  const view = api.buildViewModel(profile());
  assert.equal(view.weightedMastery, 64);
  assert.equal(view.weightedCoverage, 48);
  assert.equal(view.highRiskTopics, 1);
  assert.equal(view.mediumRiskTopics, 1);
  assert.equal(view.atRiskTopics, 2);
  assert.ok(view.predictedRetention7d >= 0 && view.predictedRetention7d <= 100);
  assert.equal(view.evidenceCoverage, 67);
});

test('fila de atenção ordena uma cópia por risco sem alterar ordem canônica do topicState', () => {
  const api = loadDashboard();
  const input = profile();
  const before = Object.keys(input.topicState);
  const queue = api.getAttentionQueue(input, 6);
  assert.deepEqual(Object.keys(input.topicState), before);
  assert.deepEqual(queue.map(entry => entry.key), ['b::segundo', 'c::terceiro']);
});

test('Fase 6A permanece diagnóstica e não expõe ação de reordenação', () => {
  const api = loadDashboard();
  assert.equal(typeof api.buildViewModel, 'function');
  assert.equal(typeof api.getAttentionQueue, 'function');
  assert.equal(typeof api.findTopicInsight, 'function');
  assert.equal('reorder' in api, false);
  assert.equal('updatePriority' in api, false);
});

test('contrato visual e carregamento da fase 6A existem no app shell', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  const css = fs.readFileSync('public/css/features.css', 'utf8');
  assert.match(html, /id="phase6aDomainRiskPanel"/);
  assert.match(html, /id="phase6aWeightedMastery"/);
  assert.match(html, /id="phase6aWeightedCoverage"/);
  assert.match(html, /id="phase6aPredictedRetention"/);
  assert.match(html, /id="phase6aAttentionList"/);
  assert.match(html, /\.\/js\/core\/cognitive-profile-source\.js/);
  assert.match(html, /\.\/js\/core\/cognitive-profile\.js/);
  assert.match(html, /\.\/js\/core\/cognitive-profile-runtime\.js/);
  assert.match(html, /\.\/js\/core\/domain-risk-dashboard\.js/);
  assert.match(css, /\.domain-risk-panel/);
  assert.match(css, /\.domain-risk-topic/);
});

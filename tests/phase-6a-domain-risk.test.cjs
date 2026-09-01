const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('public/js/core/cognitive-profile.js', 'utf8');

function loadProfileApi() {
  const storage = new Map();
  const window = {
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); }
    }
  };
  window.window = window;
  const context = vm.createContext({
    window,
    Date,
    Number,
    String,
    Object,
    Array,
    Math,
    JSON,
    Map,
    Set
  });
  vm.runInContext(source, context, { filename: 'cognitive-profile.js' });
  return window.AppCognitiveProfile;
}

function row(overrides = {}) {
  return {
    materia: 'Direito Constitucional',
    assunto: 'Controle de constitucionalidade',
    retention: 82,
    questionAccuracy: 76,
    editalPriority: 1,
    topicPriority: 2,
    state: {
      key: 'constitucional::controle',
      retention: 82,
      lapseCount: 1,
      reviewCount: 3,
      sessionCount: 4,
      totalMinutes: 180,
      difficulty: 6,
      questionStats: {
        averageAccuracy: 76,
        confidence: 0.8
      },
      ...overrides.state
    },
    ...overrides
  };
}

test('6A calcula domínio, retenção prevista e risco sem alterar prioridade importada', () => {
  const api = loadProfileApi();
  const profile = api.buildProfile({ userId: 'u1', contest: 'TJ', rows: [row()] });
  const topic = profile.topicState['constitucional::controle'];

  assert.equal(topic.editalPriority, 1);
  assert.equal(topic.topicPriority, 2);
  assert.equal(typeof topic.domainRisk.masteryScore, 'number');
  assert.equal(typeof topic.domainRisk.predictedRetention7d, 'number');
  assert.equal(typeof topic.domainRisk.forgettingRisk, 'number');
  assert.ok(['low', 'medium', 'high'].includes(topic.domainRisk.riskBand));
  assert.ok(['low', 'medium', 'high'].includes(topic.domainRisk.evidenceLevel));
  assert.ok(topic.domainRisk.predictedRetention7d <= topic.retention);
  assert.equal(topic.domainRisk.priorityWeight, 3);
});

test('assunto fraco recebe risco maior que assunto consolidado', () => {
  const api = loadProfileApi();
  const strong = row({
    assunto: 'Direitos fundamentais',
    retention: 94,
    questionAccuracy: 91,
    topicPriority: 1,
    state: {
      key: 'constitucional::direitos',
      lapseCount: 0,
      reviewCount: 6,
      sessionCount: 8,
      totalMinutes: 320,
      difficulty: 4,
      questionStats: { averageAccuracy: 91, confidence: 0.9 }
    }
  });
  const weak = row({
    materia: 'Língua Portuguesa',
    assunto: 'Pontuação',
    retention: 55,
    questionAccuracy: 42,
    editalPriority: 2,
    topicPriority: 2,
    state: {
      key: 'portugues::pontuacao',
      lapseCount: 5,
      reviewCount: 1,
      sessionCount: 2,
      totalMinutes: 70,
      difficulty: 8,
      questionStats: { averageAccuracy: 42, confidence: 0.35 }
    }
  });

  const profile = api.buildProfile({ userId: 'u1', contest: 'TJ', rows: [strong, weak] });
  const strongRisk = profile.topicState['constitucional::direitos'].domainRisk;
  const weakRisk = profile.topicState['portugues::pontuacao'].domainRisk;

  assert.ok(strongRisk.masteryScore > weakRisk.masteryScore);
  assert.ok(strongRisk.forgettingRisk < weakRisk.forgettingRisk);
  assert.ok(profile.metrics.weightedMastery > 0);
  assert.ok(profile.metrics.weightedCoverage >= 0 && profile.metrics.weightedCoverage <= 100);
  assert.equal(profile.metrics.atRiskTopics >= profile.metrics.highRiskTopics, true);
});

test('tendência compara nova evidência com o perfil anterior', () => {
  const api = loadProfileApi();
  const previous = api.buildProfile({ userId: 'u1', contest: 'TJ', rows: [row({ retention: 60, questionAccuracy: 55 })] });
  const current = api.buildProfile({
    userId: 'u1',
    contest: 'TJ',
    previous,
    rows: [row({ retention: 86, questionAccuracy: 82 })]
  });

  assert.equal(current.topicState['constitucional::controle'].domainRisk.trend, 'improving');
});

test('cobertura ponderada usa prioridade apenas como peso, sem reordenar os tópicos', () => {
  const api = loadProfileApi();
  const first = row({
    materia: 'Matéria A',
    assunto: 'Assunto A',
    editalPriority: 4,
    topicPriority: 4,
    state: { key: 'a::a', lapseCount: 0, reviewCount: 5, sessionCount: 6, difficulty: 4, questionStats: { averageAccuracy: 92, confidence: 0.9 } },
    retention: 93,
    questionAccuracy: 92
  });
  const second = row({
    materia: 'Matéria B',
    assunto: 'Assunto B',
    editalPriority: 1,
    topicPriority: 1,
    state: { key: 'b::b', lapseCount: 4, reviewCount: 1, sessionCount: 1, difficulty: 8, questionStats: { averageAccuracy: 38, confidence: 0.3 } },
    retention: 48,
    questionAccuracy: 38
  });

  const profile = api.buildProfile({ rows: [first, second] });
  assert.deepEqual(Object.keys(profile.topicState), ['a::a', 'b::b']);
  assert.equal(profile.topicState['a::a'].topicPriority, 4);
  assert.equal(profile.topicState['b::b'].topicPriority, 1);
});

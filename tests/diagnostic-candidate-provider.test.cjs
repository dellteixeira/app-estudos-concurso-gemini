const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const provider=fs.readFileSync('public/js/diagnostic-candidate-provider.js','utf8');
const weakness=fs.readFileSync('public/js/weakness-map-v2.js','utf8');

test('provedor diagnóstico reutiliza o cálculo de fricção com ranking explícito e isolado',()=>{
  assert.match(provider,/AppLearningAdvisor/);
  assert.match(provider,/computeLearningFriction/);
  assert.match(provider,/retentionDiagnosticRows/);
  assert.match(provider,/editalItems/);
  assert.match(provider,/function collectByFriction/);
  assert.match(provider,/b\.frictionScore-a\.frictionScore/);
  assert.match(provider,/rankingAuthority:'learning-advisor-friction-order'/);
  assert.doesNotMatch(provider,/nextReviewDate\s*=/);
  assert.doesNotMatch(provider,/priorityIndex\s*=/);
});

test('provedor amplia a leitura além do teto histórico de cinco tópicos',()=>{
  assert.match(provider,/DEFAULT_LIMIT=40/);
  assert.match(provider,/MAX_LIMIT=80/);
  assert.match(provider,/eligibleCandidates\(\)\.slice\(0,max\)/);
  assert.doesNotMatch(provider,/MAX_TOPICS=5/);
});

test('ordem permanece a ordem da fonte diagnóstica no coletor canônico',()=>{
  assert.match(provider,/for\(let index=0;index<rows\.length/);
  assert.match(provider,/authority:'diagnostic-source-order'/);
  assert.match(weakness,/provider\?\.collect\?\.\(40\)/);
  assert.match(weakness,/orderingAuthority:provider\?\.authority/);
  assert.doesNotMatch(weakness,/\.sort\s*\(/);
});

test('mapa mantém fallback compatível se o provedor ainda não carregou',()=>{
  assert.match(weakness,/advisor\.collectCandidates\?\.\(5\)/);
  assert.match(weakness,/data-diagnostic-candidate-provider/);
  assert.match(weakness,/diagnostic-candidate-provider-ready/);
});

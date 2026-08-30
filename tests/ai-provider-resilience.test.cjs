const fs=require('node:fs');const path=require('node:path');const test=require('node:test');const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../public/js/learning-advisor-headless.js'),'utf8');

test('provedor tem timeout e fallback local sem bloquear estudo',()=>{
  assert.match(source,/TIMEOUT_MS=8000/);
  assert.match(source,/AbortController/);
  assert.match(source,/controller\.abort\(\)/);
  assert.match(source,/localResult\(reason,local/);
  assert.match(source,/finally\{if\(timer\)clearTimeout\(timer\)\}/);
});

test('falhas são classificadas sem propagar mensagem bruta',()=>{
  for(const reason of ['timeout','auth','rate_limited','server','http','network','invalid_response'])assert.match(source,new RegExp(reason));
  assert.doesNotMatch(source,/error\.message/);
  assert.doesNotMatch(source,/String\(error\)/);
  assert.match(source,/adaptive-ai-provider-state/);
});

test('circuit breaker entra em cooldown após rate limit ou falhas repetidas',()=>{
  assert.match(source,/FAILURE_THRESHOLD=3/);
  assert.match(source,/COOLDOWN_MS=2\*60\*1000/);
  assert.match(source,/reason==='rate_limited'\|\|failureTimes\.length>=FAILURE_THRESHOLD/);
  assert.match(source,/fallbackReason:reason/);
  assert.match(source,/status:blockedUntil>now\?'cooldown':'ready'/);
});

test('resiliência não multiplica custo nem altera autoridade pedagógica',()=>{
  assert.equal((source.match(/fetch\('/g)||[]).length,1);
  assert.doesNotMatch(source,/nextReviewDate\s*=/);
  assert.doesNotMatch(source,/priorityIndex\s*=/);
  assert.doesNotMatch(source,/recommendedAction\s*=/);
  assert.doesNotMatch(source,/\.sort\s*\(/);
});

test('resposta parcial usa fallback por tópico e sinaliza degradação',()=>{
  assert.match(source,/validCount<candidates\.length/);
  assert.match(source,/fallbackCount:Math\.max\(0,candidates\.length-validCount\)/);
  assert.match(source,/sanitizeIntervention\(raw,candidate,local\[index\]\)/);
});

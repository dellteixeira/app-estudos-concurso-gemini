const fs=require('node:fs');
const assert=require('node:assert/strict');

const continuity=fs.readFileSync('public/js/session-continuity.js','utf8');
const orchestrator=fs.readFileSync('public/js/session-orchestrator.js','utf8');

assert.match(continuity,/adaptive_session_continuity_v1/,'deve versionar o estado local da sessão');
assert.match(continuity,/remainingMinutes\(/,'deve calcular tempo restante');
assert.match(continuity,/completeActive\(/,'deve permitir concluir o bloco ativo');
assert.match(continuity,/resumeNext\(/,'deve permitir retomar o próximo bloco pendente');
assert.match(continuity,/restore\(/,'deve restaurar sessão interrompida');
assert.match(orchestrator,/adaptive-session-rendered/,'orquestrador deve publicar renderização da fila');
assert.match(orchestrator,/adaptive-session-promoted/,'orquestrador deve publicar promoção do bloco');
assert.match(orchestrator,/authority:'learning-advisor-friction-order'/,'Learning Advisor deve continuar explícito como autoridade da ordem pedagógica');
assert.match(orchestrator,/scheduleAuthority:'retention-engine'/,'Retention Engine deve continuar explícito como autoridade de agenda');
assert.doesNotMatch(continuity,/collectCandidates\s*\(/,'continuidade não pode coletar ou reordenar candidatos');
assert.doesNotMatch(continuity,/\.sort\s*\(/,'continuidade não pode reordenar a fila');
assert.doesNotMatch(continuity,/nextReviewAt|dataProva|schedule|cronograma/i,'continuidade não pode controlar cronograma ou datas de revisão');

console.log('adaptive-session-continuity contract ok');

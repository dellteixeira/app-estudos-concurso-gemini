const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const timeline=fs.readFileSync('public/js/study-evidence-timeline.js','utf8');
const experience=fs.readFileSync('public/js/adaptive-ai-experience.js','utf8');

test('timeline registra somente eventos operacionais conhecidos',()=>{
  assert.match(timeline,/const EVENT_TYPES=new Set\(\['plan','execution_started','execution_finished','feedback','question_error','error_state','flashcard'\]\)/);
  assert.match(timeline,/HISTORY_LIMIT=160/);
  assert.match(timeline,/slice\(-HISTORY_LIMIT\)/);
});

test('timeline não persiste conteúdo textual de questões ou flashcards',()=>{
  assert.doesNotMatch(timeline,/questionText|enunciado|alternative|alternativa|answerText|respostaTextual|front\s*:|back\s*:/i);
  assert.match(timeline,/topicId/);
  assert.match(timeline,/errorType/);
});

test('timeline é observacional e não controla prioridade ou agenda',()=>{
  assert.match(timeline,/authority:'observational-only'/);
  assert.doesNotMatch(timeline,/collectCandidates/);
  assert.doesNotMatch(timeline,/\.sort\s*\(/);
  assert.doesNotMatch(timeline,/priorityIndex\s*=/);
  assert.doesNotMatch(timeline,/nextReviewDate\s*=/);
  assert.doesNotMatch(timeline,/autoSchedule\s*=\s*true/);
});

test('timeline escuta execução, feedback, erros e flashcards',()=>{
  assert.match(timeline,/adaptive-session-execution-started/);
  assert.match(timeline,/adaptive-session-execution-finished/);
  assert.match(timeline,/adaptive-feedback-evaluated/);
  assert.match(timeline,/question-performance-classified/);
  assert.match(timeline,/intelligent-error-notebook-changed/);
  assert.match(timeline,/adaptive-flashcard-launched/);
});

test('experiência adaptativa carrega timeline e não registra erro bruto',()=>{
  assert.match(experience,/study-evidence-timeline\.js/);
  assert.match(experience,/console\.warn\('\[adaptive-ai\] recommendation unavailable'\)/);
  assert.doesNotMatch(experience,/error\?\.message\|\|error/);
});

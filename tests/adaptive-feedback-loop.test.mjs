import assert from 'node:assert/strict';
import fs from 'node:fs';

const feedback = fs.readFileSync('public/js/adaptive-feedback-loop.js','utf8');
const experience = fs.readFileSync('public/js/adaptive-ai-experience.js','utf8');

assert.match(feedback,/function recordStart\(plan\)/,'feedback loop must record a recommendation baseline');
assert.match(feedback,/function scoreOutcome\(before,after\)/,'feedback loop must evaluate observed outcome');
assert.match(feedback,/retentionDelta/,'feedback loop must consider retention delta');
assert.match(feedback,/accuracyDelta/,'feedback loop must consider accuracy delta');
assert.match(feedback,/lapseDelta/,'feedback loop must consider lapse delta');
assert.match(feedback,/getActionStats/,'feedback loop must aggregate effectiveness by intervention');
assert.match(feedback,/adaptive_feedback_loop_v1/,'feedback state must be versioned');
assert.doesNotMatch(feedback,/prompt\s*:/i,'feedback loop must not persist prompts');
assert.doesNotMatch(feedback,/response\s*:/i,'feedback loop must not persist raw model responses');
assert.doesNotMatch(feedback,/userId\s*:/i,'feedback loop must not persist user identifiers');
assert.match(feedback,/source:'adaptive_feedback_loop'/,'started sessions must identify the adaptive feedback source');
assert.match(experience,/adaptive-feedback-loop\.js/,'adaptive experience must load the feedback loop without editing the monolith');
assert.match(experience,/Retention Engine/,'Retention Engine authority remains visible in the adaptive experience');

console.log('adaptive feedback loop contract: ok');

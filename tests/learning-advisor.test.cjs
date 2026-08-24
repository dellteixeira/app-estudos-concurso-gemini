'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const read=file=>fs.readFileSync(file,'utf8');

const client=read('public/js/learning-advisor.js');
const css=read('public/css/learning-advisor.css');
const server=read('src/learning-diagnosis.js');
const wrapper=read('src/worker.js');
const wrangler=read('wrangler.jsonc');
const pwa=read('public/js/app-pwa.js');
const sw=read('public/sw.js');
const manifest=read('config/app-assets.json');
const headers=read('public/_headers');

test('advisor e endpoint possuem sintaxe JavaScript válida',()=>{
  for(const file of ['public/js/learning-advisor.js','src/learning-diagnosis.js','src/worker.js']){
    const r=cp.spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    assert.equal(r.status,0,r.stderr||r.stdout);
  }
});

test('motor local calcula fricção e limita a triagem antes da IA',()=>{
  assert.match(client,/const MAX_TOPICS=5/);
  assert.match(client,/computeLearningFriction/);
  assert.match(client,/frictionScore/);
  assert.match(client,/slice\(0,Math\.max\(1,Math\.min\(MAX_TOPICS/);
  assert.match(client,/MIN_FRICTION=35/);
});

test('rótulo da interface usa dificuldade persistente em vez de fricção',()=>{
  assert.match(client,/Dificuldade persistente \$\{candidate\.frictionScore\}/);
  assert.doesNotMatch(client,/>Fricção \$\{candidate\.frictionScore\}</);
});

test('IA é explicitamente auxiliar e não agenda automaticamente',()=>{
  assert.match(server,/advisorRole:'auxiliary'/);
  assert.match(server,/authority:'retention-engine'/);
  assert.match(server,/autoSchedule:false/);
  assert.match(server,/NÃO controla o cronograma/);
  assert.match(client,/A Retenção continua sendo a autoridade/);
  assert.match(client,/Abrir intervenção local/);
  assert.doesNotMatch(client,/gerarCronogramaInteligente\(/);
  assert.doesNotMatch(client,/gerarCronogramaMetodo2\(/);
});

test('barra do Advisor ocupa toda a largura e possui contrato de texto resiliente',()=>{
  assert.match(css,/#retentionDiagnosticPanel>#learningAdvisorPanel\.learning-advisor\{grid-column:1\/-1!important/);
  assert.match(css,/justify-self:stretch!important/);
  assert.match(css,/width:100%!important/);
  assert.match(css,/max-width:100%!important/);
  assert.match(css,/margin:12px 0 0!important/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css,/@container \(max-width:760px\)/);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/overflow-wrap:anywhere/);
  assert.match(css,/#app-dashboard :where\(/);
  assert.match(css,/white-space:normal/);
  assert.match(css,/word-break:normal/);
});

test('endpoint usa Gemini com autenticação, rate limit, schema fechado e fallback local',()=>{
  assert.match(server,/GEMINI_MODEL='gemini-3\.6-flash'/);
  assert.match(server,/authenticate\(request,env\)/);
  assert.match(server,/AI_RATE_LIMITER/);
  assert.match(server,/learning-diagnosis/);
  assert.match(server,/deterministicIntervention/);
  assert.match(server,/responseSchema/);
  assert.match(server,/recommendedAction/);
  assert.match(server,/aiUsed/);
});

test('wrapper isola nova rota e preserva Worker existente',()=>{
  assert.match(wrapper,/import app from '\.\/index\.js'/);
  assert.match(wrapper,/handleLearningDiagnosis/);
  assert.match(wrapper,/\/api\/ai\/learning-diagnosis/);
  assert.match(wrapper,/return app\.fetch\(request, env, ctx\)/);
  assert.match(wrangler,/"main": "\.\/src\/worker\.js"/);
});

test('advisor faz parte do núcleo PWA e usa política anti-cache',()=>{
  assert.match(pwa,/learning-advisor\.css\?v=10\.30\.0/);
  assert.match(pwa,/learning-advisor\.js\?v=10\.30\.0/);
  assert.match(sw,/\.\/css\/learning-advisor\.css/);
  assert.match(sw,/\.\/js\/learning-advisor\.js/);
  assert.match(manifest,/"\/css\/learning-advisor\.css"/);
  assert.match(manifest,/"\/js\/learning-advisor\.js"/);
  assert.match(headers,/\/css\/learning-advisor\.css[\s\S]*Cache-Control: no-cache, no-store, must-revalidate/);
  assert.match(headers,/\/js\/learning-advisor\.js[\s\S]*Cache-Control: no-cache, no-store, must-revalidate/);
});

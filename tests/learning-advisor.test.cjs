'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const read=file=>fs.readFileSync(file,'utf8');

const packageVersion=JSON.parse(read('package.json')).version;
const escapeRegex=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const client=read('public/js/learning-advisor.js');
const css=read('public/css/learning-advisor.css');
const server=read('src/learning-diagnosis.js');
const router=read('src/ai-model-router.js');
const wrapper=read('src/worker.js');
const wrangler=read('wrangler.jsonc');
const pwa=read('public/js/app-pwa.js');
const sw=read('public/sw.js');
const manifest=read('config/app-assets.json');
const headers=read('public/_headers');

test('advisor e endpoint possuem sintaxe JavaScript válida',()=>{
  for(const file of ['public/js/learning-advisor.js','src/learning-diagnosis.js','src/ai-model-router.js','src/worker.js']){
    const r=cp.spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    assert.equal(r.status,0,r.stderr||r.stdout);
  }
});

test('motor local calcula dificuldade persistente e limita triagem antes da IA',()=>{
  assert.match(client,/const MAX_TOPICS=5/);
  assert.match(client,/computeLearningFriction/);
  assert.match(client,/frictionScore/);
  assert.match(client,/slice\(0,Math\.max\(1,Math\.min\(MAX_TOPICS/);
  assert.match(client,/MIN_FRICTION=35/);
  assert.match(client,/Dificuldade persistente \$\{candidate\.frictionScore\}/);
  assert.doesNotMatch(client,/>Fricção \$\{candidate\.frictionScore\}</);
});

test('IA passa a ser contextual de Assuntos em risco, sem faixa permanente no dashboard',()=>{
  assert.match(client,/\[data-action="retention-details"\]\[data-metric="risk"\]/);
  assert.match(client,/openRiskView/);
  assert.match(client,/Assuntos em risco/);
  assert.match(client,/Intervenções para dificuldades persistentes/);
  assert.match(client,/document\.getElementById\('learningAdvisorPanel'\)\?\.remove\(\)/);
  assert.doesNotMatch(client,/parent\.appendChild\(section\)/);
  assert.match(client,/entryPoint:'risk-details'/);
});

test('janela de risco diferencia revisão agendada vencida de necessidade cognitiva',()=>{
  assert.match(client,/row\.scheduledOverdue\|\|row\.overdue/);
  assert.match(client,/Revisão agendada vencida/);
  assert.match(client,/row\.retentionDue/);
  assert.match(client,/não há revisão vencida no cronograma/);
  assert.match(client,/Retenção baixa — revisão recomendada/);
});

test('IA é explicitamente auxiliar e não agenda automaticamente',()=>{
  assert.match(server,/advisorRole:'auxiliary'/);
  assert.match(server,/authority:'retention-engine'/);
  assert.match(server,/autoSchedule:false/);
  assert.match(server,/NÃO controla o cronograma/);
  assert.match(client,/motor de Retenção/);
  assert.match(client,/data-learning-action="local-intervention"/);
  assert.match(client,/openLocalIntervention\(Number\(button\.dataset\.rowIndex\),intervention\)/);
  assert.doesNotMatch(client,/gerarCronogramaInteligente\(/);
  assert.doesNotMatch(client,/gerarCronogramaMetodo2\(/);
});

test('modal contextual é responsivo e preserva contrato global de texto',()=>{
  assert.match(css,/\.learning-advisor-overlay/);
  assert.match(css,/\.learning-advisor-dialog/);
  assert.match(css,/width:min\(920px,100%\)/);
  assert.match(css,/max-height:min\(88vh,820px\)/);
  assert.match(css,/\.learning-risk-card/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/overflow-wrap:anywhere/);
  assert.match(css,/#app-dashboard :where\(/);
  assert.match(css,/white-space:normal/);
  assert.match(css,/word-break:normal/);
});

test('endpoint usa roteador Gemini com autenticação, rate limit, schema fechado e fallback local',()=>{
  assert.match(server,/routeAiModel/);
  assert.match(server,/modelEndpoint/);
  assert.match(server,/fallbackModel/);
  assert.match(router,/DEFAULT_PRIMARY_MODEL='gemini-3\.6-flash'/);
  assert.match(router,/GEMINI_FAST_MODEL/);
  assert.match(router,/GEMINI_STANDARD_MODEL/);
  assert.match(router,/GEMINI_REASONING_MODEL/);
  assert.match(router,/authority:'retention-engine'/);
  assert.match(router,/autoSchedule:false/);
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
  assert.match(pwa,new RegExp(`learning-advisor\\.css\\?v=${escapeRegex(packageVersion)}`));
  assert.match(pwa,new RegExp(`learning-advisor\\.js\\?v=${escapeRegex(packageVersion)}`));
  assert.match(sw,/\.\/css\/learning-advisor\.css/);
  assert.match(sw,/\.\/js\/learning-advisor\.js/);
  assert.match(manifest,/"\/css\/learning-advisor\.css"/);
  assert.match(manifest,/"\/js\/learning-advisor\.js"/);
  assert.match(headers,/\/css\/learning-advisor\.css[\s\S]*Cache-Control: no-cache, no-store, must-revalidate/);
  assert.match(headers,/\/js\/learning-advisor\.js[\s\S]*Cache-Control: no-cache, no-store, must-revalidate/);
});
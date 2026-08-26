'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const read=file=>fs.readFileSync(file,'utf8');

const client=read('public/js/learning-advisor.js');
const normalizedClient=client.replace(/\\"/g,'"');
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

test('motor local calcula dificuldade persistente e limita triagem antes da IA',()=>{
  assert.match(client,/MAX_TOPICS=5/);
  assert.match(client,/frictionScore/);
  assert.match(client,/slice\(0,Math\.max\(1,Math\.min\(MAX_TOPICS/);
  assert.match(client,/MIN_FRICTION=35/);
  // Contrato atual da UI: o card exibe a dificuldade calculada sem o rótulo legado "persistente".
  assert.match(client,/Dificuldade \$\{c\.frictionScore\}/);
  assert.doesNotMatch(client,/>Fricção \$\{c\.frictionScore\}</);
});

test('IA integra Retenção e Diagnóstico sem substituir sua autoridade',()=>{
  assert.match(client,/METRIC_CONFIG/);
  assert.match(client,/risk:\{title:'Assuntos em risco'/);
  assert.match(client,/overdue:\{title:'Revisões vencidas'/);
  assert.match(client,/mastered:\{title:'Assuntos dominados'/);
  assert.match(client,/openMetricView/);
  assert.match(client,/openRiskView/);
  assert.match(client,/ensureBar/);
  assert.match(client,/learningAdvisorPanelButton/);
  assert.match(normalizedClient,/\[data-action="retention-details"\]\[data-metric\]/);
  assert.doesNotMatch(client,/document\.getElementById\('learningAdvisorPanel'\)\?\.remove\(\)/);
});

test('diagnóstico diferencia revisão vencida, retenção baixa e domínio',()=>{
  assert.match(client,/r\?\.scheduledOverdue\|\|r\?\.overdue/);
  assert.match(client,/Revisão agendada vencida/);
  assert.match(client,/retentionDue/);
  assert.match(client,/não há revisão vencida no cronograma/);
  assert.match(client,/Retenção baixa — revisão recomendada/);
  assert.match(client,/Domínio sustentado/);
  assert.match(client,/Domínio validado/);
  assert.match(client,/Revisar primeira vencida/);
});

test('IA é explicitamente auxiliar e não agenda automaticamente',()=>{
  assert.match(server,/advisorRole:'auxiliary'/);
  assert.match(server,/authority:'retention-engine'/);
  assert.match(server,/autoSchedule:false/);
  assert.match(server,/NÃO controla o cronograma/);
  assert.match(client,/mantendo o motor de Retenção como autoridade/);
  assert.match(client,/Abrir intervenção local/);
  assert.doesNotMatch(client,/gerarCronogramaInteligente\(/);
  assert.doesNotMatch(client,/gerarCronogramaMetodo2\(/);
});

test('diálogo e barra auxiliar são responsivos e preservam texto',()=>{
  assert.match(css,/\.learning-advisor-overlay/);
  assert.match(css,/\.learning-advisor-dialog/);
  assert.match(css,/width:min\(980px,100%\)/);
  assert.match(css,/max-height:min\(90vh,860px\)/);
  assert.match(css,/\.learning-advisor-bar/);
  assert.match(css,/\.learning-risk-card/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/overflow-wrap:anywhere/);
  assert.match(css,/white-space:normal/);
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
  assert.match(pwa,/learning-advisor\.css\?v=10\.57\.0/);
  assert.match(pwa,/learning-advisor\.js\?v=10\.57\.0/);
  assert.match(sw,/\.\/css\/learning-advisor\.css/);
  assert.match(sw,/\.\/js\/learning-advisor\.js/);
  assert.match(manifest,/"\/css\/learning-advisor\.css"/);
  assert.match(manifest,/"\/js\/learning-advisor\.js"/);
  assert.match(headers,/\/css\/learning-advisor\.css[\s\S]*Cache-Control: no-cache, no-store, must-revalidate/);
  assert.match(headers,/\/js\/learning-advisor\.js[\s\S]*Cache-Control: no-cache, no-store, must-revalidate/);
});

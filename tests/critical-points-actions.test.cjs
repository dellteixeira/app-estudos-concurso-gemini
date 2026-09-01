'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');

const read=file=>fs.readFileSync(file,'utf8');
const packageVersion=JSON.parse(read('package.json')).version;
const escapeRegex=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const client=read('public/js/critical-points-actions.js');
const pwa=read('public/js/app-pwa.js');
const sw=read('public/sw.js');
const manifest=read('config/app-assets.json');
const css=read('public/css/learning-advisor.css');

test('módulo de ações dos pontos críticos possui sintaxe válida',()=>{
  const result=cp.spawnSync(process.execPath,['--check','public/js/critical-points-actions.js'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
});

test('risco global preserva pesos e usa Student Model como fonte canônica quando disponível',()=>{
  assert.match(client,/const modeledRow=enrichRowFromStudentModel\(row,item\)/);
  assert.match(client,/retentionComponent=\(100-retention\)\*0\.30/);
  assert.match(client,/questionsComponent=accuracy==null\?0:\(100-accuracy\)\*0\.25/);
  assert.match(client,/overdueComponent=overdueRisk\(row\)/);
  assert.match(client,/persistenceComponent=persistentRisk\(modeledRow,item\)/);
  assert.match(client,/priorityComponent=priorityRisk\(item\)/);
  assert.match(client,/score>=70\?'high':score>=50\?'medium':'low'/);
  assert.match(client,/Math\.max\(35,raw\)/);
});

test('Pontos Críticos consome Perfil Cognitivo como Student Model interno',()=>{
  assert.match(client,/AppCognitiveProfile\?\.read/);
  assert.match(client,/function getStudentTopicState/);
  assert.match(client,/function enrichRowFromStudentModel/);
  assert.match(client,/studentModelSource:'cognitive-profile'/);
  assert.match(client,/dataset\.riskSource/);
  assert.match(client,/app:cognitive-profile-updated/);
});

test('cartão explicita retenção, score e oferece estudar ou adiar 24h',()=>{
  assert.match(client,/Risco global \$\{risk\.score\}\/100/);
  assert.match(client,/critical-retention-caption/);
  assert.match(client,/study\.textContent='Estudar agora'/);
  assert.match(client,/snoozeButton\.textContent='Adiar 24h'/);
  assert.match(client,/Adiar não registra estudo nem altera a retenção/);
  assert.match(css,/\.critical-point-controls/);
  assert.match(css,/\.critical-point-study/);
  assert.match(css,/\.critical-point-snooze/);
});

test('adiamento usa o mesmo snooze de 24h do Learning Advisor e força novo diagnóstico',()=>{
  assert.match(client,/AppLearningAdvisor\.snoozeTopic\(topicId,SNOOZE_HOURS\)/);
  assert.match(client,/renderRetentionDiagnostics/);
  assert.match(client,/learning-advisor:snooze-changed/);
  assert.match(client,/advisorReady\(\)/);
});

test('novo módulo integra núcleo PWA e manifesto offline da versão canônica',()=>{
  assert.match(pwa,new RegExp(`critical-points-actions\\.js\\?v=${escapeRegex(packageVersion)}`));
  assert.match(sw,/\.\/js\/critical-points-actions\.js/);
  const cfg=JSON.parse(manifest);
  for(const key of ['criticalAppShell','networkFirstPaths','workerNoStorePaths','headersNoStorePaths']){
    assert.ok(cfg[key].includes('/js/critical-points-actions.js'),`${key} sem critical-points-actions.js`);
  }
});

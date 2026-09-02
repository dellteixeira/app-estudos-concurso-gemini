#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,c)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),c)};
const replace=(p,a,b)=>{const s=read(p);if(!s.includes(a))throw new Error(`anchor ausente ${p}: ${a}`);write(p,s.split(a).join(b))};
const V0='10.64.37', V='10.64.38';

// Sincroniza a identidade canônica sem tocar nos pins históricos independentes (ex.: app-state 10.56.0).
replace('package.json',`\"version\": \"${V0}\"`,`\"version\": \"${V}\"`);
replace('package-lock.json',`\"version\": \"${V0}\"`,`\"version\": \"${V}\"`);
for(const p of ['public/version.json','config/app-assets.json','public/index.html','src/index.js','public/sw.js']){
  write(p,read(p).replaceAll(V0,V));
}
replace('android/app/build.gradle','versionCode 106439','versionCode 106440');
replace('android/app/build.gradle',`versionName \"${V0}-mobile.1\"`,`versionName \"${V}-mobile.1\"`);
const oldCss=`public/css/responsive-polish-v${V0}.css`, newCss=`public/css/responsive-polish-v${V}.css`;
if(fs.existsSync(oldCss))fs.renameSync(oldCss,newCss);else if(!fs.existsSync(newCss))throw new Error('CSS responsivo canônico ausente');

// Consolida 8A: domínio/risco vira serviço headless de avaliação de tópico.
const oldAssessment='public/js/core/domain-risk-dashboard.js';
const newAssessment='public/js/core/topic-assessment.js';
if(fs.existsSync(oldAssessment)){
  let assessmentSource=read(oldAssessment);
  assessmentSource=assessmentSource.replace(
    "global.dispatchEvent?.(new CustomEvent('study:topic-assessment-ready'",
    "if(typeof global.CustomEvent==='function')global.dispatchEvent?.(new global.CustomEvent('study:topic-assessment-ready'"
  );
  write(newAssessment,assessmentSource);
  fs.unlinkSync(oldAssessment);
}
for(const dead of ['public/js/core/study-optimization-dashboard.js','public/css/study-optimization.css'])if(fs.existsSync(dead))fs.unlinkSync(dead);

let html=read('public/index.html');
html=html.replace(/\s*<link rel=\"stylesheet\" href=\"\.\/css\/study-optimization\.css\">\s*/,'\n');
function removeElementById(source,id){
  const idAt=source.indexOf(`id=\"${id}\"`);if(idAt<0)return source;
  const start=source.lastIndexOf('<section',idAt);if(start<0)throw new Error(`section start ausente: ${id}`);
  const re=/<\/?section\b[^>]*>/g;re.lastIndex=start;let depth=0,m;
  while((m=re.exec(source))){if(m[0][1]==='/')depth--;else depth++;if(depth===0)return source.slice(0,start)+source.slice(re.lastIndex)}
  throw new Error(`section end ausente: ${id}`);
}
html=removeElementById(html,'phase6aDomainRiskPanel');
html=removeElementById(html,'phase6bStudyOptimizationPanel');
html=html.replaceAll('./js/core/domain-risk-dashboard.js','./js/core/topic-assessment.js');
html=html.replace(/\s*<script[^>]+study-optimization-dashboard\.js[^>]*><\/script>\s*/g,'\n');
write('public/index.html',html);

// Remove apenas os assets mortos; nunca a linha inteira que também contém assets críticos do shell.
let assets=read('config/app-assets.json').replaceAll('/js/core/domain-risk-dashboard.js','/js/core/topic-assessment.js');
for(const dead of ['/js/core/study-optimization-dashboard.js','/css/study-optimization.css']){
  const escaped=dead.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  assets=assets.replace(new RegExp(`\\s*\"${escaped}\",?`,'g'),'');
}
assets=assets.replace(/,\s*([\]}])/g,'$1');write('config/app-assets.json',assets);

function removeQuotedAsset(source,fragment){
  const escaped=fragment.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return source
    .replace(new RegExp(`['\"][^'\"]*${escaped}['\"]\\s*,?\\s*`,'g'),'')
    .replace(/,\s*,/g,',');
}
for(const p of ['public/sw.js','src/index.js']){
  let s=read(p)
    .replaceAll('/js/core/domain-risk-dashboard.js','/js/core/topic-assessment.js')
    .replaceAll('js/core/domain-risk-dashboard.js','js/core/topic-assessment.js');
  s=removeQuotedAsset(s,'study-optimization-dashboard.js');
  s=removeQuotedAsset(s,'study-optimization.css');
  write(p,s);
}

// Corrige o otimizador: ciclos adicionais podem preencher janelas longas, sem bloco > 35 min.
{
  const p='public/js/core/study-optimization-engine.js';
  let s=read(p);
  const before="ranked=[...candidates].sort((a,b)=>b.optimizationScore-a.optimizationScore||a.canonicalIndex-b.canonicalIndex),blocks=[];let remaining=budget;while(remaining>=MIN_BLOCK_MINUTES&&ranked.length){const candidate=ranked.shift(),minutes=blockMinutesFor(candidate,remaining);if(minutes<MIN_BLOCK_MINUTES)break;blocks.push";
  const after="ranked=[...candidates].sort((a,b)=>b.optimizationScore-a.optimizationScore||a.canonicalIndex-b.canonicalIndex),blocks=[];let remaining=budget,rankIndex=0;while(remaining>=MIN_BLOCK_MINUTES&&ranked.length){const candidate=ranked[rankIndex%ranked.length];rankIndex+=1;let minutes=blockMinutesFor(candidate,remaining);const tail=remaining-minutes;if(tail>0&&tail<MIN_BLOCK_MINUTES&&minutes+tail<=MAX_BLOCK_MINUTES)minutes=remaining;if(minutes<MIN_BLOCK_MINUTES)break;blocks.push";
  if(!s.includes(before))throw new Error('anchor optimize ausente');
  s=s.replace(before,after);
  s=s.replace(
    "global.dispatchEvent?.(new CustomEvent('study:optimization-ready'",
    "if(typeof global.CustomEvent==='function')global.dispatchEvent?.(new global.CustomEvent('study:optimization-ready'"
  );
  write(p,s);
}

// Migra testes de compatibilidade para o novo contrato headless, sem reintroduzir UI removida.
for(const p of fs.readdirSync('tests').filter(x=>x.endsWith('.test.cjs')).map(x=>'tests/'+x)){
  let s=read(p).replaceAll('public/js/core/domain-risk-dashboard.js','public/js/core/topic-assessment.js');
  if(p.endsWith('phase-6-critical-points-integration.test.cjs')){
    s=s.replace("const dashboard=fs.readFileSync('public/js/core/study-optimization-dashboard.js','utf8');\nconst css=fs.readFileSync('public/css/study-optimization.css','utf8');\n", "const dashboardExists=fs.existsSync('public/js/core/study-optimization-dashboard.js');\nconst cssExists=fs.existsSync('public/css/study-optimization.css');\n");
    s=s.replace(/test\('standalone Phase 6 dashboards stay hidden',[\s\S]*?\n\}\);\n\n/,"test('standalone Phase 6 dashboards are physically removed',()=>{\n  assert.equal(dashboardExists,false);\n  assert.equal(cssExists,false);\n});\n\n");
  }
  if(p.endsWith('phase-8a-8b-consolidation.test.cjs')){
    s=s.replace("  const optimizerDashboard=read('public/js/core/study-optimization-dashboard.js');\n  const css=read('public/css/study-optimization.css');\n", "  const optimizerDashboardExists=fs.existsSync(path.join(root,'public/js/core/study-optimization-dashboard.js'));\n  const cssExists=fs.existsSync(path.join(root,'public/css/study-optimization.css'));\n");
    s=s.replace("  assert.match(optimizerDashboard,/disabled:true/);\n  assert.doesNotMatch(optimizerDashboard,/buildPlan\\s*\\(/);\n  assert.ok(css.length<300,'hidden dashboard CSS should remain a tiny compatibility rule');\n", "  assert.equal(optimizerDashboardExists,false);\n  assert.equal(cssExists,false);\n");
  }
  if(p.endsWith('phase-6a-domain-risk-dashboard.test.cjs')){
    s=s.replace("vm.runInContext(dashboardSource, context, { filename: 'domain-risk-dashboard.js' });","vm.runInContext(dashboardSource, context, { filename: 'topic-assessment.js' });");
    s=s.replace(/test\('contrato visual e carregamento da fase 6A existem no app shell',[\s\S]*?\n\}\);\s*$/,
`test('contrato headless da avaliação de tópico existe no app shell', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  assert.doesNotMatch(html, /id="phase6aDomainRiskPanel"/);
  assert.doesNotMatch(html, /id="phase6bStudyOptimizationPanel"/);
  assert.match(html, /\\.\\/js\\/core\\/cognitive-profile-source\\.js/);
  assert.match(html, /\\.\\/js\\/core\\/cognitive-profile\\.js/);
  assert.match(html, /\\.\\/js\\/core\\/cognitive-profile-runtime\\.js/);
  assert.match(html, /\\.\\/js\\/core\\/topic-assessment\\.js/);
});\n`);
  }
  write(p,s);
}

write('tests/phase-6b-study-optimization-dashboard.test.cjs',`const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('dashboard standalone e CSS legado foram removidos fisicamente',()=>{
  assert.equal(fs.existsSync('public/js/core/study-optimization-dashboard.js'),false);
  assert.equal(fs.existsSync('public/css/study-optimization.css'),false);
});

test('otimização permanece disponível como serviço headless',()=>{
  const source=fs.readFileSync('public/js/core/study-optimization-engine.js','utf8');
  assert.match(source,/global\\.AppStudyOptimization=Object\\.freeze/);
  assert.doesNotMatch(source,/createElement\\s*\\(/);
  assert.doesNotMatch(source,/innerHTML\\s*=/);
});

test('app shell não expõe painéis autônomos da Fase 6',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  assert.doesNotMatch(html,/phase6aDomainRiskPanel/);
  assert.doesNotMatch(html,/phase6bStudyOptimizationPanel/);
  assert.doesNotMatch(html,/study-optimization-dashboard\\.js/);
  assert.match(html,/topic-assessment\\.js/);
});
`);

// Sanidade final: todos os derivados devem estar coerentes antes dos testes.
for(const p of ['package.json','package-lock.json','public/version.json','config/app-assets.json','public/index.html','src/index.js','public/sw.js','android/app/build.gradle']){
  if(read(p).includes(V0))throw new Error(`versão obsoleta remanescente em ${p}`);
}
console.log('Phase 8 finalize transformations applied');

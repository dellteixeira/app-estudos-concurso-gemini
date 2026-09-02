#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,c)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),c)};
const replace=(p,a,b)=>{const s=read(p);if(!s.includes(a))throw new Error(`anchor ausente ${p}: ${a}`);write(p,s.split(a).join(b))};
const V0='10.64.37', V='10.64.38';
// release derivatives
replace('package.json',`\"version\": \"${V0}\"`,`\"version\": \"${V}\"`);
replace('package-lock.json',`\"version\": \"${V0}\"`,`\"version\": \"${V}\"`);
replace('public/version.json',`\"version\": \"${V0}\"`,`\"version\": \"${V}\"`);
replace('config/app-assets.json',`\"version\": \"${V0}\"`,`\"version\": \"${V}\"`);
replace('config/app-assets.json',`responsive-polish-v${V0}.css`,`responsive-polish-v${V}.css`);
replace('src/index.js',`const APP_VERSION = \"${V0}\"`,`const APP_VERSION = \"${V}\"`);
replace('public/sw.js',`const APP_VERSION = '${V0}'`,`const APP_VERSION = '${V}'`);
replace('android/app/build.gradle','versionCode 106439','versionCode 106440');
replace('android/app/build.gradle',`versionName \"${V0}-mobile.1\"`,`versionName \"${V}-mobile.1\"`);
const oldCss=`public/css/responsive-polish-v${V0}.css`, newCss=`public/css/responsive-polish-v${V}.css`;
if(fs.existsSync(oldCss)){fs.renameSync(oldCss,newCss)} else if(!fs.existsSync(newCss)) throw new Error('CSS responsivo canônico ausente');
replace('public/index.html',`responsive-polish-v${V0}.css`,`responsive-polish-v${V}.css`);
// 8A: move headless assessment to canonical name and remove dead dashboards/assets
const oldAssessment='public/js/core/domain-risk-dashboard.js';
const newAssessment='public/js/core/topic-assessment.js';
if(fs.existsSync(oldAssessment)){let s=read(oldAssessment);s=s.replace('installTopicAssessment','installTopicAssessment');write(newAssessment,s);fs.unlinkSync(oldAssessment)}
for(const dead of ['public/js/core/study-optimization-dashboard.js','public/css/study-optimization.css']) if(fs.existsSync(dead)) fs.unlinkSync(dead);
// Remove hidden Phase 6A/6B DOM blocks from index, conservatively by ids.
let html=read('public/index.html');
html=html.replace(/\s*<link rel=\"stylesheet\" href=\"\.\/css\/study-optimization\.css\">\s*/,'\n');
function removeElementById(source,id){
  const idAt=source.indexOf(`id=\"${id}\"`); if(idAt<0)return source;
  const start=source.lastIndexOf('<section',idAt); if(start<0)throw new Error(`section start ausente: ${id}`);
  let pos=start,depth=0;
  const re=/<\/?section\b[^>]*>/g; re.lastIndex=start; let m;
  while((m=re.exec(source))){if(m.index<start)continue; if(m[0][1]==='/')depth--; else depth++; if(depth===0)return source.slice(0,start)+source.slice(re.lastIndex)}
  throw new Error(`section end ausente: ${id}`);
}
html=removeElementById(html,'phase6aDomainRiskPanel');
html=removeElementById(html,'phase6bStudyOptimizationPanel');
// update script paths/remove dead dashboard script tags
html=html.replaceAll('./js/core/domain-risk-dashboard.js','./js/core/topic-assessment.js');
html=html.replace(/\s*<script[^>]+study-optimization-dashboard\.js[^>]*><\/script>\s*/g,'\n');
write('public/index.html',html);
// asset manifest: canonical assessment path, remove dead assets everywhere
let assets=read('config/app-assets.json');
assets=assets.replaceAll('/js/core/domain-risk-dashboard.js','/js/core/topic-assessment.js');
for(const dead of ['/js/core/study-optimization-dashboard.js','/css/study-optimization.css']) assets=assets.replace(new RegExp(`\\s*\"${dead.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\",?`,'g'),'');
// clean trailing commas before arrays/objects
assets=assets.replace(/,\s*([\]}])/g,'$1');
write('config/app-assets.json',assets);
// update direct refs in SW/worker if present
for(const p of ['public/sw.js','src/index.js']){let s=read(p);s=s.replaceAll('/js/core/domain-risk-dashboard.js','/js/core/topic-assessment.js').replaceAll('js/core/domain-risk-dashboard.js','js/core/topic-assessment.js');s=s.replace(/^.*study-optimization-dashboard\.js.*\n?/gm,'').replace(/^.*study-optimization\.css.*\n?/gm,'');write(p,s)}
// update tests that intentionally referenced legacy physical dashboard path to canonical headless module
for(const p of fs.readdirSync('tests').filter(x=>x.endsWith('.test.cjs')).map(x=>'tests/'+x)){
  let s=read(p);s=s.replaceAll('public/js/core/domain-risk-dashboard.js','public/js/core/topic-assessment.js');
  // Phase 8 test expects old shim file: make it assert absence instead.
  if(p.endsWith('phase-8a-8b-consolidation.test.cjs')){
    s=s.replace(/const optDash=fs\.readFileSync\([^\n]+\);?/g,"const optDashExists=fs.existsSync(path.join(ROOT,'public/js/core/study-optimization-dashboard.js')); ");
    s=s.replace(/assert\.doesNotMatch\(optDash,[^;]+;/g,"assert.equal(optDashExists,false);");
  }
  write(p,s);
}
console.log('Phase 8 finalize transformations applied');

import fs from 'node:fs';
const files={
 pkg:'package.json', version:'public/version.json', worker:'src/index.js', sw:'public/sw.js', assets:'config/app-assets.json'
};
const pkg=JSON.parse(fs.readFileSync(files.pkg,'utf8')); pkg.version='10.27.0'; fs.writeFileSync(files.pkg,JSON.stringify(pkg,null,2)+'\n');
const version=JSON.parse(fs.readFileSync(files.version,'utf8')); version.version='10.27.0'; fs.writeFileSync(files.version,JSON.stringify(version,null,2)+'\n');
let worker=fs.readFileSync(files.worker,'utf8').replace(/const APP_VERSION = "[^"]+";/,'const APP_VERSION = "10.27.0";'); fs.writeFileSync(files.worker,worker);
let sw=fs.readFileSync(files.sw,'utf8').replace(/const APP_VERSION = '[^']+';/,"const APP_VERSION = '10.27.0';");
if(!sw.includes("'./js/app-state.js'")) sw=sw.replace("'./js/study-domain.js', './js/app-core.js',", "'./js/study-domain.js', './js/app-core.js', './js/app-state.js', './js/sync-engine.js',");
if(!sw.includes("'/js/app-state.js'")) sw=sw.replace("'/js/study-domain.js', '/js/app-core.js',", "'/js/study-domain.js', '/js/app-core.js', '/js/app-state.js', '/js/sync-engine.js',");
fs.writeFileSync(files.sw,sw);
const assets=JSON.parse(fs.readFileSync(files.assets,'utf8')); assets.version='10.27.0';
for(const key of ['criticalAppShell','networkFirstPaths','workerNoStorePaths','headersNoStorePaths']){
  const arr=Array.isArray(assets[key])?assets[key]:[];
  for(const item of ['/js/app-state.js','/js/sync-engine.js']) if(!arr.includes(item)) arr.push(item);
  assets[key]=arr;
}
fs.writeFileSync(files.assets,JSON.stringify(assets,null,2)+'\n');
console.log('v10.27.0 state/sync patch applied');

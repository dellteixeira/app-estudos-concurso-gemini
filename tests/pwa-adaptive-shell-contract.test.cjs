const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const manifest=JSON.parse(fs.readFileSync('config/app-assets.json','utf8'));
const sw=fs.readFileSync('public/sw.js','utf8');
const lazyAssets=['/css/learning-advisor.css','/js/learning-advisor.js','/js/critical-points-actions.js','/js/app-ai.js'];

test('módulos adaptativos pesados não pertencem ao app shell crítico',()=>{
  for(const asset of lazyAssets) assert.equal(manifest.criticalAppShell.includes(asset),false,asset);
});

test('módulos adaptativos pesados continuam disponíveis offline',()=>{
  for(const asset of lazyAssets) assert.equal(manifest.optionalOfflineAssets.includes(asset),true,asset);
});

test('service worker separa shell crítico e assets adaptativos opcionais',()=>{
  const critical=sw.match(/const CRITICAL_APP_SHELL = \[([\s\S]*?)\];/)?.[1]||'';
  const optional=sw.match(/const OPTIONAL_OFFLINE_ASSETS = \[([\s\S]*?)\];/)?.[1]||'';
  for(const asset of lazyAssets){
    const rel=`.${asset}`;
    assert.equal(critical.includes(`'${rel}'`),false,asset);
    assert.equal(optional.includes(`'${rel}'`),true,asset);
  }
});

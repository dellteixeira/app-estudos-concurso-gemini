const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function loadModule(options={}){
  const source=fs.readFileSync('public/js/core/asset-loader.js','utf8');
  const appended=[];
  const head={appendChild(node){appended.push(node); if(typeof node._load==='function')node._load();}};
  const existingScripts=options.scripts||[];
  const existingStyles=options.styles||[];
  const document={
    readyState:'complete',
    scripts:existingScripts,
    head,
    documentElement:head,
    querySelectorAll(selector){return selector==='link[rel="stylesheet"]'?existingStyles:[]},
    createElement(tag){
      const listeners={};
      return {
        tagName:tag.toUpperCase(),dataset:{},
        addEventListener(type,handler){listeners[type]=handler},
        set src(value){this._src=value},get src(){return this._src||''},
        set href(value){this._href=value},get href(){return this._href||''},
        _load(){listeners.load?.()}
      };
    }
  };
  const window={APP_VERSION:'10.64.19',location:{href:'https://estudoadaptativo.com/'},document,setTimeout};
  vm.runInNewContext(source,{window,document,URL,Promise,Error,String,Object,Map,Boolean,setTimeout,console});
  return {api:window.AppAssetLoader,appended};
}

test('versionedUrl appends current app version',()=>{
  const {api}=loadModule();
  const url=api.versionedUrl('./js/app-ai.js');
  assert.equal(url,'https://estudoadaptativo.com/js/app-ai.js?v=10.64.19');
});

test('loadScript deduplicates the same versioned asset',async()=>{
  const {api,appended}=loadModule();
  const first=api.loadScript('./vendor/chart.umd.min.js');
  const second=api.loadScript('./vendor/chart.umd.min.js');
  assert.equal(first,second);
  await first;
  assert.equal(appended.length,1);
  assert.match(appended[0].src,/chart\.umd\.min\.js\?v=10\.64\.19$/);
});

test('versioned request reuses an already loaded legacy script with the same pathname',async()=>{
  const legacy={src:'https://estudoadaptativo.com/vendor/chart.umd.min.js',dataset:{loaded:'true'},readyState:'complete',addEventListener(){}};
  const {api,appended}=loadModule({scripts:[legacy]});
  assert.equal(api.sameAsset(legacy.src,'./vendor/chart.umd.min.js?v=10.64.19'),true);
  const resolved=await api.loadScript('./vendor/chart.umd.min.js');
  assert.equal(resolved,legacy);
  assert.equal(appended.length,0);
});

test('core features are registered for chart and PDF lazy loading',()=>{
  const {api}=loadModule();
  const stats=api.stats();
  assert.deepEqual([...stats.registeredFeatures],['charts','pdf-engine']);
});

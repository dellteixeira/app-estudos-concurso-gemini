(function installAppAssetLoader(global){
'use strict';
if(global.AppAssetLoader)return;

const registry=new Map();
const featureRegistry=new Map();
const DEFAULT_VERSION=String(global.APP_VERSION||'10.64.20');

function normalizeUrl(input){
  return new URL(String(input),global.location?.href||'https://estudoadaptativo.local/');
}

function versionedUrl(input,version=DEFAULT_VERSION){
  const url=normalizeUrl(input);
  if(version)url.searchParams.set('v',String(version));
  return url.href;
}

function once(key,factory){
  if(registry.has(key))return registry.get(key);
  const promise=Promise.resolve().then(factory).catch(error=>{
    registry.delete(key);
    throw error;
  });
  registry.set(key,promise);
  return promise;
}

function loadScript(src,options={}){
  const finalUrl=options.versioned===false?normalizeUrl(src).href:versionedUrl(src,options.version||DEFAULT_VERSION);
  return once(`script:${finalUrl}`,()=>new Promise((resolve,reject)=>{
    const existing=[...document.scripts].find(node=>node.src===finalUrl);
    if(existing){
      if(existing.dataset.loaded==='true'||existing.readyState==='complete')return resolve(existing);
      existing.addEventListener('load',()=>resolve(existing),{once:true});
      existing.addEventListener('error',()=>reject(new Error(`Falha ao carregar ${finalUrl}`)),{once:true});
      return;
    }
    const script=document.createElement('script');
    script.src=finalUrl;
    script.async=options.async!==false;
    if(options.defer)script.defer=true;
    if(options.type)script.type=options.type;
    script.dataset.appLazyAsset='true';
    script.addEventListener('load',()=>{script.dataset.loaded='true';resolve(script)},{once:true});
    script.addEventListener('error',()=>reject(new Error(`Falha ao carregar ${finalUrl}`)),{once:true});
    (document.head||document.documentElement).appendChild(script);
  }));
}

function loadStyle(href,options={}){
  const finalUrl=options.versioned===false?normalizeUrl(href).href:versionedUrl(href,options.version||DEFAULT_VERSION);
  return once(`style:${finalUrl}`,()=>new Promise((resolve,reject)=>{
    const existing=[...document.querySelectorAll('link[rel="stylesheet"]')].find(node=>node.href===finalUrl);
    if(existing)return resolve(existing);
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=finalUrl;
    link.dataset.appLazyAsset='true';
    link.addEventListener('load',()=>resolve(link),{once:true});
    link.addEventListener('error',()=>reject(new Error(`Falha ao carregar ${finalUrl}`)),{once:true});
    (document.head||document.documentElement).appendChild(link);
  }));
}

function defineFeature(name,definition){
  if(!name||!definition)throw new Error('Feature inválida.');
  featureRegistry.set(String(name),Object.freeze({
    styles:[...(definition.styles||[])],
    scripts:[...(definition.scripts||[])],
    ready:typeof definition.ready==='function'?definition.ready:null
  }));
}

async function loadFeature(name){
  const key=String(name);
  const definition=featureRegistry.get(key);
  if(!definition)throw new Error(`Feature não registrada: ${key}`);
  return once(`feature:${key}`,async()=>{
    await Promise.all(definition.styles.map(item=>loadStyle(item)));
    for(const script of definition.scripts)await loadScript(script,{async:false});
    if(definition.ready)await definition.ready();
    return true;
  });
}

function idle(callback,timeout=1800){
  if(typeof global.requestIdleCallback==='function')return global.requestIdleCallback(callback,{timeout});
  return global.setTimeout(()=>callback({didTimeout:true,timeRemaining:()=>0}),Math.min(timeout,250));
}

function stats(){
  return {
    version:DEFAULT_VERSION,
    requestedAssets:[...registry.keys()],
    registeredFeatures:[...featureRegistry.keys()]
  };
}

defineFeature('charts',{scripts:['./vendor/chart.umd.min.js'],ready:()=>Boolean(global.Chart)});
defineFeature('pdf-engine',{
  styles:['./vendor/pdf_viewer.min.css','./css/pdf-reader.css'],
  scripts:['./vendor/pdf.min.js','./js/pdf/pdf-reader.js'],
  ready:()=>Boolean(global.pdfjsLib||global.PdfStudyReader)
});

global.AppAssetLoader=Object.freeze({
  version:DEFAULT_VERSION,
  versionedUrl,
  loadScript,
  loadStyle,
  defineFeature,
  loadFeature,
  idle,
  stats
});
})(window);

(function installOfflineSyncCoordinator(global){
'use strict';
if(global.OfflineSyncCoordinator)return;

const SCHEMA_VERSION=1;
const ROLLOUT_VERSION='10.56.0';
const MODULES=Object.freeze([
  ['OfflineOutboxStore','offline-outbox-store','offline-outbox-store.js'],
  ['OfflineSyncShadow','offline-sync-shadow','offline-sync-shadow.js'],
  ['OfflineSyncMetadataShadow','offline-sync-metadata-shadow','offline-sync-metadata-shadow.js'],
  ['OfflineSyncMetadataAuthority','offline-sync-metadata-authority','offline-sync-metadata-authority.js'],
  ['OfflineSyncMetadataGraduation','offline-sync-metadata-graduation','offline-sync-metadata-graduation.js'],
  ['OfflineSyncMetadataRollout','offline-sync-metadata-rollout','offline-sync-metadata-rollout.js'],
  ['OfflineSyncMetadataStability','offline-sync-metadata-stability','offline-sync-metadata-stability.js'],
  ['OfflineSyncMetadataExpandedStability','offline-sync-metadata-expanded-stability','offline-sync-metadata-expanded-stability.js'],
  ['OfflineSyncMetadataExpandedPromotion','offline-sync-metadata-expanded-promotion','offline-sync-metadata-expanded-promotion.js'],
  ['OfflineSyncMetadataPromotedStability','offline-sync-metadata-promoted-stability','offline-sync-metadata-promoted-stability.js'],
  ['OfflineSyncMetadataPopulationPromotion','offline-sync-metadata-population-promotion','offline-sync-metadata-population-promotion.js'],
  ['OfflineSyncMetadataPopulationPromotedStability','offline-sync-metadata-population-promoted-stability','offline-sync-metadata-population-promoted-stability.js'],
  ['OfflineSyncMetadataRing2Promotion','offline-sync-metadata-ring2-promotion','offline-sync-metadata-ring2-promotion.js'],
  ['OfflineSyncMetadataRing2PromotedStability','offline-sync-metadata-ring2-promoted-stability','offline-sync-metadata-ring2-promoted-stability.js'],
  ['OfflineSyncMetadataRing3Promotion','offline-sync-metadata-ring3-promotion','offline-sync-metadata-ring3-promotion.js'],
  ['OfflineSyncMetadataExpansion','offline-sync-metadata-expansion','offline-sync-metadata-expansion.js'],
  ['OfflineSyncAuthority','offline-sync-authority','offline-sync-authority.js'],
  ['OfflineSyncDeleteAuthority','offline-sync-delete-authority','offline-sync-delete-authority.js'],
  ['OfflineSyncEditalGraduation','offline-sync-edital-graduation','offline-sync-edital-graduation.js']
].map(([globalName,marker,file])=>Object.freeze({globalName,marker,file,path:`./js/core/${file}?v=${ROLLOUT_VERSION}`})));

let installPromise=null;
let installed=false;
let lastError=null;
let installs=0;

function loadScript(definition){
  if(global[definition.globalName])return Promise.resolve(false);
  return new Promise((resolve,reject)=>{
    const selector=`script[data-offline-sync-module="${definition.marker}"]`;
    const existing=document.querySelector?.(selector);
    if(existing){
      if(global[definition.globalName]||existing.dataset.loaded==='1')return resolve(false);
      existing.addEventListener('load',()=>resolve(true),{once:true});
      existing.addEventListener('error',()=>reject(new Error(`Falha ao carregar ${definition.file}`)),{once:true});
      return;
    }
    const script=document.createElement('script');
    script.src=definition.path;
    script.async=false;
    script.dataset.offlineSyncModule=definition.marker;
    script.addEventListener('load',()=>{script.dataset.loaded='1';resolve(true)},{once:true});
    script.addEventListener('error',()=>reject(new Error(`Falha ao carregar ${definition.file}`)),{once:true});
    (document.head||document.documentElement).appendChild(script);
  });
}

async function install(options={}){
  if(installed&&!options.force)return getDiagnostics();
  if(installPromise)return installPromise;
  installPromise=(async()=>{
    lastError=null;
    for(const definition of MODULES){
      try{
        await loadScript(definition);
        global[definition.globalName]?.install?.();
      }catch(error){
        lastError=String(error?.message||error);
        if(options.strict)throw error;
        console.warn('Módulo offline incremental indisponível; legado preservado.',definition.file,error);
      }
    }
    installed=true;
    installs+=1;
    return getDiagnostics();
  })().finally(()=>{installPromise=null});
  return installPromise;
}

function moduleDiagnostics(definition){
  const api=global[definition.globalName];
  let diagnostics=null;
  try{diagnostics=api?.getDiagnostics?.()||null}catch(_){}
  return Object.freeze({
    globalName:definition.globalName,
    file:definition.file,
    rolloutVersion:ROLLOUT_VERSION,
    loaded:Boolean(api),
    diagnostics
  });
}
function getDiagnostics(){
  const modules=MODULES.map(moduleDiagnostics);
  return Object.freeze({
    schemaVersion:SCHEMA_VERSION,
    rolloutVersion:ROLLOUT_VERSION,
    installed,
    installRunning:Boolean(installPromise),
    installs,
    loaded:modules.filter(item=>item.loaded).length,
    total:modules.length,
    lastError,
    modules
  });
}

global.OfflineSyncCoordinator=Object.freeze({schemaVersion:SCHEMA_VERSION,rolloutVersion:ROLLOUT_VERSION,modules:MODULES,install,getDiagnostics});
global.dispatchEvent?.(new CustomEvent('offline-sync:coordinator-ready',{detail:{schemaVersion:SCHEMA_VERSION,rolloutVersion:ROLLOUT_VERSION}}));
})(window);

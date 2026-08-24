import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);
const replaceOnce=(src,from,to,label)=>{
  if(src.includes(to)) return src;
  if(!src.includes(from)) throw new Error(`anchor not found: ${label}`);
  return src.replace(from,to);
};

// 1) app-core: keep compatibility names but delegate storage/pure logic to extracted module.
{
  const p='public/js/app-core.js';
  let s=read(p);
  s=s.replace(/        function openLocalBackupDatabase\(\) \{[\s\S]*?\n        \}\n\n        async function readLocalBackup/, `        function openLocalBackupDatabase() {\n            return AppLocalBackupStore.openDatabase();\n        }\n\n        async function readLocalBackup`);
  s=s.replace(/        async function readLocalBackup\(slot = 'current'\) \{[\s\S]*?\n        \}\n\n        async function writeLocalBackup/, `        async function readLocalBackup(slot = 'current') {\n            return AppLocalBackupStore.read(currentUser?.id, slot);\n        }\n\n        async function writeLocalBackup`);
  s=s.replace(/        async function writeLocalBackup\(record\) \{[\s\S]*?\n        \}\n\n        function collectLegacyPomodoroState/, `        async function writeLocalBackup(record) {\n            return AppLocalBackupStore.write(record);\n        }\n\n        function collectLegacyPomodoroState`);
  s=s.replace(/        function backupFingerprint\(core\) \{[\s\S]*?\n        \}\n\n        async function createLocalBackupSnapshot/, `        function backupFingerprint(core) {\n            return AppLocalBackupStore.fingerprint(core);\n        }\n\n        async function createLocalBackupSnapshot`);
  s=s.replace(/        function countBackupStats\(snapshot\) \{[\s\S]*?\n        \}\n\n        function renderBackupSlot/, `        function countBackupStats(snapshot) {\n            return AppLocalBackupStore.countStats(snapshot);\n        }\n\n        function renderBackupSlot`);
  if(!s.includes('return AppLocalBackupStore.openDatabase();') || !s.includes('return AppLocalBackupStore.countStats(snapshot);')) throw new Error('app-core modularization failed');
  write(p,s);
}

// 2) index: load extracted module before app-core; preserve existing EOL bytes otherwise.
{
  const p='public/index.html';
  let s=read(p);
  const core='    <script src="./js/app-core.js" defer></script>';
  const mod='    <script src="./js/core/local-backup-store.js" defer></script>\n';
  if(!s.includes('./js/core/local-backup-store.js')) {
    if(!s.includes(core)) throw new Error('index app-core script anchor not found');
    s=s.replace(core,mod+core);
  }
  write(p,s);
}

// 3) release version.
for(const [p,from,to] of [
  ['package.json','"version": "10.27.0"','"version": "10.28.0"'],
  ['public/version.json','"version": "10.27.0"','"version": "10.28.0"'],
  ['public/sw.js',"const APP_VERSION = '10.27.0';","const APP_VERSION = '10.28.0';"],
  ['src/index.js','const APP_VERSION = "10.27.0";','const APP_VERSION = "10.28.0";']
]) {
  let s=read(p); s=replaceOnce(s,from,to,`${p} version`); write(p,s);
}

// 4) canonical asset manifest.
{
  const p='config/app-assets.json';
  const j=JSON.parse(read(p));
  j.version='10.28.0';
  const asset='/js/core/local-backup-store.js';
  for(const key of ['criticalAppShell','networkFirstPaths','workerNoStorePaths','headersNoStorePaths']) {
    const arr=j[key];
    if(!Array.isArray(arr)) throw new Error(`missing manifest array ${key}`);
    if(!arr.includes(asset)) {
      const idx=arr.indexOf('/js/app-core.js');
      if(idx>=0) arr.splice(idx,0,asset); else arr.push(asset);
    }
  }
  write(p,JSON.stringify(j,null,2)+'\n');
}

// 5) Service Worker cache/network-first.
{
  const p='public/sw.js'; let s=read(p);
  s=replaceOnce(s,"'./js/study-domain.js', './js/app-core.js'","'./js/study-domain.js', './js/core/local-backup-store.js', './js/app-core.js'",'sw critical shell');
  s=replaceOnce(s,"'/js/study-domain.js', '/js/app-core.js'","'/js/study-domain.js', '/js/core/local-backup-store.js', '/js/app-core.js'",'sw network first');
  write(p,s);
}

// 6) Cloudflare Worker no-store.
{
  const p='src/index.js'; let s=read(p);
  s=replaceOnce(s,'"/js/study-domain.js", "/js/app-core.js"','"/js/study-domain.js", "/js/core/local-backup-store.js", "/js/app-core.js"','worker no-store');
  write(p,s);
}

// 7) static headers no-store.
{
  const p='public/_headers'; let s=read(p);
  if(!s.includes('/js/core/local-backup-store.js')) {
    const anchor='/js/app-core.js\n  Cache-Control: no-cache, no-store, must-revalidate\n';
    const replacement='/js/core/local-backup-store.js\n  Cache-Control: no-cache, no-store, must-revalidate\n\n'+anchor;
    if(!s.includes(anchor)) throw new Error('_headers app-core anchor not found');
    s=s.replace(anchor,replacement);
  }
  write(p,s);
}

console.log('Phase 3/4 deterministic patch complete');

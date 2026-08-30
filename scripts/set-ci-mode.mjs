import fs from 'node:fs';

const target=process.argv[2];
if(!['normal','degraded'].includes(target)){
  console.error('Uso: node scripts/set-ci-mode.mjs <normal|degraded>');
  process.exit(2);
}

const files={
  quality:'.github/workflows/quality-check.yml',
  secrets:'.github/workflows/security-secrets-audit.yml',
  android:'.github/workflows/android-ci.yml',
};

function updateTrigger(file,enabled){
  let source=fs.readFileSync(file,'utf8');
  const isQuoted=source.startsWith('name: Android Check') && source.includes('"on":');
  const normal=isQuoted
    ? '"on":\n  pull_request:\n  workflow_dispatch:'
    : file.includes('quality-check')
      ? 'on:\n  push:\n    branches: [main]\n  pull_request:\n  workflow_dispatch:'
      : 'on:\n  push:\n    branches: [main]\n  pull_request:\n  workflow_dispatch:';
  const degraded=isQuoted
    ? '"on":\n  workflow_dispatch:'
    : file.includes('quality-check') || file.includes('security-secrets')
      ? 'on:\n  push:\n    branches: [main]\n  workflow_dispatch:'
      : 'on:\n  workflow_dispatch:';
  const from=enabled?degraded:normal;
  const to=enabled?normal:degraded;
  if(!source.includes(from)){
    console.error(`Trigger inesperado em ${file}; nenhuma alteração aplicada.`);
    process.exit(1);
  }
  source=source.replace(from,to);
  fs.writeFileSync(file,source);
}

updateTrigger(files.quality,target==='normal');
updateTrigger(files.secrets,target==='normal');
updateTrigger(files.android,target==='normal');

const configPath='config/ci-mode.json';
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
config.mode=target;
config.reason=target==='degraded'?'github_hosted_runners_unavailable':'github_hosted_runners_restored';
config.updatedAt=new Date().toISOString();
config.productionDeployAllowed=target==='normal';
fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');

console.log(`CI mode alterado para ${target}. Execute npm run audit antes de commit/push.`);
